<?php
// ============================================================
//  CORTOBA ATELIER — API Workflow
//  Actions transversales : conversion devis→facture,
//  génération PDF, solde projet, notifications
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

setCorsHeaders();
$user   = requireAuth();
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($action) {
        case 'devis_to_facture':
            if ($method !== 'POST') jsonError('POST requis', 405);
            devisToFacture($user);
            break;
        case 'projet_solde':
            if ($method !== 'GET') jsonError('GET requis', 405);
            getProjetSolde();
            break;
        case 'projets_soldes':
            if ($method !== 'GET') jsonError('GET requis', 405);
            getAllProjetsSoldes();
            break;
        case 'generate_pdf':
            if ($method !== 'GET') jsonError('GET requis', 405);
            generatePDF();
            break;
        case 'send_document':
            if ($method !== 'POST') jsonError('POST requis', 405);
            sendDocument($user);
            break;
        default:
            jsonError('Action inconnue: ' . $action, 400);
    }
} catch (\Throwable $e) {
    jsonError('Erreur serveur: ' . $e->getMessage(), 500);
}

// ═══════════════════════════════════════════════════════════════
//  DEVIS → FACTURE
// ═══════════════════════════════════════════════════════════════

function devisToFacture($user) {
    $body = getBody();
    $devisId = $body['devis_id'] ?? '';
    if (!$devisId) jsonError('devis_id requis');

    $db = getDB();

    // Get devis
    $s = $db->prepare("SELECT * FROM CA_devis WHERE id = ?");
    $s->execute([$devisId]);
    $devis = $s->fetch(\PDO::FETCH_ASSOC);
    if (!$devis) jsonError('Devis introuvable', 404);

    // Check devis is accepted
    if ($devis['statut'] !== 'Accepté' && !($body['force'] ?? false)) {
        jsonError('Le devis doit être accepté avant conversion. Utilisez force:true pour forcer.');
    }

    // Count existing factures for numbering
    $factCount = (int)$db->query("SELECT COUNT(*) FROM CA_factures")->fetchColumn();
    $factNumero = 'FA-' . date('Y') . '-' . str_pad($factCount + 1, 3, '0', STR_PAD_LEFT);

    $factureId = bin2hex(random_bytes(16));
    $montantHT  = (float)($devis['montant_ht'] ?? 0);
    $tva        = (float)($devis['tva'] ?? 0);
    $montantTTC = (float)($devis['montant_ttc'] ?? 0);

    // Get client address and MF if available
    $clientAdresse = ''; $clientMF = '';
    if ($devis['client_id']) {
        $sc = $db->prepare("SELECT adresse, mf, matricule FROM CA_clients WHERE id = ?");
        $sc->execute([$devis['client_id']]);
        $cli = $sc->fetch(\PDO::FETCH_ASSOC);
        if ($cli) {
            $clientAdresse = $cli['adresse'] ?? '';
            $clientMF = $cli['mf'] ?? ($cli['matricule'] ?? '');
        }
    }

    // Build lignes from devis notes (mission lines)
    $lignes = [];
    $notes = $devis['notes'] ?? '';
    if (preg_match_all('/^- (.+)$/m', $notes, $matches)) {
        $perLine = count($matches[1]) > 0 ? round($montantHT / count($matches[1]), 2) : $montantHT;
        foreach ($matches[1] as $i => $line) {
            $lignes[] = [
                'description' => trim($line),
                'quantite' => 1,
                'unite' => 'forfait',
                'prix_unitaire' => $perLine,
                'montant' => $perLine,
            ];
        }
    }
    if (empty($lignes)) {
        $lignes[] = [
            'description' => $devis['objet'] ?? 'Honoraires',
            'quantite' => 1,
            'unite' => 'forfait',
            'prix_unitaire' => $montantHT,
            'montant' => $montantHT,
        ];
    }

    // Timbre fiscal (1 TND for Tunisia)
    $timbre = 1.00;
    $netPayer = $montantTTC + $timbre;

    // RAS 10% for architects
    $rasTaux = (float)($body['ras_taux'] ?? 10);
    $rasAmt = round($montantHT * $rasTaux / 100, 2);
    $netPayer = $montantTTC + $timbre - $rasAmt;

    // Mission phase from body or null
    $missionPhase = $body['mission_phase'] ?? null;

    $db->prepare("
        INSERT INTO CA_factures (id, numero, client, client_id, projet_id,
            client_adresse, client_mf, objet,
            montant_ht, tva, montant_ttc,
            statut, date_facture, date_emission, date_echeance,
            lignes_json, timbre, ras_taux, ras_amt, net_payer,
            notes, mission_phase, cree_par)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ")->execute([
        $factureId, $factNumero,
        $devis['client'] ?? '', $devis['client_id'], $devis['projet_id'],
        $clientAdresse, $clientMF, $devis['objet'],
        $montantHT, $tva, $montantTTC,
        'Émise', date('Y-m-d'), date('Y-m-d'), date('Y-m-d', strtotime('+30 days')),
        json_encode($lignes, JSON_UNESCAPED_UNICODE),
        $timbre, $rasTaux, $rasAmt, $netPayer,
        $devis['notes'] ?? '', $missionPhase, $user['name'],
    ]);

    // Mark devis as converted
    $db->prepare("UPDATE CA_devis SET statut = 'Facturé' WHERE id = ?")->execute([$devisId]);

    // Refresh project honoraires if linked
    if ($devis['projet_id']) {
        try {
            require_once __DIR__ . '/honoraires.php';
            ensureHonorairesSchema();
            refreshProjetHonoraires($devis['projet_id']);
        } catch (\Throwable $e) {}
    }

    // Notify admins
    try {
        require_once __DIR__ . '/notification_dispatch.php';
        $admins = $db->query("SELECT id FROM CA_accounts WHERE role = 'admin'")->fetchAll(\PDO::FETCH_COLUMN);
        foreach ($admins as $adminId) {
            dispatchNotification($db, $adminId, 'success',
                'Facture créée depuis devis',
                'Facture ' . $factNumero . ' créée depuis devis ' . ($devis['numero'] ?? ''),
                'facturation', $factureId, $user['name']);
        }
    } catch (\Throwable $e) {}

    // Notify client by email
    try {
        $clientEmail = '';
        if ($devis['client_id']) {
            $sc = $db->prepare("SELECT email FROM CA_clients WHERE id = ?");
            $sc->execute([$devis['client_id']]);
            $clientEmail = $sc->fetchColumn() ?: '';
        }
        if ($clientEmail && filter_var($clientEmail, FILTER_VALIDATE_EMAIL)) {
            $subject = 'Facture ' . $factNumero . ' — CORTOBA Architecture';
            $html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <tr><td style="background:#1b1b1f;padding:20px 30px">
    <h1 style="color:#c8a96e;margin:0;font-size:18px">CORTOBA ATELIER D\'ARCHITECTURE</h1>
  </td></tr>
  <tr><td style="padding:30px">
    <h2 style="color:#222;margin:0 0 12px;font-size:16px">Nouvelle facture</h2>
    <p style="color:#555;line-height:1.6;font-size:14px">Bonjour,</p>
    <p style="color:#555;line-height:1.6;font-size:14px">Veuillez trouver ci-joint votre facture n° <strong>' . $factNumero . '</strong> d\'un montant de <strong>' . number_format($netPayer, 2, ',', ' ') . ' TND</strong>.</p>
    <p style="color:#555;line-height:1.6;font-size:14px">Échéance : ' . date('d/m/Y', strtotime('+30 days')) . '</p>
    <p style="color:#555;line-height:1.6;font-size:14px">Cordialement,<br><strong>CORTOBA Atelier d\'Architecture</strong></p>
  </td></tr>
</table></body></html>';
            $headers  = "MIME-Version: 1.0\r\n";
            $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
            $headers .= "From: CORTOBA Architecture <cortobaarchitecture@gmail.com>\r\n";
            @mail($clientEmail, $subject, $html, $headers);
        }
    } catch (\Throwable $e) {}

    $s = $db->prepare("SELECT * FROM CA_factures WHERE id = ?");
    $s->execute([$factureId]);
    jsonOk($s->fetch(\PDO::FETCH_ASSOC));
}

// ═══════════════════════════════════════════════════════════════
//  PROJECT BALANCE (SOLDE PROJET)
// ═══════════════════════════════════════════════════════════════

function getProjetSolde() {
    $projetId = $_GET['projet_id'] ?? '';
    if (!$projetId) jsonError('projet_id requis');

    $db = getDB();

    // Project info
    $s = $db->prepare("SELECT id, code, nom, client, honoraires_prevus, honoraires_factures, honoraires_encaisses FROM CA_projets WHERE id = ?");
    $s->execute([$projetId]);
    $projet = $s->fetch(\PDO::FETCH_ASSOC);
    if (!$projet) jsonError('Projet introuvable', 404);

    // Total devis accepted
    $s = $db->prepare("SELECT COALESCE(SUM(montant_ttc),0) FROM CA_devis WHERE projet_id = ? AND statut = 'Accepté'");
    $s->execute([$projetId]);
    $totalDevis = (float)$s->fetchColumn();

    // Total invoiced
    $s = $db->prepare("SELECT COALESCE(SUM(COALESCE(net_payer, montant_ttc, 0)),0) FROM CA_factures WHERE projet_id = ? AND statut != 'Annulée'");
    $s->execute([$projetId]);
    $totalFacture = (float)$s->fetchColumn();

    // Total paid
    $s = $db->prepare("SELECT COALESCE(SUM(p.montant),0) FROM CA_paiements p JOIN CA_factures f ON f.id = p.facture_id WHERE f.projet_id = ?");
    $s->execute([$projetId]);
    $totalPaye = (float)$s->fetchColumn();

    // Payments list
    $s = $db->prepare("SELECT p.id, p.montant, p.date_paiement, p.mode_paiement, p.reference, f.numero AS facture_numero
        FROM CA_paiements p
        JOIN CA_factures f ON f.id = p.facture_id
        WHERE f.projet_id = ?
        ORDER BY p.date_paiement DESC");
    $s->execute([$projetId]);
    $paiements = $s->fetchAll(\PDO::FETCH_ASSOC);

    $resteAPayer = $totalFacture - $totalPaye;
    $honorairesPrevus = (float)($projet['honoraires_prevus'] ?? 0);
    $nonFacture = $honorairesPrevus > 0 ? $honorairesPrevus - $totalFacture : 0;

    jsonOk([
        'projet' => $projet,
        'total_devis' => $totalDevis,
        'total_facture' => round($totalFacture, 2),
        'total_paye' => round($totalPaye, 2),
        'reste_a_payer' => round($resteAPayer, 2),
        'honoraires_prevus' => $honorairesPrevus,
        'non_facture' => round(max(0, $nonFacture), 2),
        'paiements' => $paiements,
        'avancement_paiement' => $totalFacture > 0 ? round($totalPaye / $totalFacture * 100) : 0,
    ]);
}

function getAllProjetsSoldes() {
    $db = getDB();

    $stmt = $db->query("
        SELECT p.id, p.code, p.nom, p.client, p.statut, p.phase,
            COALESCE(p.honoraires_prevus, 0) AS honoraires_prevus,
            COALESCE(p.honoraires_factures, 0) AS honoraires_factures,
            COALESCE(p.honoraires_encaisses, 0) AS honoraires_encaisses,
            COALESCE(p.honoraires_prevus, 0) - COALESCE(p.honoraires_factures, 0) AS non_facture,
            COALESCE(p.honoraires_factures, 0) - COALESCE(p.honoraires_encaisses, 0) AS reste_a_payer
        FROM CA_projets p
        WHERE p.statut IN ('En cours', 'Actif')
        ORDER BY reste_a_payer DESC
    ");
    $projets = $stmt->fetchAll(\PDO::FETCH_ASSOC);

    $totalPrevus = 0; $totalFacture = 0; $totalEncaisse = 0;
    foreach ($projets as $p) {
        $totalPrevus += (float)$p['honoraires_prevus'];
        $totalFacture += (float)$p['honoraires_factures'];
        $totalEncaisse += (float)$p['honoraires_encaisses'];
    }

    jsonOk([
        'projets' => $projets,
        'totaux' => [
            'prevus' => round($totalPrevus, 2),
            'facture' => round($totalFacture, 2),
            'encaisse' => round($totalEncaisse, 2),
            'non_facture' => round($totalPrevus - $totalFacture, 2),
            'reste_a_payer' => round($totalFacture - $totalEncaisse, 2),
        ],
    ]);
}

// ═══════════════════════════════════════════════════════════════
//  PDF GENERATION (HTML-based, client-rendered)
// ═══════════════════════════════════════════════════════════════

function generatePDF() {
    $type = $_GET['type'] ?? '';
    $id   = $_GET['id'] ?? '';
    if (!$type || !$id) jsonError('type et id requis');

    $db = getDB();

    // Load company info
    $companyInfo = [
        'nom' => 'CORTOBA Atelier d\'Architecture',
        'adresse' => 'Tunis, Tunisie',
        'email' => 'cortobaarchitecture@gmail.com',
        'mf' => '',
        'rib' => '',
    ];
    try {
        $s = $db->prepare("SELECT valeur FROM CA_parametres WHERE cle = 'entreprise'");
        $s->execute();
        $raw = $s->fetchColumn();
        if ($raw) {
            $parsed = json_decode($raw, true);
            if ($parsed) $companyInfo = array_merge($companyInfo, $parsed);
        }
    } catch (\Throwable $e) {}

    switch ($type) {
        case 'devis':
            $s = $db->prepare("SELECT d.*, c.display_nom AS client_nom, c.adresse AS client_adresse, c.mf AS client_mf, c.email AS client_email
                FROM CA_devis d LEFT JOIN CA_clients c ON c.id = d.client_id WHERE d.id = ?");
            $s->execute([$id]);
            $doc = $s->fetch(\PDO::FETCH_ASSOC);
            if (!$doc) jsonError('Devis introuvable', 404);
            $doc['_type'] = 'devis';
            $doc['_title'] = 'DEVIS N° ' . ($doc['numero'] ?? '');
            $doc['_company'] = $companyInfo;

            // Parse mission lines from notes
            $lignes = [];
            $notes = $doc['notes'] ?? '';
            if (preg_match_all('/^- (.+)$/m', $notes, $matches)) {
                $montantHT = (float)($doc['montant_ht'] ?? 0);
                $perLine = count($matches[1]) > 0 ? round($montantHT / count($matches[1]), 2) : $montantHT;
                foreach ($matches[1] as $line) {
                    $lignes[] = ['description' => trim($line), 'quantite' => 1, 'unite' => 'forfait', 'prix_unitaire' => $perLine, 'montant' => $perLine];
                }
            }
            $doc['_lignes'] = $lignes;
            jsonOk($doc);
            break;

        case 'facture':
            $s = $db->prepare("SELECT f.*, c.display_nom AS client_nom_full, c.email AS client_email
                FROM CA_factures f LEFT JOIN CA_clients c ON c.id = f.client_id WHERE f.id = ?");
            $s->execute([$id]);
            $doc = $s->fetch(\PDO::FETCH_ASSOC);
            if (!$doc) jsonError('Facture introuvable', 404);
            $doc['_type'] = 'facture';
            $doc['_title'] = 'FACTURE N° ' . ($doc['numero'] ?? '');
            $doc['_company'] = $companyInfo;

            // Parse lignes_json
            $lignes = json_decode($doc['lignes_json'] ?? '[]', true) ?: [];
            $doc['_lignes'] = $lignes;
            jsonOk($doc);
            break;

        case 'recu':
            $paiementId = $id;
            $s = $db->prepare("
                SELECT p.*,
                       f.numero AS facture_numero, f.objet AS facture_objet,
                       f.montant_ht, f.montant_ttc, f.net_payer, f.montant_paye,
                       c.display_nom AS client_nom, c.adresse AS client_adresse,
                       c.mf AS client_mf, c.email AS client_email,
                       pr.nom AS projet_nom, pr.code AS projet_code
                FROM CA_paiements p
                LEFT JOIN CA_factures f ON f.id = p.facture_id
                LEFT JOIN CA_clients c ON c.id = p.client_id
                LEFT JOIN CA_projets pr ON pr.id = p.projet_id
                WHERE p.id = ?
            ");
            $s->execute([$paiementId]);
            $doc = $s->fetch(\PDO::FETCH_ASSOC);
            if (!$doc) jsonError('Paiement introuvable', 404);

            // Total paid on this invoice
            $s2 = $db->prepare("SELECT COALESCE(SUM(montant),0) FROM CA_paiements WHERE facture_id = ?");
            $s2->execute([$doc['facture_id']]);
            $doc['total_paye_facture'] = (float)$s2->fetchColumn();

            $doc['_type'] = 'recu';
            $doc['_title'] = 'REÇU DE PAIEMENT';
            $doc['_company'] = $companyInfo;
            $doc['_lignes'] = [];

            // Compute remaining
            $netAPayer = (float)($doc['net_payer'] ?: $doc['montant_ttc']);
            $doc['_reste'] = round($netAPayer - $doc['total_paye_facture'], 2);

            jsonOk($doc);
            break;

        default:
            jsonError('Type inconnu: ' . $type . '. Types supportés: devis, facture, recu');
    }
}

// ═══════════════════════════════════════════════════════════════
//  SEND DOCUMENT BY EMAIL
// ═══════════════════════════════════════════════════════════════

function sendDocument($user) {
    $body = getBody();
    $type = $body['type'] ?? '';
    $id   = $body['id'] ?? '';
    $email = $body['email'] ?? '';
    $message = $body['message'] ?? '';
    $customSubject = $body['subject'] ?? '';

    if (!$type || !$id) jsonError('type et id requis');
    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) jsonError('Email valide requis');

    $db = getDB();

    // Get document info
    $docTitle = ''; $docNum = ''; $montant = 0; $lignesHtml = ''; $extraInfo = '';
    switch ($type) {
        case 'devis':
            $s = $db->prepare("SELECT numero, objet, montant_ttc FROM CA_devis WHERE id = ?");
            $s->execute([$id]);
            $d = $s->fetch(\PDO::FETCH_ASSOC);
            if (!$d) jsonError('Devis introuvable', 404);
            $docTitle = 'Devis'; $docNum = $d['numero']; $montant = (float)$d['montant_ttc'];
            break;
        case 'facture':
            $s = $db->prepare("SELECT numero, objet, net_payer, montant_ttc, montant_ht, tva, fodec, timbre,
                               ras_taux, ras_amt, date_echeance, client_adresse, rib, mode_paiement,
                               lignes_json, montant_lettres FROM CA_factures WHERE id = ?");
            $s->execute([$id]);
            $d = $s->fetch(\PDO::FETCH_ASSOC);
            if (!$d) jsonError('Facture introuvable', 404);
            $docTitle = 'Facture'; $docNum = $d['numero']; $montant = (float)($d['net_payer'] ?: $d['montant_ttc']);

            // Lignes de facture en tableau HTML
            $lignes = json_decode($d['lignes_json'] ?: '[]', true);
            if (!empty($lignes)) {
                $lignesHtml = '<table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:12px 0;font-size:13px">';
                $lignesHtml .= '<tr style="background:#f8f6f1"><th style="text-align:left;border-bottom:1px solid #ddd;padding:8px">Description</th><th style="text-align:right;border-bottom:1px solid #ddd;padding:8px">Montant HT</th></tr>';
                foreach ($lignes as $l) {
                    $desc = htmlspecialchars($l['desc'] ?? $l['description'] ?? $l['libelle'] ?? '');
                    $ht = number_format((float)($l['ht'] ?? $l['montant_ht'] ?? $l['montant'] ?? 0), 2, ',', ' ');
                    $lignesHtml .= '<tr><td style="border-bottom:1px solid #eee;padding:8px">' . $desc . '</td><td style="text-align:right;border-bottom:1px solid #eee;padding:8px">' . $ht . ' TND</td></tr>';
                }
                $lignesHtml .= '</table>';
            }

            // Infos supplementaires
            $parts = [];
            if ($d['date_echeance']) $parts[] = '<strong>Date d\'echéance :</strong> ' . date('d/m/Y', strtotime($d['date_echeance']));
            if ($d['montant_ht'])    $parts[] = '<strong>Montant HT :</strong> ' . number_format((float)$d['montant_ht'], 2, ',', ' ') . ' TND';
            if ($d['tva'])           $parts[] = '<strong>TVA :</strong> ' . $d['tva'] . '%';
            if ((float)($d['fodec'] ?? 0) > 0) $parts[] = '<strong>FODEC :</strong> ' . number_format((float)$d['fodec'], 2, ',', ' ') . ' TND';
            if ((float)($d['timbre'] ?? 0) > 0) $parts[] = '<strong>Timbre :</strong> ' . number_format((float)$d['timbre'], 2, ',', ' ') . ' TND';
            if ((float)($d['ras_amt'] ?? 0) > 0) $parts[] = '<strong>RAS (' . $d['ras_taux'] . '%) :</strong> -' . number_format((float)$d['ras_amt'], 2, ',', ' ') . ' TND';
            if ($d['montant_lettres']) $parts[] = '<strong>Montant en lettres :</strong> ' . htmlspecialchars($d['montant_lettres']);
            if ($d['mode_paiement']) $parts[] = '<strong>Mode de paiement :</strong> ' . htmlspecialchars($d['mode_paiement']);
            if ($d['rib']) $parts[] = '<strong>RIB :</strong> ' . htmlspecialchars($d['rib']);
            if (!empty($parts)) {
                $extraInfo = '<div style="background:#faf9f7;border-radius:6px;padding:12px 16px;margin:12px 0;font-size:13px;color:#555;line-height:1.8">' . implode('<br>', $parts) . '</div>';
            }
            break;
        case 'recu':
            $s = $db->prepare("SELECT p.montant, f.numero FROM CA_paiements p LEFT JOIN CA_factures f ON f.id = p.facture_id WHERE p.id = ?");
            $s->execute([$id]);
            $d = $s->fetch(\PDO::FETCH_ASSOC);
            if (!$d) jsonError('Reçu introuvable', 404);
            $docTitle = 'Reçu de paiement'; $docNum = 'Facture ' . ($d['numero'] ?? ''); $montant = (float)$d['montant'];
            break;
        default:
            jsonError('Type inconnu');
    }

    $subject = $customSubject ?: ($docTitle . ' ' . $docNum . ' — CORTOBA Architecture');
    $customMsg = $message ? '<p style="color:#555;line-height:1.6;font-size:14px;white-space:pre-wrap">' . htmlspecialchars($message) . '</p>' : '';

    $html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <tr><td style="background:#1b1b1f;padding:20px 30px">
    <h1 style="color:#c8a96e;margin:0;font-size:18px">CORTOBA ATELIER D\'ARCHITECTURE</h1>
  </td></tr>
  <tr><td style="padding:30px">
    <h2 style="color:#222;margin:0 0 12px;font-size:16px">' . htmlspecialchars($docTitle) . ' — ' . htmlspecialchars($docNum) . '</h2>
    ' . $customMsg . '
    ' . $lignesHtml . '
    ' . $extraInfo . '
    <p style="color:#555;line-height:1.6;font-size:14px"><strong>Net à payer : ' . number_format($montant, 2, ',', ' ') . ' TND</strong></p>
    <p style="color:#555;line-height:1.6;font-size:14px;margin-top:20px;padding-top:16px;border-top:1px solid #eee">Cordialement,<br><strong>CORTOBA Atelier d\'Architecture</strong></p>
  </td></tr>
</table></body></html>';

    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: CORTOBA Architecture <cortobaarchitecture@gmail.com>\r\n";
    $sent = @mail($email, '=?UTF-8?B?' . base64_encode($subject) . '?=', $html, $headers);

    jsonOk(['sent' => $sent, 'email' => $email, 'type' => $type, 'numero' => $docNum]);
}
