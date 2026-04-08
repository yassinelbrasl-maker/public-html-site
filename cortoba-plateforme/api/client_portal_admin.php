<?php
// ═══════════════════════════════════════════════════════════════
//  api/client_portal_admin.php — Gestion comptes clients (equipe)
//  Actions admin : creer/lister/modifier/supprimer comptes clients,
//  publier documents, demander validations
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';
require_once __DIR__ . '/client_portal.php';

$user   = requireAuth();
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($action) {
        case 'create_account':      cpaCreateAccount($user); break;
        case 'list_accounts':       cpaListAccounts($user); break;
        case 'update_account':      cpaUpdateAccount($user); break;
        case 'delete_account':      cpaDeleteAccount($user); break;
        case 'publish_document':    cpaPublishDocument($user); break;
        case 'request_validation':  cpaRequestValidation($user); break;
        case 'client_documents':    cpaClientDocuments($user); break;
        case 'client_validations':  cpaClientValidations($user); break;
        case 'publish_document_url': cpaPublishDocumentUrl($user); break;
        case 'client_chat_rooms':   cpaClientChatRooms($user); break;
        case 'client_chat_messages': cpaClientChatMessages($user); break;
        case 'client_chat_send':    cpaClientChatSend($user); break;
        case 'access_log':          cpaAccessLog($user); break;
        default: jsonError('Action inconnue', 404);
    }
} catch (\Throwable $e) {
    jsonError('Erreur admin portail : ' . $e->getMessage(), 500);
}

// ═══════════════════════════════════════════════════════════════
//  COMPTES CLIENTS
// ═══════════════════════════════════════════════════════════════

function cpaCreateAccount($user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError('POST requis', 405);
    $body = getBody();

    $clientId = $body['client_id'] ?? '';
    $email    = strtolower(trim($body['email'] ?? ''));
    $nom      = trim($body['nom'] ?? '');
    $password = $body['password'] ?? '';

    if (!$clientId) jsonError('client_id requis');
    if (!$email)    jsonError('email requis');
    if (!$nom)      jsonError('nom requis');
    if (strlen($password) < 6) jsonError('Mot de passe minimum 6 caracteres');

    $db = getDB();

    // Verifier que le client existe
    $stmt = $db->prepare("SELECT id, display_nom FROM CA_clients WHERE id = ?");
    $stmt->execute([$clientId]);
    if (!$stmt->fetch()) jsonError('Client introuvable', 404);

    // Verifier doublon email
    $stmt = $db->prepare("SELECT id FROM CA_client_accounts WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) jsonError('Email deja utilise');

    $id = cpGenId();
    $db->prepare("INSERT INTO CA_client_accounts (id, client_id, email, password_hash, nom, statut)
                  VALUES (?, ?, ?, ?, ?, 'actif')")
       ->execute([$id, $clientId, $email, password_hash($password, PASSWORD_BCRYPT), $nom]);

    jsonOk([
        'id'        => $id,
        'client_id' => $clientId,
        'email'     => $email,
        'nom'       => $nom,
        'statut'    => 'actif',
    ], 201);
}

function cpaListAccounts($user) {
    $db = getDB();
    $clientId = $_GET['client_id'] ?? '';

    $sql = "SELECT a.id, a.client_id, a.email, a.nom, a.statut, a.last_login, a.cree_at,
                   c.display_nom AS client_display, c.code AS client_code
            FROM CA_client_accounts a
            LEFT JOIN CA_clients c ON c.id COLLATE utf8mb4_unicode_ci = a.client_id";
    $params = [];

    if ($clientId) {
        $sql .= " WHERE a.client_id = ?";
        $params[] = $clientId;
    }

    $sql .= " ORDER BY a.cree_at DESC";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function cpaUpdateAccount($user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'PUT' && $_SERVER['REQUEST_METHOD'] !== 'PATCH') jsonError('PUT/PATCH requis', 405);
    $id = $_GET['id'] ?? '';
    if (!$id) jsonError('id requis');

    $body = getBody();
    $db   = getDB();

    $sets   = [];
    $params = [];

    if (isset($body['nom']))    { $sets[] = "nom = ?";    $params[] = trim($body['nom']); }
    if (isset($body['email']))  { $sets[] = "email = ?";  $params[] = strtolower(trim($body['email'])); }
    if (isset($body['statut'])) { $sets[] = "statut = ?"; $params[] = $body['statut']; }
    if (isset($body['password']) && strlen($body['password']) >= 6) {
        $sets[] = "password_hash = ?";
        $params[] = password_hash($body['password'], PASSWORD_BCRYPT);
    }

    if (empty($sets)) jsonError('Rien a modifier');
    $params[] = $id;

    $db->prepare("UPDATE CA_client_accounts SET " . implode(', ', $sets) . " WHERE id = ?")
       ->execute($params);

    jsonOk(['message' => 'Compte mis a jour']);
}

function cpaDeleteAccount($user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') jsonError('DELETE requis', 405);
    $id = $_GET['id'] ?? '';
    if (!$id) jsonError('id requis');

    $db = getDB();
    $db->prepare("DELETE FROM CA_client_accounts WHERE id = ?")->execute([$id]);
    jsonOk(['message' => 'Compte supprime']);
}

// ═══════════════════════════════════════════════════════════════
//  DOCUMENTS
// ═══════════════════════════════════════════════════════════════

function cpaPublishDocument($user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError('POST requis', 405);

    $projetId   = $_POST['projet_id'] ?? '';
    $clientId   = $_POST['client_id'] ?? '';
    $titre      = trim($_POST['titre'] ?? '');
    $categorie  = $_POST['categorie'] ?? 'livrable';
    $phase      = $_POST['phase'] ?? null;
    $description= $_POST['description'] ?? null;

    if (!$projetId || !$clientId || !$titre) jsonError('projet_id, client_id et titre requis');

    if (empty($_FILES['file'])) jsonError('Aucun fichier');
    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) jsonError('Erreur upload: code ' . $file['error']);
    if ($file['size'] > 20 * 1024 * 1024) jsonError('Max 20 Mo');

    $allowed = ['jpg','jpeg','png','pdf','doc','docx','xls','xlsx','pptx','dwg','dxf','zip','rar'];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed)) jsonError('Format non supporte');

    $uploadDir = realpath(__DIR__ . '/../../') . '/img/client_docs/';
    if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);

    $filename = 'cdoc_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    $dest = $uploadDir . $filename;
    if (!move_uploaded_file($file['tmp_name'], $dest)) jsonError("Erreur d'enregistrement");

    // Gestion du versioning
    $db = getDB();
    $version = 1;
    $parentId = null;

    // Chercher une version precedente (meme titre, meme projet)
    $stmt = $db->prepare("SELECT id, version FROM CA_client_documents
                          WHERE projet_id = ? AND client_id = ? AND titre = ?
                          ORDER BY version DESC LIMIT 1");
    $stmt->execute([$projetId, $clientId, $titre]);
    $prev = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($prev) {
        $version  = (int)$prev['version'] + 1;
        $parentId = $prev['id'];
        // Marquer l'ancien comme Remplace
        $db->prepare("UPDATE CA_client_documents SET statut = 'Remplace' WHERE id = ?")->execute([$prev['id']]);
    }

    $docId = cpGenId();
    $db->prepare("INSERT INTO CA_client_documents
                  (id, projet_id, client_id, categorie, titre, description, fichier_url, fichier_nom,
                   fichier_taille, version, parent_doc_id, phase, statut, uploaded_by, uploaded_by_type)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Nouveau', ?, 'team')")
       ->execute([$docId, $projetId, $clientId, $categorie, $titre, $description,
                  '/img/client_docs/' . $filename, $file['name'], $file['size'],
                  $version, $parentId, $phase, $user['name'] ?? 'Equipe']);

    jsonOk(['id' => $docId, 'version' => $version, 'url' => '/img/client_docs/' . $filename], 201);
}

function cpaRequestValidation($user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError('POST requis', 405);
    $body = getBody();

    $documentId = $body['document_id'] ?? null;
    $projetId   = $body['projet_id'] ?? '';
    $clientId   = $body['client_id'] ?? '';
    $type       = $body['type'] ?? 'document';
    $refId      = $body['reference_id'] ?? null;
    $refLabel   = $body['reference_label'] ?? null;

    if (!$projetId || !$clientId) jsonError('projet_id et client_id requis');

    $db = getDB();
    $id = cpGenId();
    $db->prepare("INSERT INTO CA_client_validations
                  (id, document_id, projet_id, client_id, type, reference_id, reference_label, statut)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'en_attente')")
       ->execute([$id, $documentId, $projetId, $clientId, $type, $refId, $refLabel]);

    // Mettre a jour le statut du document
    if ($documentId) {
        $db->prepare("UPDATE CA_client_documents SET statut = 'En attente validation' WHERE id = ?")
           ->execute([$documentId]);
    }

    jsonOk(['id' => $id], 201);
}

function cpaClientDocuments($user) {
    $clientId = $_GET['client_id'] ?? '';
    $projetId = $_GET['projet_id'] ?? '';

    $db = getDB();
    $sql = "SELECT d.*, p.code AS projet_code, p.nom AS projet_nom, c.display_nom AS client_display
            FROM CA_client_documents d
            LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = d.projet_id
            LEFT JOIN CA_clients c ON c.id COLLATE utf8mb4_unicode_ci = d.client_id WHERE 1=1";
    $params = [];

    if ($clientId) { $sql .= " AND d.client_id = ?"; $params[] = $clientId; }
    if ($projetId) { $sql .= " AND d.projet_id = ?"; $params[] = $projetId; }

    $sql .= " ORDER BY d.cree_at DESC";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function cpaClientValidations($user) {
    $clientId = $_GET['client_id'] ?? '';
    $statut   = $_GET['statut'] ?? '';

    $db = getDB();
    $sql = "SELECT v.*, d.titre AS doc_titre, p.code AS projet_code, p.nom AS projet_nom
            FROM CA_client_validations v
            LEFT JOIN CA_client_documents d ON d.id = v.document_id
            LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = v.projet_id WHERE 1=1";
    $params = [];

    if ($clientId) { $sql .= " AND v.client_id = ?"; $params[] = $clientId; }
    if ($statut)   { $sql .= " AND v.statut = ?";    $params[] = $statut; }

    $sql .= " ORDER BY v.cree_at DESC";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

// ═══════════════════════════════════════════════════════════════
//  PUBLIER DOCUMENT VIA URL (NAS ou externe)
// ═══════════════════════════════════════════════════════════════

function cpaPublishDocumentUrl($user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError('POST requis', 405);
    $body = getBody();

    $projetId    = $body['projet_id'] ?? '';
    $clientId    = $body['client_id'] ?? '';
    $titre       = trim($body['titre'] ?? '');
    $categorie   = $body['categorie'] ?? 'livrable';
    $phase       = $body['phase'] ?? null;
    $description = $body['description'] ?? null;
    $sourceUrl   = trim($body['source_url'] ?? '');
    $sourceType  = $body['source_type'] ?? 'url'; // 'nas' ou 'url'

    if (!$projetId || !$clientId || !$titre) jsonError('projet_id, client_id et titre requis');
    if (!$sourceUrl) jsonError('source_url requis');

    $db = getDB();

    // Determiner le nom du fichier depuis l'URL
    $fileName = basename(parse_url($sourceUrl, PHP_URL_PATH) ?: $titre);
    $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    if (!$ext) { $fileName .= '.pdf'; $ext = 'pdf'; }

    // Si NAS, tenter de telecharger le fichier
    $fichierUrl = $sourceUrl;
    $fichierTaille = 0;
    if ($sourceType === 'nas') {
        // Tenter le telechargement WebDAV/HTTP
        $uploadDir = realpath(__DIR__ . '/../../') . '/img/client_docs/';
        if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);
        $destName = 'cdoc_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $destPath = $uploadDir . $destName;

        $ctx = stream_context_create(['http' => [
            'timeout' => 30,
            'header'  => "Authorization: Basic " . base64_encode("CASNAS:Cortoba2026")
        ]]);
        $content = @file_get_contents($sourceUrl, false, $ctx);
        if ($content !== false) {
            file_put_contents($destPath, $content);
            $fichierUrl = '/img/client_docs/' . $destName;
            $fichierTaille = strlen($content);
            $fileName = $destName;
        }
        // Si echec, on garde l'URL NAS comme reference
    }

    // Gestion du versioning
    $version = 1;
    $parentId = null;
    $stmt = $db->prepare("SELECT id, version FROM CA_client_documents
                          WHERE projet_id = ? AND client_id = ? AND titre = ?
                          ORDER BY version DESC LIMIT 1");
    $stmt->execute([$projetId, $clientId, $titre]);
    $prev = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($prev) {
        $version  = (int)$prev['version'] + 1;
        $parentId = $prev['id'];
        $db->prepare("UPDATE CA_client_documents SET statut = 'Remplace' WHERE id = ?")->execute([$prev['id']]);
    }

    $docId = cpGenId();
    $db->prepare("INSERT INTO CA_client_documents
                  (id, projet_id, client_id, categorie, titre, description, fichier_url, fichier_nom,
                   fichier_taille, version, parent_doc_id, phase, statut, uploaded_by, uploaded_by_type)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Nouveau', ?, 'team')")
       ->execute([$docId, $projetId, $clientId, $categorie, $titre, $description,
                  $fichierUrl, $fileName, $fichierTaille,
                  $version, $parentId, $phase, $user['name'] ?? 'Equipe']);

    jsonOk(['id' => $docId, 'version' => $version, 'url' => $fichierUrl], 201);
}

// ═══════════════════════════════════════════════════════════════
//  MESSAGERIE CLIENT (vue admin)
// ═══════════════════════════════════════════════════════════════

function cpaClientChatRooms($user) {
    $db = getDB();
    $stmt = $db->prepare("
        SELECT r.id, r.name, r.projet_id, r.is_archived, r.cree_at,
               p.code AS projet_code, p.nom AS projet_nom,
               c.display_nom AS client_display,
               (SELECT COUNT(*) FROM CA_chat_messages m WHERE m.room_id = r.id) AS msg_count,
               (SELECT m2.cree_at FROM CA_chat_messages m2 WHERE m2.room_id = r.id ORDER BY m2.cree_at DESC LIMIT 1) AS last_msg_at,
               (SELECT COUNT(*) FROM CA_chat_messages m3 WHERE m3.room_id = r.id AND m3.sender_id LIKE 'client_%'
                AND m3.cree_at > COALESCE((SELECT MAX(m4.cree_at) FROM CA_chat_messages m4 WHERE m4.room_id = r.id AND m4.sender_id NOT LIKE 'client_%'), '1970-01-01')) AS unread_count
        FROM CA_chat_rooms r
        LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = r.projet_id
        LEFT JOIN CA_clients c ON c.code = p.client_code COLLATE utf8mb4_unicode_ci
        WHERE r.type = 'client'
        ORDER BY last_msg_at DESC
    ");
    $stmt->execute();
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function cpaClientChatMessages($user) {
    $roomId = $_GET['room_id'] ?? '';
    if (!$roomId) jsonError('room_id requis');

    $db = getDB();
    // Verifier que c'est bien une room client
    $stmt = $db->prepare("SELECT id FROM CA_chat_rooms WHERE id = ? AND type = 'client'");
    $stmt->execute([$roomId]);
    if (!$stmt->fetch()) jsonError('Room non trouvee', 404);

    $limit = min((int)($_GET['limit'] ?? 100), 200);
    $stmt = $db->prepare("SELECT id, sender_id, sender_name, kind, content, attachment_url, attachment_name, cree_at
                          FROM CA_chat_messages WHERE room_id = ?
                          ORDER BY cree_at ASC LIMIT $limit");
    $stmt->execute([$roomId]);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function cpaClientChatSend($user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError('POST requis', 405);
    $body   = getBody();
    $roomId  = $body['room_id'] ?? '';
    $content = trim($body['content'] ?? '');
    if (!$roomId || !$content) jsonError('room_id et content requis');

    $db = getDB();
    $stmt = $db->prepare("SELECT id, is_archived FROM CA_chat_rooms WHERE id = ? AND type = 'client'");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$room) jsonError('Room non trouvee', 404);
    if ($room['is_archived']) jsonError('Discussion archivee', 403);

    $msgId = cpGenId();
    $senderName = $user['name'] ?? $user['prenom'] ?? 'Équipe';
    $db->prepare("INSERT INTO CA_chat_messages (id, room_id, sender_id, sender_name, kind, content)
                  VALUES (?, ?, ?, ?, 'text', ?)")
       ->execute([$msgId, $roomId, 'team_' . ($user['id'] ?? ''), $senderName, $content]);

    jsonOk(['id' => $msgId]);
}

// ═══════════════════════════════════════════════════════════════
//  JOURNAL D'ACCES (admin)
// ═══════════════════════════════════════════════════════════════

function cpaAccessLog($user) {
    $page     = max(1, intval($_GET['page'] ?? 1));
    $clientId = $_GET['client_id'] ?? '';
    $limit    = 40;
    $offset   = ($page - 1) * $limit;

    $db = getDB();

    $where = '';
    $params = [];
    if ($clientId) {
        $where = 'WHERE l.client_id = ?';
        $params[] = $clientId;
    }

    // Total
    $stmt = $db->prepare("SELECT COUNT(*) FROM CA_client_activity_log l $where");
    $stmt->execute($params);
    $total = (int) $stmt->fetchColumn();

    // Entries
    $stmt = $db->prepare("
        SELECT l.action, l.details, l.ip_address, l.cree_at,
               a.nom AS account_nom, a.email AS account_email,
               c.display_nom AS client_nom
        FROM CA_client_activity_log l
        LEFT JOIN CA_client_accounts a ON a.id = l.account_id
        LEFT JOIN CA_clients c ON c.id COLLATE utf8mb4_unicode_ci = l.client_id
        $where
        ORDER BY l.cree_at DESC
        LIMIT $limit OFFSET $offset
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$r) {
        if ($r['details']) $r['details'] = json_decode($r['details'], true);
    }

    // Client list for filter
    $clients = $db->query("
        SELECT DISTINCT c.id, c.display_nom
        FROM CA_client_activity_log l
        JOIN CA_clients c ON c.id COLLATE utf8mb4_unicode_ci = l.client_id
        ORDER BY c.display_nom
    ")->fetchAll(PDO::FETCH_ASSOC);

    jsonOk([
        'entries'     => $rows,
        'total'       => $total,
        'page'        => $page,
        'total_pages' => max(1, ceil($total / $limit)),
        'clients'     => $clients,
    ]);
}
