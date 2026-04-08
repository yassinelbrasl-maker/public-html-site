<?php
// ============================================================
//  CORTOBA ATELIER — Stripe Checkout API
//  Paiement en ligne via Stripe Checkout Sessions
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

setCorsHeaders();

$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'create_session':
            $user = requireAuth();
            createSession($user);
            break;
        case 'webhook':
            handleWebhook();
            break;
        case 'status':
            $user = requireAuth();
            getPaymentStatus();
            break;
        case 'config':
            // Return public config (publishable key only)
            $user = requireAuth();
            getPublicConfig();
            break;
        default:
            jsonError('Action inconnue: ' . $action, 400);
    }
} catch (\Throwable $e) {
    jsonError('Erreur serveur: ' . $e->getMessage(), 500);
}

function getStripeConfig() {
    $db = getDB();
    $s = $db->prepare("SELECT valeur FROM CA_parametres WHERE cle = 'stripe_config'");
    $s->execute();
    $raw = $s->fetchColumn();
    $config = json_decode($raw ?: '{}', true);
    return $config;
}

function getPublicConfig() {
    $config = getStripeConfig();
    jsonOk([
        'enabled' => !empty($config['enabled']),
        'publishable_key' => $config['publishable_key'] ?? '',
    ]);
}

function createSession($user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError('POST requis', 405);

    $config = getStripeConfig();
    if (empty($config['enabled'])) jsonError('Les paiements en ligne ne sont pas activés');
    $secretKey = $config['secret_key'] ?? '';
    if (!$secretKey) jsonError('Clé Stripe non configurée');

    $body = getBody();
    $factureId = $body['facture_id'] ?? '';
    if (!$factureId) jsonError('facture_id requis');

    $db = getDB();
    $s = $db->prepare("SELECT f.*, c.display_nom AS client_nom, c.email AS client_email, p.code AS projet_code
        FROM CA_factures f
        LEFT JOIN CA_clients c ON c.id = f.client_id
        LEFT JOIN CA_projets p ON p.id = f.projet_id
        WHERE f.id = ?");
    $s->execute([$factureId]);
    $facture = $s->fetch(\PDO::FETCH_ASSOC);
    if (!$facture) jsonError('Facture introuvable', 404);

    if ($facture['statut'] === 'Payée') jsonError('Cette facture est déjà payée');

    $montantDu = (float)($facture['net_payer'] ?: $facture['montant_ttc']) - (float)($facture['montant_paye'] ?? 0);
    if ($montantDu <= 0) jsonError('Aucun montant restant à payer');

    // Stripe amount in millimes (TND uses 3 decimal places, but Stripe uses smallest unit)
    // For TND: 1 TND = 1000 millimes
    $stripeAmount = (int)round($montantDu * 1000);

    $successUrl = ($body['success_url'] ?? ($config['portal_url'] ?? '')) . '?payment=success&session_id={CHECKOUT_SESSION_ID}';
    $cancelUrl = ($body['cancel_url'] ?? ($config['portal_url'] ?? '')) . '?payment=cancel';

    $productName = 'Facture ' . ($facture['numero'] ?? $factureId);
    if ($facture['projet_code']) $productName .= ' - Projet ' . $facture['projet_code'];

    $postData = http_build_query([
        'payment_method_types[0]' => 'card',
        'mode' => 'payment',
        'success_url' => $successUrl,
        'cancel_url' => $cancelUrl,
        'line_items[0][price_data][currency]' => 'tnd',
        'line_items[0][price_data][unit_amount]' => $stripeAmount,
        'line_items[0][price_data][product_data][name]' => $productName,
        'line_items[0][quantity]' => 1,
        'metadata[facture_id]' => $factureId,
        'metadata[client_id]' => $facture['client_id'] ?? '',
        'metadata[projet_id]' => $facture['projet_id'] ?? '',
        'customer_email' => $facture['client_email'] ?? '',
    ]);

    $ch = curl_init('https://api.stripe.com/v1/checkout/sessions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $postData,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $secretKey,
            'Content-Type: application/x-www-form-urlencoded',
        ],
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $session = json_decode($response, true);
    if ($httpCode !== 200 || empty($session['id'])) {
        $error = $session['error']['message'] ?? 'Erreur Stripe inconnue';
        jsonError('Erreur Stripe: ' . $error, 502);
    }

    jsonOk([
        'session_id' => $session['id'],
        'url' => $session['url'],
    ]);
}

function handleWebhook() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError('POST requis', 405);

    $config = getStripeConfig();
    $webhookSecret = $config['webhook_secret'] ?? '';
    $payload = file_get_contents('php://input');

    // Verify Stripe signature if webhook secret is configured
    if ($webhookSecret) {
        $sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';
        $elements = [];
        foreach (explode(',', $sigHeader) as $part) {
            $kv = explode('=', $part, 2);
            if (count($kv) === 2) $elements[$kv[0]] = $kv[1];
        }

        $timestamp = $elements['t'] ?? '';
        $signature = $elements['v1'] ?? '';

        if (!$timestamp || !$signature) jsonError('Signature Stripe manquante', 400);

        $signedPayload = $timestamp . '.' . $payload;
        $expectedSig = hash_hmac('sha256', $signedPayload, $webhookSecret);

        if (!hash_equals($expectedSig, $signature)) {
            jsonError('Signature Stripe invalide', 400);
        }

        // Check timestamp is within tolerance (5 minutes)
        if (abs(time() - (int)$timestamp) > 300) {
            jsonError('Timestamp Stripe expiré', 400);
        }
    }

    $event = json_decode($payload, true);
    if (!$event || empty($event['type'])) jsonError('Événement invalide', 400);

    if ($event['type'] === 'checkout.session.completed') {
        $session = $event['data']['object'] ?? [];
        $factureId = $session['metadata']['facture_id'] ?? '';
        $sessionId = $session['id'] ?? '';

        if (!$factureId) {
            jsonOk(['received' => true, 'action' => 'skipped', 'reason' => 'no facture_id']);
            return;
        }

        $db = getDB();

        // Idempotency: check if payment already recorded
        $s = $db->prepare("SELECT id FROM CA_paiements WHERE stripe_session_id = ?");
        $s->execute([$sessionId]);
        if ($s->fetchColumn()) {
            jsonOk(['received' => true, 'action' => 'already_processed']);
            return;
        }

        // Get amount from session (in millimes for TND)
        $amountReceived = (float)($session['amount_total'] ?? 0) / 1000;
        $paymentIntent = $session['payment_intent'] ?? '';

        require_once __DIR__ . '/paiements.php';
        ensurePaiementsSchema();

        $paymentId = recordPayment($db, [
            'facture_id' => $factureId,
            'montant' => $amountReceived,
            'date_paiement' => date('Y-m-d'),
            'mode_paiement' => 'Stripe',
            'reference' => 'Stripe ' . substr($sessionId, 0, 20),
            'stripe_session_id' => $sessionId,
            'stripe_payment_intent' => $paymentIntent,
            'client_id' => $session['metadata']['client_id'] ?? null,
            'projet_id' => $session['metadata']['projet_id'] ?? null,
        ], 'Stripe Webhook');

        // Dispatch notification
        try {
            require_once __DIR__ . '/notification_dispatch.php';
            $s = $db->prepare("SELECT numero FROM CA_factures WHERE id = ?");
            $s->execute([$factureId]);
            $numero = $s->fetchColumn();

            $admins = $db->query("SELECT id FROM CA_accounts WHERE role = 'admin'")->fetchAll(\PDO::FETCH_COLUMN);
            foreach ($admins as $adminId) {
                dispatchNotification($db, $adminId, 'payment_received',
                    'Paiement Stripe reçu',
                    'Paiement de ' . number_format($amountReceived, 2, ',', ' ') . ' TND reçu via Stripe pour facture ' . $numero,
                    'creances', null, 'Stripe');
            }
        } catch (\Throwable $e) { /* non-critique */ }

        jsonOk(['received' => true, 'action' => 'payment_recorded', 'payment_id' => $paymentId]);
    } else {
        jsonOk(['received' => true, 'action' => 'ignored', 'type' => $event['type']]);
    }
}

function getPaymentStatus() {
    $sessionId = $_GET['session_id'] ?? '';
    if (!$sessionId) jsonError('session_id requis');

    $db = getDB();
    $s = $db->prepare("SELECT p.*, f.numero AS facture_numero, f.statut AS facture_statut
        FROM CA_paiements p LEFT JOIN CA_factures f ON f.id = p.facture_id
        WHERE p.stripe_session_id = ?");
    $s->execute([$sessionId]);
    $payment = $s->fetch(\PDO::FETCH_ASSOC);

    if ($payment) {
        jsonOk(['found' => true, 'payment' => $payment]);
    } else {
        jsonOk(['found' => false, 'message' => 'Paiement en cours de traitement...']);
    }
}
