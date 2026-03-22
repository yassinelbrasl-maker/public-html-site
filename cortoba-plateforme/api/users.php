<?php
// ═══════════════════════════════════════════════════════════════
//  api/users.php — Gestion des membres de l'équipe Cortoba
//  Compatible PHP 5.6+
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';

function ensureUsersTable() {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS `cortoba_users` (
        `id`         VARCHAR(32)  NOT NULL PRIMARY KEY,
        `prenom`     VARCHAR(100) NOT NULL,
        `nom`        VARCHAR(100) NOT NULL,
        `email`      VARCHAR(191) NOT NULL UNIQUE,
        `role`       VARCHAR(100) NOT NULL DEFAULT '',
        `statut`     VARCHAR(50)  NOT NULL DEFAULT 'Actif',
        `tel`        VARCHAR(50)  DEFAULT '',
        `spec`       VARCHAR(200) DEFAULT '',
        `modules`    TEXT         DEFAULT '[]',
        `pass_hash`  VARCHAR(255) NOT NULL,
        `is_admin`   TINYINT(1)   NOT NULL DEFAULT 0,
        `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
}

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'OPTIONS') { http_response_code(204); exit; }

// GET est public (pour charger la liste côté admin)
// POST/PUT/DELETE nécessitent auth
if ($method !== 'GET') {
    requireAuth();
}

try {
    ensureUsersTable();
    $db = getDB();

    if ($method === 'GET') {
        $stmt = $db->query("SELECT id, prenom, nom, email, role, statut, tel, spec, modules, created_at
                            FROM cortoba_users WHERE is_admin = 0 ORDER BY created_at ASC");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) {
            $decoded = json_decode(isset($r['modules']) ? $r['modules'] : '[]', true);
            $r['modules'] = is_array($decoded) ? $decoded : array();
        }
        jsonOk($rows);

    } elseif ($method === 'POST') {
        $body    = getBody();
        $id      = isset($body['id'])       ? $body['id']       : bin2hex(random_bytes(8));
        $prenom  = trim(isset($body['prenom'])   ? $body['prenom']   : '');
        $nom     = trim(isset($body['nom'])      ? $body['nom']      : '');
        $email   = strtolower(trim(isset($body['email'])    ? $body['email']    : ''));
        $role    = trim(isset($body['role'])     ? $body['role']     : '');
        $statut  = trim(isset($body['statut'])   ? $body['statut']   : 'Actif');
        $tel     = trim(isset($body['tel'])      ? $body['tel']      : '');
        $spec    = trim(isset($body['spec'])     ? $body['spec']     : '');
        $pass    = isset($body['password'])      ? $body['password'] : '';
        $modules = json_encode(isset($body['modules']) ? $body['modules'] : array());

        if (!$prenom || !$nom || !$email || !$pass) jsonError('Champs requis manquants', 400);

        $hash = password_hash($pass, PASSWORD_DEFAULT);

        $stmt = $db->prepare("INSERT INTO cortoba_users
                                (id, prenom, nom, email, role, statut, tel, spec, modules, pass_hash, is_admin)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                              ON DUPLICATE KEY UPDATE
                                prenom=VALUES(prenom), nom=VALUES(nom), role=VALUES(role),
                                statut=VALUES(statut), tel=VALUES(tel), spec=VALUES(spec),
                                modules=VALUES(modules),
                                pass_hash=IF(? != '', VALUES(pass_hash), pass_hash)");
        $stmt->execute(array($id, $prenom, $nom, $email, $role, $statut, $tel, $spec, $modules, $hash, $pass));
        jsonOk(array('id' => $id, 'email' => $email));

    } elseif ($method === 'PUT') {
        $body    = getBody();
        $id      = isset($body['id'])       ? $body['id']       : '';
        $prenom  = trim(isset($body['prenom'])   ? $body['prenom']   : '');
        $nom     = trim(isset($body['nom'])      ? $body['nom']      : '');
        $email   = strtolower(trim(isset($body['email'])    ? $body['email']    : ''));
        $role    = trim(isset($body['role'])     ? $body['role']     : '');
        $statut  = trim(isset($body['statut'])   ? $body['statut']   : 'Actif');
        $tel     = trim(isset($body['tel'])      ? $body['tel']      : '');
        $spec    = trim(isset($body['spec'])     ? $body['spec']     : '');
        $pass    = isset($body['password'])      ? $body['password'] : '';
        $modules = json_encode(isset($body['modules']) ? $body['modules'] : array());

        if (!$id) jsonError('ID requis', 400);

        if ($pass) {
            $hash = password_hash($pass, PASSWORD_DEFAULT);
            $stmt = $db->prepare("UPDATE cortoba_users SET prenom=?, nom=?, email=?, role=?, statut=?, tel=?, spec=?, modules=?, pass_hash=? WHERE id=?");
            $stmt->execute(array($prenom, $nom, $email, $role, $statut, $tel, $spec, $modules, $hash, $id));
        } else {
            $stmt = $db->prepare("UPDATE cortoba_users SET prenom=?, nom=?, email=?, role=?, statut=?, tel=?, spec=?, modules=? WHERE id=?");
            $stmt->execute(array($prenom, $nom, $email, $role, $statut, $tel, $spec, $modules, $id));
        }
        jsonOk(array('updated' => true));

    } elseif ($method === 'DELETE') {
        $id = isset($_GET['id']) ? $_GET['id'] : '';
        if (!$id) jsonError('ID requis', 400);
        $stmt = $db->prepare("DELETE FROM cortoba_users WHERE id = ? AND is_admin = 0");
        $stmt->execute(array($id));
        jsonOk(array('deleted' => true));

    } else {
        jsonError('Méthode non supportée', 405);
    }

} catch (Exception $e) {
    jsonError($e->getMessage(), 500);
}
