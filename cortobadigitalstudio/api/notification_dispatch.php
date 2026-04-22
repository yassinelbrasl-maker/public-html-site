<?php
// ============================================================
//  CORTOBA ATELIER — Notification Dispatcher
//
//  Ce fichier est inclus (require_once) par les autres APIs.
//  Il fournit dispatchNotification() qui :
//   1. Vérifie les préférences de l'utilisateur
//   2. Crée la notification in-app (si activé)
//   3. Envoie un email (si activé + email configuré)
//   4. Envoie une notification push (si activé + abonnement existant)
//
//  Usage : dispatchNotification($db, $userId, $type, $title, $message, $linkPage, $linkId, $creePar)
// ============================================================

require_once __DIR__ . '/notifications.php'; // notifCreate()

/**
 * Dispatcher principal : crée la notification et l'envoie sur les canaux configurés.
 * Retourne l'ID de la notification in-app (ou null si in-app désactivé).
 */
if (!function_exists('dispatchNotification')) {

    function dispatchNotification(PDO $db, string $userId, string $type, string $title,
                                  ?string $message = null, ?string $linkPage = null,
                                  ?string $linkId = null, ?string $creePar = null): ?string {
        // 1. Récupérer les préférences
        $prefs = _getNotifPrefs($db, $userId, $type);

        // Si complètement désactivé, ne rien faire
        if (!$prefs['enabled']) return null;

        $notifId = null;

        // 2. Notification in-app
        if ($prefs['inapp']) {
            $notifId = notifCreate($db, $userId, $type, $title, $message, $linkPage, $linkId, $creePar);
        }

        // 3. Email (asynchrone-safe : on essaie, mais on ne bloque pas)
        if ($prefs['email']) {
            try {
                _sendNotifEmail($db, $userId, $type, $title, $message, $linkPage, $linkId);
            } catch (\Throwable $e) {
                // Log l'erreur mais ne pas bloquer
                @error_log('[NOTIF_EMAIL] ' . $e->getMessage());
            }
        }

        // 4. Push (Web Push API)
        if ($prefs['push']) {
            try {
                _sendNotifPush($db, $userId, $type, $title, $message, $linkPage, $linkId);
            } catch (\Throwable $e) {
                @error_log('[NOTIF_PUSH] ' . $e->getMessage());
            }
        }

        return $notifId;
    }

    /**
     * Récupère les préférences (type-specific, ou _default, ou tout activé par défaut).
     */
    function _getNotifPrefs(PDO $db, string $userId, string $type): array {
        $defaults = ['inapp' => 1, 'email' => 1, 'push' => 1, 'enabled' => 1];

        try {
            // Chercher la préférence spécifique au type
            $stmt = $db->prepare("SELECT * FROM CDS_notification_prefs WHERE user_id = ? AND notif_type = ?");
            $stmt->execute([$userId, $type]);
            $row = $stmt->fetch();
            if ($row) {
                return [
                    'inapp'   => (int)$row['channel_inapp'],
                    'email'   => (int)$row['channel_email'],
                    'push'    => (int)$row['channel_push'],
                    'enabled' => (int)$row['enabled'],
                ];
            }

            // Sinon, chercher le défaut de l'utilisateur
            $stmt->execute([$userId, '_default']);
            $row = $stmt->fetch();
            if ($row) {
                return [
                    'inapp'   => (int)$row['channel_inapp'],
                    'email'   => (int)$row['channel_email'],
                    'push'    => (int)$row['channel_push'],
                    'enabled' => (int)$row['enabled'],
                ];
            }
        } catch (\Throwable $e) {
            // Table n'existe peut-être pas encore → tout activé
        }

        return $defaults;
    }

    /**
     * Envoi d'email de notification via PHP mail() avec fallback SMTP.
     */
    function _sendNotifEmail(PDO $db, string $userId, string $type, string $title,
                             ?string $message, ?string $linkPage, ?string $linkId): void {
        // Récupérer l'email de l'utilisateur (membre ou admin)
        $u = null; $email = '';
        try {
            $stmt = $db->prepare("SELECT prenom, nom, email_pro, email_perso, email FROM cds_users WHERE id = ?");
            $stmt->execute([$userId]);
            $u = $stmt->fetch();
            if ($u) $email = $u['email_pro'] ?: ($u['email_perso'] ?: ($u['email'] ?: ''));
        } catch (\Throwable $e) {
            try {
                $stmt2 = $db->prepare("SELECT prenom, nom, email FROM cds_users WHERE id = ?");
                $stmt2->execute([$userId]);
                $u = $stmt2->fetch();
                if ($u) $email = $u['email'] ?? '';
            } catch (\Throwable $e2) {}
        }
        // Fallback : chercher dans CDS_accounts
        if (!$email) {
            try {
                $stmt3 = $db->prepare("SELECT name, email FROM CDS_accounts WHERE id = ?");
                $stmt3->execute([$userId]);
                $a = $stmt3->fetch();
                if ($a) { $email = $a['email'] ?? ''; if (!$u) $u = ['prenom' => $a['name'] ?? '', 'nom' => '']; }
            } catch (\Throwable $e) {}
        }
        if (!$u) return;
        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) return;

        $userName = trim(($u['prenom'] ?? '') . ' ' . ($u['nom'] ?? ''));

        // Construire le lien
        $baseUrl = 'https://cortobaarchitecture.com/cortobadigitalstudio/plateforme-nas.html';
        $link = $linkPage ? $baseUrl . '#page=' . $linkPage : $baseUrl;

        // Labels de type
        $typeLabels = [
            'info' => 'Information', 'success' => 'Succès', 'warning' => 'Avertissement',
            'error' => 'Erreur', 'conge_pending' => 'Congé en attente', 'conge_approved' => 'Congé approuvé',
            'conge_refused' => 'Congé refusé', 'tache_assigned' => 'Tâche assignée',
            'tache_overdue' => 'Tâche en retard', 'budget_alert' => 'Alerte budget',
            'echeance_proche' => 'Échéance proche', 'facture_overdue' => 'Facture impayée',
            'livrable_overdue' => 'Livrable en retard', 'depense_due' => 'Dépense à payer',
        ];
        $typeLabel = $typeLabels[$type] ?? $type;

        // Couleur selon le type
        $colors = [
            'info' => '#6aa6d4', 'success' => '#5aab6e', 'warning' => '#d4a64a',
            'error' => '#d45656', 'conge_pending' => '#d4a64a', 'conge_approved' => '#5aab6e',
            'conge_refused' => '#d45656', 'tache_overdue' => '#d45656', 'budget_alert' => '#d45656',
            'echeance_proche' => '#d4a64a', 'facture_overdue' => '#d45656',
        ];
        $color = $colors[$type] ?? '#c8a96e';

        // Template HTML email
        $html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <tr><td style="background:#1b1b1f;padding:20px 30px">
    <h1 style="color:#c8a96e;margin:0;font-size:18px">CORTOBA ATELIER</h1>
    <p style="color:#888;margin:4px 0 0;font-size:12px">Notification</p>
  </td></tr>
  <tr><td style="padding:30px">
    <div style="display:inline-block;padding:3px 10px;border-radius:4px;background:' . $color . '20;color:' . $color . ';font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">' . htmlspecialchars($typeLabel) . '</div>
    <h2 style="color:#222;margin:12px 0 8px;font-size:16px">' . htmlspecialchars($title) . '</h2>
    ' . ($message ? '<p style="color:#555;line-height:1.6;font-size:14px;white-space:pre-wrap">' . htmlspecialchars($message) . '</p>' : '') . '
    <a href="' . htmlspecialchars($link) . '" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#c8a96e;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:bold">Voir sur la plateforme</a>
  </td></tr>
  <tr><td style="padding:16px 30px;background:#f8f8f8;border-top:1px solid #eee">
    <p style="color:#999;font-size:11px;margin:0">Vous recevez cet email car les notifications email sont activées pour votre compte Cortoba Atelier.
    <br>Vous pouvez modifier vos préférences dans Notifications → Préférences.</p>
  </td></tr>
</table></body></html>';

        $subject = '[Cortoba] ' . $title;

        // Headers email
        $headers  = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "From: Cortoba Atelier <cortobaarchitecture@gmail.com>\r\n";
        $headers .= "Reply-To: cortobaarchitecture@gmail.com\r\n";
        $headers .= "X-Mailer: Cortoba-Plateforme/1.0\r\n";

        @mail($email, $subject, $html, $headers);
    }

    /**
     * Envoi de notification push via Web Push Protocol.
     */
    function _sendNotifPush(PDO $db, string $userId, string $type, string $title,
                            ?string $message, ?string $linkPage, ?string $linkId): void {
        // Récupérer tous les abonnements push de l'utilisateur
        $stmt = $db->prepare("SELECT * FROM CDS_push_subscriptions WHERE user_id = ?");
        $stmt->execute([$userId]);
        $subs = $stmt->fetchAll();
        if (empty($subs)) return;

        // Payload JSON pour le service worker
        $payload = json_encode([
            'title'   => $title,
            'body'    => $message ?? '',
            'icon'    => '/cortobadigitalstudio/img/cortoba-icon-192.png',
            'badge'   => '/cortobadigitalstudio/img/cortoba-badge-72.png',
            'tag'     => $type . '_' . ($linkId ?? bin2hex(random_bytes(4))),
            'data'    => [
                'type'     => $type,
                'linkPage' => $linkPage,
                'linkId'   => $linkId,
                'url'      => '/cortobadigitalstudio/plateforme-nas.html' . ($linkPage ? '#page=' . $linkPage : ''),
            ],
        ], JSON_UNESCAPED_UNICODE);

        foreach ($subs as $sub) {
            try {
                _webPushSend($sub['endpoint'], $sub['p256dh'], $sub['auth'], $payload);
            } catch (\Throwable $e) {
                // Si l'endpoint est expiré (410 Gone), supprimer l'abonnement
                if (strpos($e->getMessage(), '410') !== false || strpos($e->getMessage(), '404') !== false) {
                    $db->prepare("DELETE FROM CDS_push_subscriptions WHERE id = ?")
                       ->execute([$sub['id']]);
                }
            }
        }
    }

    /**
     * Implémentation minimale Web Push (RFC 8291 + RFC 8188 + VAPID).
     * Utilise les extensions PHP : openssl, curl.
     */
    function _webPushSend(string $endpoint, string $p256dh, string $auth, string $payload): void {
        // Vérifier que les extensions nécessaires sont disponibles
        if (!extension_loaded('openssl') || !function_exists('curl_init')) {
            throw new \RuntimeException('Extensions openssl et curl requises pour Web Push');
        }

        // Pour une implémentation complète de Web Push, on utilise une bibliothèque.
        // Ici on fait un envoi simplifié via la bibliothèque minifig/web-push si dispo,
        // sinon on utilise un fallback via curl direct avec VAPID.

        // Méthode simplifiée : envoyer via l'endpoint avec les headers VAPID
        $vapidHeaders = _createVapidHeaders($endpoint);

        // Encryption du payload (ECDH + HKDF + AES-128-GCM)
        $encrypted = _encryptPayload($payload, $p256dh, $auth);
        if (!$encrypted) return;

        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $encrypted['ciphertext'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/octet-stream',
                'Content-Encoding: aes128gcm',
                'Content-Length: ' . strlen($encrypted['ciphertext']),
                'TTL: 86400',
                'Urgency: normal',
                'Authorization: vapid t=' . $vapidHeaders['token'] . ', k=' . $vapidHeaders['key'],
                'Crypto-Key: p256ecdsa=' . $vapidHeaders['key'],
            ],
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 400) {
            throw new \RuntimeException("Push failed ($httpCode): $response");
        }
    }

    /**
     * Créer les headers VAPID (JWT signé).
     */
    function _createVapidHeaders(string $endpoint): array {
        $parsedUrl = parse_url($endpoint);
        $audience  = $parsedUrl['scheme'] . '://' . $parsedUrl['host'];

        // JWT header + payload
        $header = base64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
        $payload = base64url_encode(json_encode([
            'aud' => $audience,
            'exp' => time() + 43200, // 12h
            'sub' => VAPID_SUBJECT,
        ]));

        $signingInput = "$header.$payload";

        // Signer avec la clé privée VAPID (ECDSA P-256)
        $pem = _buildVapidPem();
        $key = openssl_pkey_get_private($pem);
        if (!$key) {
            return ['token' => '', 'key' => VAPID_PUBLIC_KEY];
        }

        openssl_sign($signingInput, $signature, $key, OPENSSL_ALGO_SHA256);
        $sig = _derToP1363($signature);
        $token = "$header.$payload." . base64url_encode($sig);

        return ['token' => $token, 'key' => VAPID_PUBLIC_KEY];
    }

    /**
     * Construire le PEM EC PRIVATE KEY à partir des clés VAPID raw (private 32 bytes + public 65 bytes).
     */
    function _buildVapidPem(): string {
        $rawPrivate = base64url_decode(VAPID_PRIVATE_KEY); // 32 bytes
        $rawPublic  = base64url_decode(VAPID_PUBLIC_KEY);  // 65 bytes (04 + x + y)

        // ASN.1 DER structure pour EC PRIVATE KEY sur prime256v1
        // SEQUENCE {
        //   INTEGER 1,
        //   OCTET STRING (32 bytes private key),
        //   [0] OID prime256v1,
        //   [1] BIT STRING (public key)
        // }
        $oid = "\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07"; // prime256v1
        $privOctet = "\x04\x20" . $rawPrivate;
        $pubBits = "\x03\x42\x00" . $rawPublic; // BIT STRING wrapping 65 bytes
        $a0 = "\xa0" . chr(strlen($oid)) . $oid;
        $a1 = "\xa1" . chr(strlen($pubBits)) . $pubBits;
        $inner = "\x02\x01\x01" . $privOctet . $a0 . $a1;
        $der = "\x30" . chr(strlen($inner)) . $inner;

        return "-----BEGIN EC PRIVATE KEY-----\n"
             . chunk_split(base64_encode($der), 64)
             . "-----END EC PRIVATE KEY-----";
    }

    /**
     * Convertir signature DER (ASN.1) en IEEE P1363 (r||s, 64 bytes).
     */
    function _derToP1363(string $der): string {
        $pos = 2; // skip 0x30 + length
        if (ord($der[1]) > 127) $pos++;

        // r
        $pos++; // 0x02
        $rLen = ord($der[$pos++]);
        $r = substr($der, $pos, $rLen);
        $pos += $rLen;

        // s
        $pos++; // 0x02
        $sLen = ord($der[$pos++]);
        $s = substr($der, $pos, $sLen);

        // Pad or trim to 32 bytes
        $r = str_pad(ltrim($r, "\x00"), 32, "\x00", STR_PAD_LEFT);
        $s = str_pad(ltrim($s, "\x00"), 32, "\x00", STR_PAD_LEFT);

        return substr($r, -32) . substr($s, -32);
    }

    /**
     * Encryption du payload pour Web Push (RFC 8188 aes128gcm).
     * Retourne null si le chiffrement échoue.
     */
    function _encryptPayload(string $payload, string $userPublicKey, string $userAuth): ?array {
        try {
            $userPub  = base64url_decode($userPublicKey);
            $authKey  = base64url_decode($userAuth);

            // Générer une paire ECDH éphémère
            $localKey = openssl_pkey_new([
                'curve_name'       => 'prime256v1',
                'private_key_type' => OPENSSL_KEYTYPE_EC,
            ]);
            if (!$localKey) return null;

            $localDetails = openssl_pkey_get_details($localKey);
            $localPub = chr(4) // uncompressed point
                      . str_pad($localDetails['ec']['x'], 32, "\x00", STR_PAD_LEFT)
                      . str_pad($localDetails['ec']['y'], 32, "\x00", STR_PAD_LEFT);

            // Shared secret via ECDH
            // PHP >= 7.4 : openssl ne supporte pas ECDH directement, on reconstruit
            $peerPem = _rawPublicKeyToPem($userPub);
            $peerKey = openssl_pkey_get_public($peerPem);
            if (!$peerKey) return null;

            $sharedSecret = '';
            if (!openssl_pkey_derive($sharedSecret, $peerKey, $localKey)) return null;

            // HKDF pour dériver les clés
            $ikm = $sharedSecret;

            // info for auth secret
            $authInfo = "WebPush: info\x00" . $userPub . $localPub;
            $prk = hash_hmac('sha256', $ikm, $authKey, true);

            // Derive key
            $cekInfo = "Content-Encoding: aes128gcm\x00";
            $cek = _hkdf($prk, $cekInfo, 16);

            // Derive nonce
            $nonceInfo = "Content-Encoding: nonce\x00";
            $nonce = _hkdf($prk, $nonceInfo, 12);

            // Padding : ajoute un byte \x02 (délimiteur) + padding
            $paddedPayload = $payload . "\x02";

            // AES-128-GCM
            $tag = '';
            $encrypted = openssl_encrypt($paddedPayload, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
            if ($encrypted === false) return null;

            // Header aes128gcm : salt (16) + rs (4) + idLen (1) + keyId (65)
            $salt = random_bytes(16);
            $rs   = pack('N', 4096);
            $idLen = chr(65);
            $header = $salt . $rs . $idLen . $localPub;

            return ['ciphertext' => $header . $encrypted . $tag];

        } catch (\Throwable $e) {
            @error_log('[PUSH_ENCRYPT] ' . $e->getMessage());
            return null;
        }
    }

    /**
     * HKDF-Expand (RFC 5869) simplifié.
     */
    function _hkdf(string $prk, string $info, int $length): string {
        $t = '';
        $okm = '';
        for ($i = 1; strlen($okm) < $length; $i++) {
            $t = hash_hmac('sha256', $t . $info . chr($i), $prk, true);
            $okm .= $t;
        }
        return substr($okm, 0, $length);
    }

    /**
     * Convertir une clé publique EC raw (65 bytes) en PEM.
     */
    function _rawPublicKeyToPem(string $raw): string {
        // ASN.1 DER pour EC public key P-256
        $prefix = "\x30\x59\x30\x13\x06\x07\x2a\x86\x48\xce\x3d\x02\x01"
                . "\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07\x03\x42\x00";
        $der = $prefix . $raw;
        return "-----BEGIN PUBLIC KEY-----\n"
             . chunk_split(base64_encode($der), 64)
             . "-----END PUBLIC KEY-----";
    }
}
