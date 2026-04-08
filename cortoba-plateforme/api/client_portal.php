<?php
// ═══════════════════════════════════════════════════════════════
//  api/client_portal.php — API Portail Client Cortoba
//  Toutes les actions client : auth, dashboard, docs, chat,
//  finance, validations, chantier, infos projet
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';

// ── Bootstrap : création idempotente des tables ──
clientPortalEnsureSchema();

// ── Si inclus par un autre fichier (ex: client_portal_admin.php), ne pas exécuter le routage ──
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') !== 'client_portal.php') {
    return; // Seules les fonctions sont exposées
}

// ── Actions publiques (sans auth) ──
$action = $_GET['action'] ?? '';
if (in_array($action, ['login', 'reset_password_request', 'reset_password'], true)) {
    if ($action === 'login')                  cpLogin();
    if ($action === 'reset_password_request') cpResetRequest();
    if ($action === 'reset_password')         cpResetConfirm();
    exit;
}

// ── Actions authentifiées ──
$client = requireClientAuth();

try {
    switch ($action) {
        // Auth / profil
        case 'me':                  cpMe($client); break;
        case 'change_password':     cpChangePassword($client); break;

        // Dashboard
        case 'dashboard':           cpDashboard($client); break;
        case 'projects':            cpProjects($client); break;
        case 'project_detail':      cpProjectDetail($client); break;
        case 'project_tasks':       cpProjectTasks($client); break;

        // Documents
        case 'documents':           cpDocuments($client); break;
        case 'document_download':   cpDocumentDownload($client); break;
        case 'document_upload':     cpDocumentUpload($client); break;
        case 'document_versions':   cpDocumentVersions($client); break;
        case 'document_comments':   cpDocumentComments($client); break;
        case 'document_comment':    cpDocumentComment($client); break;

        // Chat
        case 'chat_rooms':          cpChatRooms($client); break;
        case 'chat_messages':       cpChatMessages($client); break;
        case 'chat_send':           cpChatSend($client); break;

        // Finance
        case 'devis':               cpDevis($client); break;
        case 'factures':            cpFactures($client); break;

        // Validations
        case 'pending_validations': cpPendingValidations($client); break;
        case 'validate':            cpValidate($client); break;
        case 'validation_history':  cpValidationHistory($client); break;

        // Chantier
        case 'chantier_info':       cpChantierInfo($client); break;
        case 'chantier_photos':     cpChantierPhotos($client); break;
        case 'chantier_reunions':   cpChantierReunions($client); break;
        case 'chantier_reserves':   cpChantierReserves($client); break;

        // Infos projet
        case 'project_team':        cpProjectTeam($client); break;

        // Journal d'acces
        case 'access_log':          cpAccessLog($client); break;

        default: jsonError('Action inconnue', 404);
    }
} catch (\Throwable $e) {
    jsonError('Erreur portail : ' . $e->getMessage(), 500);
}

// ═══════════════════════════════════════════════════════════════
//  SCHEMA
// ═══════════════════════════════════════════════════════════════

function clientPortalEnsureSchema() {
    static $done = false;
    if ($done) return;
    $db = getDB();

    $db->exec("CREATE TABLE IF NOT EXISTS `CA_client_accounts` (
        `id`            VARCHAR(32)  NOT NULL PRIMARY KEY,
        `client_id`     VARCHAR(32)  NOT NULL,
        `email`         VARCHAR(191) NOT NULL,
        `password_hash` VARCHAR(255) NOT NULL,
        `nom`           VARCHAR(200) NOT NULL,
        `statut`        VARCHAR(30)  NOT NULL DEFAULT 'actif',
        `last_login`    DATETIME     DEFAULT NULL,
        `reset_token`   VARCHAR(64)  DEFAULT NULL,
        `reset_expires` DATETIME     DEFAULT NULL,
        `cree_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `modifie_at`    DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uq_email` (`email`),
        KEY `idx_client` (`client_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS `CA_client_documents` (
        `id`               VARCHAR(32)  NOT NULL PRIMARY KEY,
        `projet_id`        VARCHAR(32)  NOT NULL,
        `client_id`        VARCHAR(32)  NOT NULL,
        `categorie`        VARCHAR(60)  NOT NULL DEFAULT 'livrable',
        `titre`            VARCHAR(300) NOT NULL,
        `description`      TEXT         DEFAULT NULL,
        `fichier_url`      VARCHAR(500) NOT NULL,
        `fichier_nom`      VARCHAR(300) NOT NULL,
        `fichier_taille`   INT UNSIGNED DEFAULT 0,
        `version`          INT          NOT NULL DEFAULT 1,
        `parent_doc_id`    VARCHAR(32)  DEFAULT NULL,
        `phase`            VARCHAR(30)  DEFAULT NULL,
        `statut`           VARCHAR(40)  NOT NULL DEFAULT 'Nouveau',
        `uploaded_by`      VARCHAR(200) DEFAULT NULL,
        `uploaded_by_type` VARCHAR(10)  DEFAULT 'team',
        `cree_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `modifie_at`       DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        KEY `idx_projet`   (`projet_id`),
        KEY `idx_client`   (`client_id`),
        KEY `idx_statut`   (`statut`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS `CA_client_validations` (
        `id`             VARCHAR(32)  NOT NULL PRIMARY KEY,
        `document_id`    VARCHAR(32)  DEFAULT NULL,
        `projet_id`      VARCHAR(32)  NOT NULL,
        `client_id`      VARCHAR(32)  NOT NULL,
        `type`           VARCHAR(40)  NOT NULL DEFAULT 'document',
        `reference_id`   VARCHAR(32)  DEFAULT NULL,
        `reference_label` VARCHAR(300) DEFAULT NULL,
        `statut`         VARCHAR(30)  NOT NULL DEFAULT 'en_attente',
        `commentaire`    TEXT         DEFAULT NULL,
        `signature_data` LONGTEXT     DEFAULT NULL,
        `signe_par`      VARCHAR(200) DEFAULT NULL,
        `signe_at`       DATETIME     DEFAULT NULL,
        `cree_at`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `modifie_at`     DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        KEY `idx_document` (`document_id`),
        KEY `idx_projet`   (`projet_id`),
        KEY `idx_client`   (`client_id`),
        KEY `idx_statut`   (`statut`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS `CA_client_activity_log` (
        `id`         VARCHAR(32)  NOT NULL PRIMARY KEY,
        `client_id`  VARCHAR(32)  NOT NULL,
        `account_id` VARCHAR(32)  NOT NULL,
        `action`     VARCHAR(80)  NOT NULL,
        `details`    TEXT         DEFAULT NULL,
        `ip_address` VARCHAR(45)  DEFAULT NULL,
        `cree_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY `idx_client` (`client_id`),
        KEY `idx_date`   (`cree_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Colonne commentaires sur documents
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_client_doc_comments` (
        `id`          VARCHAR(32)  NOT NULL PRIMARY KEY,
        `document_id` VARCHAR(32)  NOT NULL,
        `author_name` VARCHAR(200) NOT NULL,
        `author_type` VARCHAR(10)  NOT NULL DEFAULT 'client',
        `content`     TEXT         NOT NULL,
        `cree_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY `idx_doc` (`document_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $done = true;
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

function requireClientAuth() {
    $payload = requireAuth();
    if (($payload['type'] ?? '') !== 'client') {
        jsonError('Acces client requis', 403);
    }
    return $payload;
}

function cpGenId() {
    return bin2hex(random_bytes(16));
}

function cpLogActivity($clientId, $accountId, $action, $details = null) {
    try {
        $db = getDB();
        $db->prepare("INSERT INTO CA_client_activity_log (id, client_id, account_id, action, details, ip_address)
                      VALUES (?, ?, ?, ?, ?, ?)")
           ->execute([cpGenId(), $clientId, $accountId, $action, $details ? json_encode($details) : null,
                      $_SERVER['REMOTE_ADDR'] ?? null]);
    } catch (\Throwable $e) { /* silencieux */ }
}

/** Retourne les IDs de projets accessibles par ce client */
function cpGetClientProjectIds($clientId) {
    $db = getDB();
    $stmt = $db->prepare("
        SELECT p.id FROM CA_projets p
        JOIN CA_clients c ON p.client_code = c.code COLLATE utf8mb4_unicode_ci
        WHERE c.id = ?
    ");
    $stmt->execute([$clientId]);
    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}

/** Retourne le code client depuis client_id */
function cpGetClientCode($clientId) {
    $db = getDB();
    $stmt = $db->prepare("SELECT code FROM CA_clients WHERE id = ? LIMIT 1");
    $stmt->execute([$clientId]);
    return $stmt->fetchColumn() ?: '';
}

/** Verifie qu'un projet_id appartient bien au client */
function cpVerifyProjectAccess($clientId, $projetId) {
    $ids = cpGetClientProjectIds($clientId);
    if (!in_array($projetId, $ids)) {
        jsonError('Projet non accessible', 403);
    }
}

/** Placeholder IN (?,?,?) */
function cpPlaceholders($arr) {
    return implode(',', array_fill(0, count($arr), '?'));
}

// ═══════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════

function cpLogin() {
    $body  = getBody();
    $email = strtolower(trim($body['email'] ?? ''));
    $pass  = $body['password'] ?? '';
    if (!$email || !$pass) jsonError('Email et mot de passe requis');

    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM CA_client_accounts WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    $account = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$account || !password_verify($pass, $account['password_hash'])) {
        jsonError('Identifiants incorrects', 401);
    }
    if ($account['statut'] !== 'actif') {
        jsonError('Compte suspendu ou en attente', 403);
    }

    $db->prepare("UPDATE CA_client_accounts SET last_login = NOW() WHERE id = ?")->execute([$account['id']]);

    $token = jwtEncode([
        'id'        => $account['id'],
        'client_id' => $account['client_id'],
        'email'     => $account['email'],
        'nom'       => $account['nom'],
        'type'      => 'client',
    ]);

    cpLogActivity($account['client_id'], $account['id'], 'login');

    jsonOk([
        'token' => $token,
        'user'  => [
            'id'        => $account['id'],
            'client_id' => $account['client_id'],
            'email'     => $account['email'],
            'nom'       => $account['nom'],
        ]
    ]);
}

function cpMe($client) {
    $db = getDB();
    $stmt = $db->prepare("SELECT a.id, a.client_id, a.email, a.nom, a.statut, a.last_login,
                                  c.display_nom AS client_display, c.tel, c.adresse
                          FROM CA_client_accounts a
                          LEFT JOIN CA_clients c ON c.id COLLATE utf8mb4_unicode_ci = a.client_id
                          WHERE a.id = ? LIMIT 1");
    $stmt->execute([$client['id']]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) jsonError('Compte introuvable', 404);
    jsonOk($row);
}

function cpChangePassword($client) {
    $body = getBody();
    $old  = $body['old_password'] ?? '';
    $new  = $body['new_password'] ?? '';
    if (!$old || !$new) jsonError('Ancien et nouveau mot de passe requis');
    if (strlen($new) < 6) jsonError('Minimum 6 caracteres');

    $db = getDB();
    $stmt = $db->prepare("SELECT password_hash FROM CA_client_accounts WHERE id = ?");
    $stmt->execute([$client['id']]);
    $hash = $stmt->fetchColumn();
    if (!password_verify($old, $hash)) jsonError('Ancien mot de passe incorrect', 401);

    $db->prepare("UPDATE CA_client_accounts SET password_hash = ? WHERE id = ?")
       ->execute([password_hash($new, PASSWORD_BCRYPT), $client['id']]);

    cpLogActivity($client['client_id'], $client['id'], 'change_password');
    jsonOk(['message' => 'Mot de passe modifie']);
}

function cpResetRequest() {
    $body  = getBody();
    $email = strtolower(trim($body['email'] ?? ''));
    if (!$email) jsonError('Email requis');

    $db = getDB();
    $stmt = $db->prepare("SELECT id, nom FROM CA_client_accounts WHERE email = ? AND statut = 'actif' LIMIT 1");
    $stmt->execute([$email]);
    $account = $stmt->fetch(PDO::FETCH_ASSOC);

    // Toujours repondre OK pour ne pas reveler l'existence du compte
    if ($account) {
        $token = bin2hex(random_bytes(32));
        $db->prepare("UPDATE CA_client_accounts SET reset_token = ?, reset_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?")
           ->execute([$token, $account['id']]);
        // Ici, envoyer l'email avec le lien de reinitialisation
        // mail($email, 'Reinitialisation mot de passe', "Lien : .../portail-client.html?reset=$token");
    }

    jsonOk(['message' => 'Si ce compte existe, un email a ete envoye']);
}

function cpResetConfirm() {
    $body  = getBody();
    $token = $body['token'] ?? '';
    $pass  = $body['new_password'] ?? '';
    if (!$token || !$pass) jsonError('Token et nouveau mot de passe requis');
    if (strlen($pass) < 6) jsonError('Minimum 6 caracteres');

    $db = getDB();
    $stmt = $db->prepare("SELECT id FROM CA_client_accounts WHERE reset_token = ? AND reset_expires > NOW() LIMIT 1");
    $stmt->execute([$token]);
    $account = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$account) jsonError('Lien invalide ou expire', 400);

    $db->prepare("UPDATE CA_client_accounts SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?")
       ->execute([password_hash($pass, PASSWORD_BCRYPT), $account['id']]);

    jsonOk(['message' => 'Mot de passe reinitialise']);
}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════

function cpDashboard($client) {
    $db = getDB();
    $projectIds = cpGetClientProjectIds($client['client_id']);

    if (empty($projectIds)) {
        jsonOk([
            'projects_count'      => 0,
            'projects'            => [],
            'pending_validations' => 0,
            'pending_invoices'    => 0,
            'recent_documents'    => [],
            'recent_activity'     => [],
        ]);
        return;
    }

    $ph = cpPlaceholders($projectIds);

    // Projets avec phase et statut
    $stmt = $db->prepare("SELECT id, code, nom, phase, statut, delai, surface, type_bat, adresse
                          FROM CA_projets WHERE id IN ($ph) ORDER BY cree_at DESC");
    $stmt->execute($projectIds);
    $projects = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Validations en attente
    $stmt = $db->prepare("SELECT COUNT(*) FROM CA_client_validations
                          WHERE client_id = ? AND statut = 'en_attente'");
    $stmt->execute([$client['client_id']]);
    $pendingVal = (int)$stmt->fetchColumn();

    // Factures impayees
    $stmt = $db->prepare("SELECT COUNT(*) FROM CA_factures WHERE projet_id IN ($ph) AND statut = 'Impayee'");
    $stmt->execute($projectIds);
    $pendingInv = (int)$stmt->fetchColumn();

    // Documents recents (5 derniers)
    $stmt = $db->prepare("SELECT id, titre, categorie, phase, statut, cree_at
                          FROM CA_client_documents WHERE client_id = ?
                          ORDER BY cree_at DESC LIMIT 5");
    $stmt->execute([$client['client_id']]);
    $recentDocs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Taches/jalons importants (prochaines echeances)
    $stmt = $db->prepare("SELECT id, titre, statut, progression, date_echeance, projet_id
                          FROM CA_taches WHERE projet_id IN ($ph) AND niveau = 0
                          ORDER BY CASE WHEN date_echeance IS NULL THEN 1 ELSE 0 END, date_echeance ASC
                          LIMIT 10");
    $stmt->execute($projectIds);
    $milestones = $stmt->fetchAll(PDO::FETCH_ASSOC);

    jsonOk([
        'projects_count'      => count($projects),
        'projects'            => $projects,
        'pending_validations' => $pendingVal,
        'pending_invoices'    => $pendingInv,
        'recent_documents'    => $recentDocs,
        'milestones'          => $milestones,
    ]);
}

function cpProjects($client) {
    $db = getDB();
    $projectIds = cpGetClientProjectIds($client['client_id']);
    if (empty($projectIds)) { jsonOk([]); return; }

    $ph = cpPlaceholders($projectIds);
    $stmt = $db->prepare("SELECT id, code, nom, phase, statut, type_bat, delai, honoraires,
                                 surface, adresse, description, cree_at
                          FROM CA_projets WHERE id IN ($ph) ORDER BY cree_at DESC");
    $stmt->execute($projectIds);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function cpProjectDetail($client) {
    $projetId = $_GET['projet_id'] ?? '';
    if (!$projetId) jsonError('projet_id requis');
    cpVerifyProjectAccess($client['client_id'], $projetId);

    $db = getDB();

    // Projet
    $stmt = $db->prepare("SELECT * FROM CA_projets WHERE id = ?");
    $stmt->execute([$projetId]);
    $projet = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$projet) jsonError('Projet introuvable', 404);

    // Missions
    $missions = [];
    try {
        $stmt = $db->prepare("SELECT * FROM CA_projets_missions WHERE projet_id = ? ORDER BY ordre ASC");
        $stmt->execute([$projetId]);
        $missions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {}

    // Intervenants
    $intervenants = [];
    try {
        $stmt = $db->prepare("SELECT * FROM CA_projets_intervenants WHERE projet_id = ?");
        $stmt->execute([$projetId]);
        $intervenants = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {}

    // Progression globale (moyenne missions niveau 0)
    $stmt = $db->prepare("SELECT AVG(progression) AS avg_prog FROM CA_taches WHERE projet_id = ? AND niveau = 0");
    $stmt->execute([$projetId]);
    $avgProg = (int)($stmt->fetchColumn() ?: 0);

    jsonOk([
        'projet'       => $projet,
        'missions'     => $missions,
        'intervenants' => $intervenants,
        'progression'  => $avgProg,
    ]);
}

function cpProjectTasks($client) {
    $projetId = $_GET['projet_id'] ?? '';
    if (!$projetId) jsonError('projet_id requis');
    cpVerifyProjectAccess($client['client_id'], $projetId);

    $db = getDB();
    $stmt = $db->prepare("
        SELECT t.id, t.parent_id, t.niveau, t.titre, t.statut, t.progression,
               t.date_debut, t.date_echeance, t.priorite,
               (SELECT COUNT(*) FROM CA_tache_livrables l WHERE l.tache_id = t.id) AS livrables_total,
               (SELECT COUNT(*) FROM CA_tache_livrables l WHERE l.tache_id = t.id AND l.done = 1) AS livrables_done
        FROM CA_taches t
        WHERE t.projet_id = ?
        ORDER BY t.niveau ASC, t.ordre ASC, t.cree_at ASC
    ");
    $stmt->execute([$projetId]);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

// ═══════════════════════════════════════════════════════════════
//  DOCUMENTS
// ═══════════════════════════════════════════════════════════════

function cpDocuments($client) {
    $projetId  = $_GET['projet_id'] ?? '';
    $categorie = $_GET['categorie'] ?? '';
    $phase     = $_GET['phase'] ?? '';
    $statut    = $_GET['statut'] ?? '';

    $db     = getDB();
    $where  = ["d.client_id = ?"];
    $params = [$client['client_id']];

    if ($projetId)  { $where[] = "d.projet_id = ?";  $params[] = $projetId; cpVerifyProjectAccess($client['client_id'], $projetId); }
    if ($categorie) { $where[] = "d.categorie = ?";  $params[] = $categorie; }
    if ($phase)     { $where[] = "d.phase = ?";      $params[] = $phase; }
    if ($statut)    { $where[] = "d.statut = ?";     $params[] = $statut; }

    $w = implode(' AND ', $where);
    $stmt = $db->prepare("SELECT d.*, p.code AS projet_code, p.nom AS projet_nom
                          FROM CA_client_documents d
                          LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = d.projet_id
                          WHERE $w ORDER BY d.cree_at DESC");
    $stmt->execute($params);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function cpDocumentDownload($client) {
    $docId = $_GET['id'] ?? '';
    if (!$docId) jsonError('id requis');

    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM CA_client_documents WHERE id = ? AND client_id = ?");
    $stmt->execute([$docId, $client['client_id']]);
    $doc = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$doc) jsonError('Document non trouve', 404);

    cpLogActivity($client['client_id'], $client['id'], 'download', ['doc_id' => $docId, 'titre' => $doc['titre']]);

    $filePath = realpath(__DIR__ . '/../../') . $doc['fichier_url'];
    if (!file_exists($filePath)) jsonError('Fichier introuvable sur le serveur', 404);

    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . basename($doc['fichier_nom']) . '"');
    header('Content-Length: ' . filesize($filePath));
    readfile($filePath);
    exit;
}

function cpDocumentUpload($client) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError('POST requis', 405);

    $projetId = $_POST['projet_id'] ?? '';
    $titre    = trim($_POST['titre'] ?? '');
    if (!$projetId) jsonError('projet_id requis');
    if (!$titre) jsonError('titre requis');
    cpVerifyProjectAccess($client['client_id'], $projetId);

    if (empty($_FILES['file'])) jsonError('Aucun fichier');
    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) jsonError('Erreur upload: code ' . $file['error']);
    if ($file['size'] > 20 * 1024 * 1024) jsonError('Fichier trop volumineux (max 20 Mo)');

    $allowed = ['jpg','jpeg','png','pdf','doc','docx','xls','xlsx','dwg','dxf','zip','rar'];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed)) jsonError('Format non supporte (' . $ext . ')');

    $uploadDir = realpath(__DIR__ . '/../../') . '/img/client_docs/';
    if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);

    $filename = 'cdoc_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    $dest = $uploadDir . $filename;
    if (!move_uploaded_file($file['tmp_name'], $dest)) jsonError("Erreur d'enregistrement");

    $docId = cpGenId();
    $db = getDB();
    $db->prepare("INSERT INTO CA_client_documents
                  (id, projet_id, client_id, categorie, titre, description, fichier_url, fichier_nom, fichier_taille, uploaded_by, uploaded_by_type)
                  VALUES (?, ?, ?, 'upload_client', ?, ?, ?, ?, ?, ?, 'client')")
       ->execute([$docId, $projetId, $client['client_id'], $titre,
                  $_POST['description'] ?? null, '/img/client_docs/' . $filename, $file['name'], $file['size'],
                  $client['nom']]);

    cpLogActivity($client['client_id'], $client['id'], 'upload', ['doc_id' => $docId, 'titre' => $titre]);
    jsonOk(['id' => $docId, 'url' => '/img/client_docs/' . $filename]);
}

function cpDocumentVersions($client) {
    $docId = $_GET['id'] ?? '';
    if (!$docId) jsonError('id requis');

    $db = getDB();
    // Remonter la chaine de versions
    $stmt = $db->prepare("SELECT * FROM CA_client_documents WHERE id = ? AND client_id = ?");
    $stmt->execute([$docId, $client['client_id']]);
    $doc = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$doc) jsonError('Document non trouve', 404);

    // Chercher toutes les versions (meme titre + meme projet)
    $stmt = $db->prepare("SELECT id, version, titre, statut, fichier_nom, cree_at, uploaded_by
                          FROM CA_client_documents
                          WHERE projet_id = ? AND client_id = ? AND titre = ?
                          ORDER BY version DESC");
    $stmt->execute([$doc['projet_id'], $client['client_id'], $doc['titre']]);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function cpDocumentComments($client) {
    $docId = $_GET['document_id'] ?? '';
    if (!$docId) jsonError('document_id requis');

    // Verifier acces
    $db = getDB();
    $stmt = $db->prepare("SELECT id FROM CA_client_documents WHERE id = ? AND client_id = ?");
    $stmt->execute([$docId, $client['client_id']]);
    if (!$stmt->fetch()) jsonError('Document non trouve', 404);

    $stmt = $db->prepare("SELECT * FROM CA_client_doc_comments WHERE document_id = ? ORDER BY cree_at ASC");
    $stmt->execute([$docId]);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function cpDocumentComment($client) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError('POST requis', 405);
    $body    = getBody();
    $docId   = $body['document_id'] ?? '';
    $content = trim($body['content'] ?? '');
    if (!$docId || !$content) jsonError('document_id et content requis');

    $db = getDB();
    $stmt = $db->prepare("SELECT id FROM CA_client_documents WHERE id = ? AND client_id = ?");
    $stmt->execute([$docId, $client['client_id']]);
    if (!$stmt->fetch()) jsonError('Document non trouve', 404);

    $id = cpGenId();
    $db->prepare("INSERT INTO CA_client_doc_comments (id, document_id, author_name, author_type, content)
                  VALUES (?, ?, ?, 'client', ?)")
       ->execute([$id, $docId, $client['nom'], $content]);

    jsonOk(['id' => $id]);
}

// ═══════════════════════════════════════════════════════════════
//  CHAT
// ═══════════════════════════════════════════════════════════════

function cpChatRooms($client) {
    $db = getDB();
    $projectIds = cpGetClientProjectIds($client['client_id']);
    if (empty($projectIds)) { jsonOk([]); return; }

    $ph = cpPlaceholders($projectIds);
    $stmt = $db->prepare("
        SELECT r.id, r.name, r.projet_id, r.is_archived, r.cree_at,
               p.code AS projet_code, p.nom AS projet_nom,
               (SELECT COUNT(*) FROM CA_chat_messages m WHERE m.room_id = r.id) AS msg_count,
               (SELECT m2.cree_at FROM CA_chat_messages m2 WHERE m2.room_id = r.id ORDER BY m2.cree_at DESC LIMIT 1) AS last_msg_at
        FROM CA_chat_rooms r
        LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = r.projet_id
        WHERE r.type = 'client' AND r.projet_id IN ($ph)
        ORDER BY last_msg_at DESC
    ");
    $stmt->execute($projectIds);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function cpChatMessages($client) {
    $roomId = $_GET['room_id'] ?? '';
    if (!$roomId) jsonError('room_id requis');

    // Verifier acces: la room doit etre type='client' et liee a un projet du client
    $db = getDB();
    $stmt = $db->prepare("SELECT r.projet_id FROM CA_chat_rooms r WHERE r.id = ? AND r.type = 'client'");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$room) jsonError('Room non trouvee', 404);
    cpVerifyProjectAccess($client['client_id'], $room['projet_id']);

    $limit  = min((int)($_GET['limit'] ?? 50), 200);
    $before = $_GET['before'] ?? '';

    $sql = "SELECT id, sender_id, sender_name, kind, content, attachment_url, attachment_name, cree_at
            FROM CA_chat_messages WHERE room_id = ?";
    $params = [$roomId];
    if ($before) { $sql .= " AND cree_at < ?"; $params[] = $before; }
    $sql .= " ORDER BY cree_at DESC LIMIT $limit";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $msgs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    jsonOk(array_reverse($msgs));
}

function cpChatSend($client) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError('POST requis', 405);
    $body    = getBody();
    $roomId  = $body['room_id'] ?? '';
    $content = trim($body['content'] ?? '');
    if (!$roomId || !$content) jsonError('room_id et content requis');

    $db = getDB();
    $stmt = $db->prepare("SELECT projet_id, is_archived FROM CA_chat_rooms WHERE id = ? AND type = 'client'");
    $stmt->execute([$roomId]);
    $room = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$room) jsonError('Room non trouvee', 404);
    if ($room['is_archived']) jsonError('Discussion archivee', 403);
    cpVerifyProjectAccess($client['client_id'], $room['projet_id']);

    $msgId = cpGenId();
    $db->prepare("INSERT INTO CA_chat_messages (id, room_id, sender_id, sender_name, kind, content)
                  VALUES (?, ?, ?, ?, 'text', ?)")
       ->execute([$msgId, $roomId, 'client_' . $client['id'], $client['nom'], $content]);

    jsonOk(['id' => $msgId]);
}

// ═══════════════════════════════════════════════════════════════
//  FINANCE
// ═══════════════════════════════════════════════════════════════

function cpDevis($client) {
    $db = getDB();
    $projectIds = cpGetClientProjectIds($client['client_id']);
    if (empty($projectIds)) { jsonOk([]); return; }

    $ph = cpPlaceholders($projectIds);
    $stmt = $db->prepare("
        SELECT d.id, d.numero, d.projet_id, d.montant_ht, d.tva, d.montant_ttc,
               d.statut, d.date_devis, d.date_expiry, d.objet, d.notes,
               p.code AS projet_code, p.nom AS projet_nom
        FROM CA_devis d
        LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = d.projet_id
        WHERE d.projet_id IN ($ph)
        ORDER BY d.date_devis DESC
    ");
    $stmt->execute($projectIds);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function cpFactures($client) {
    $db = getDB();
    $projectIds = cpGetClientProjectIds($client['client_id']);
    if (empty($projectIds)) { jsonOk([]); return; }

    $ph = cpPlaceholders($projectIds);
    $stmt = $db->prepare("
        SELECT f.id, f.numero, f.projet_id, f.montant_ht, f.tva, f.montant_ttc,
               f.statut, f.date_facture, f.date_emission, f.date_echeance, f.date_paiement,
               f.objet, f.mode_paiement, f.net_payer, f.lignes_json,
               p.code AS projet_code, p.nom AS projet_nom
        FROM CA_factures f
        LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = f.projet_id
        WHERE f.projet_id IN ($ph)
        ORDER BY f.date_facture DESC
    ");
    $stmt->execute($projectIds);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    // Decode lignes_json
    foreach ($rows as &$r) {
        $r['lignes'] = json_decode($r['lignes_json'] ?? '[]', true) ?: [];
        unset($r['lignes_json']);
    }
    jsonOk($rows);
}

// ═══════════════════════════════════════════════════════════════
//  VALIDATIONS
// ═══════════════════════════════════════════════════════════════

function cpPendingValidations($client) {
    $db = getDB();
    $stmt = $db->prepare("
        SELECT v.*, d.titre AS doc_titre, d.fichier_url, d.fichier_nom, d.categorie AS doc_categorie,
               p.code AS projet_code, p.nom AS projet_nom
        FROM CA_client_validations v
        LEFT JOIN CA_client_documents d ON d.id = v.document_id
        LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = v.projet_id
        WHERE v.client_id = ? AND v.statut = 'en_attente'
        ORDER BY v.cree_at DESC
    ");
    $stmt->execute([$client['client_id']]);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function cpValidate($client) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError('POST requis', 405);
    $body = getBody();
    $valId       = $body['validation_id'] ?? '';
    $statut      = $body['statut'] ?? '';
    $commentaire = trim($body['commentaire'] ?? '');
    $signature   = $body['signature_data'] ?? null;

    if (!$valId) jsonError('validation_id requis');
    if (!in_array($statut, ['approuve', 'refuse', 'approuve_avec_reserves'])) {
        jsonError('statut invalide (approuve|refuse|approuve_avec_reserves)');
    }

    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM CA_client_validations WHERE id = ? AND client_id = ?");
    $stmt->execute([$valId, $client['client_id']]);
    $val = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$val) jsonError('Validation non trouvee', 404);
    if ($val['statut'] !== 'en_attente') jsonError('Deja traitee');

    $db->prepare("UPDATE CA_client_validations
                  SET statut = ?, commentaire = ?, signature_data = ?, signe_par = ?, signe_at = NOW(), modifie_at = NOW()
                  WHERE id = ?")
       ->execute([$statut, $commentaire ?: null, $signature, $client['nom'], $valId]);

    // Mettre a jour le statut du document lie
    if ($val['document_id']) {
        $docStatut = $statut === 'approuve' ? 'Valide' : ($statut === 'refuse' ? 'Refuse' : 'Valide avec reserves');
        $db->prepare("UPDATE CA_client_documents SET statut = ? WHERE id = ?")->execute([$docStatut, $val['document_id']]);
    }

    cpLogActivity($client['client_id'], $client['id'], 'validate', [
        'validation_id' => $valId, 'statut' => $statut, 'document_id' => $val['document_id']
    ]);

    jsonOk(['message' => 'Validation enregistree']);
}

function cpValidationHistory($client) {
    $projetId = $_GET['projet_id'] ?? '';
    $db = getDB();

    $sql = "SELECT v.*, d.titre AS doc_titre, d.fichier_nom, p.code AS projet_code, p.nom AS projet_nom
            FROM CA_client_validations v
            LEFT JOIN CA_client_documents d ON d.id = v.document_id
            LEFT JOIN CA_projets p ON p.id COLLATE utf8mb4_unicode_ci = v.projet_id
            WHERE v.client_id = ?";
    $params = [$client['client_id']];

    if ($projetId) {
        cpVerifyProjectAccess($client['client_id'], $projetId);
        $sql .= " AND v.projet_id = ?";
        $params[] = $projetId;
    }

    $sql .= " ORDER BY v.modifie_at DESC, v.cree_at DESC";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

// ═══════════════════════════════════════════════════════════════
//  CHANTIER
// ═══════════════════════════════════════════════════════════════

function cpChantierInfo($client) {
    $projetId = $_GET['projet_id'] ?? '';
    if (!$projetId) jsonError('projet_id requis');
    cpVerifyProjectAccess($client['client_id'], $projetId);

    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM CA_chantiers WHERE projet_id = ? LIMIT 1");
    $stmt->execute([$projetId]);
    $chantier = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$chantier) jsonError('Aucun chantier pour ce projet', 404);

    // Lots
    $lots = [];
    try {
        $stmt = $db->prepare("SELECT * FROM CA_chantier_lots WHERE chantier_id = ? ORDER BY ordre ASC");
        $stmt->execute([$chantier['id']]);
        $lots = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {}

    // Phases
    $phases = [];
    try {
        $stmt = $db->prepare("SELECT * FROM CA_chantier_phases WHERE chantier_id = ? ORDER BY ordre ASC");
        $stmt->execute([$chantier['id']]);
        $phases = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {}

    jsonOk([
        'chantier' => $chantier,
        'lots'     => $lots,
        'phases'   => $phases,
    ]);
}

function cpChantierPhotos($client) {
    $projetId = $_GET['projet_id'] ?? '';
    if (!$projetId) jsonError('projet_id requis');
    cpVerifyProjectAccess($client['client_id'], $projetId);

    $db = getDB();
    // Trouver le chantier
    $stmt = $db->prepare("SELECT id FROM CA_chantiers WHERE projet_id = ? LIMIT 1");
    $stmt->execute([$projetId]);
    $chantierId = $stmt->fetchColumn();
    if (!$chantierId) { jsonOk([]); return; }

    $zone = $_GET['zone'] ?? '';
    $sql = "SELECT id, url, thumbnail_url, type_media, titre, description, zone, lot, tags, date_prise, cree_at
            FROM CA_chantier_photos WHERE chantier_id = ?";
    $params = [$chantierId];
    if ($zone) { $sql .= " AND zone = ?"; $params[] = $zone; }
    $sql .= " ORDER BY COALESCE(date_prise, cree_at) DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

function cpChantierReunions($client) {
    $projetId = $_GET['projet_id'] ?? '';
    if (!$projetId) jsonError('projet_id requis');
    cpVerifyProjectAccess($client['client_id'], $projetId);

    $db = getDB();
    $stmt = $db->prepare("SELECT id FROM CA_chantiers WHERE projet_id = ? LIMIT 1");
    $stmt->execute([$projetId]);
    $chantierId = $stmt->fetchColumn();
    if (!$chantierId) { jsonOk([]); return; }

    $stmt = $db->prepare("
        SELECT r.*,
               (SELECT COUNT(*) FROM CA_chantier_reunion_actions a WHERE a.reunion_id = r.id) AS actions_count
        FROM CA_chantier_reunions r
        WHERE r.chantier_id = ?
        ORDER BY r.date_reunion DESC
    ");
    $stmt->execute([$chantierId]);
    $reunions = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Actions par reunion
    foreach ($reunions as &$reunion) {
        $stmt2 = $db->prepare("SELECT * FROM CA_chantier_reunion_actions WHERE reunion_id = ? ORDER BY ordre ASC");
        $stmt2->execute([$reunion['id']]);
        $reunion['actions'] = $stmt2->fetchAll(PDO::FETCH_ASSOC);
    }

    jsonOk($reunions);
}

function cpChantierReserves($client) {
    $projetId = $_GET['projet_id'] ?? '';
    if (!$projetId) jsonError('projet_id requis');
    cpVerifyProjectAccess($client['client_id'], $projetId);

    $db = getDB();
    $stmt = $db->prepare("SELECT id FROM CA_chantiers WHERE projet_id = ? LIMIT 1");
    $stmt->execute([$projetId]);
    $chantierId = $stmt->fetchColumn();
    if (!$chantierId) { jsonOk([]); return; }

    $stmt = $db->prepare("SELECT * FROM CA_chantier_reserves WHERE chantier_id = ? ORDER BY cree_at DESC");
    $stmt->execute([$chantierId]);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}

// ═══════════════════════════════════════════════════════════════
//  INFOS PROJET
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  JOURNAL D'ACCES
// ═══════════════════════════════════════════════════════════════

function cpAccessLog($client) {
    $page   = max(1, intval($_GET['page'] ?? 1));
    $limit  = 30;
    $offset = ($page - 1) * $limit;

    $db = getDB();

    // Total count
    $stmt = $db->prepare("SELECT COUNT(*) FROM CA_client_activity_log WHERE client_id = ?");
    $stmt->execute([$client['client_id']]);
    $total = (int) $stmt->fetchColumn();

    // Entries
    $stmt = $db->prepare("
        SELECT l.action, l.details, l.ip_address, l.cree_at,
               a.nom AS account_nom, a.email AS account_email
        FROM CA_client_activity_log l
        LEFT JOIN CA_client_accounts a ON a.id = l.account_id
        WHERE l.client_id = ?
        ORDER BY l.cree_at DESC
        LIMIT $limit OFFSET $offset
    ");
    $stmt->execute([$client['client_id']]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$r) {
        if ($r['details']) $r['details'] = json_decode($r['details'], true);
    }

    jsonOk([
        'entries'      => $rows,
        'total'        => $total,
        'page'         => $page,
        'total_pages'  => max(1, ceil($total / $limit)),
    ]);
}

function cpProjectTeam($client) {
    $projetId = $_GET['projet_id'] ?? '';
    if (!$projetId) jsonError('projet_id requis');
    cpVerifyProjectAccess($client['client_id'], $projetId);

    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM CA_projets_intervenants WHERE projet_id = ?");
    $stmt->execute([$projetId]);
    jsonOk($stmt->fetchAll(PDO::FETCH_ASSOC));
}
