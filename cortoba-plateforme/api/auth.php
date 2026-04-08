<?php
// ============================================================
//  CORTOBA ATELIER — API Auth
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$action = isset($_GET['action']) ? $_GET['action'] : '';
$body   = getBody();

if ($action === 'login')  handleLogin($body);
elseif ($action === 'me') handleMe();
else                      jsonError('Action inconnue', 404);

function handleLogin(array $body) {
    $email = strtolower(trim(isset($body['email'])    ? $body['email']    : ''));
    $pass  =                  isset($body['password']) ? $body['password'] : '';
    if (!$email || !$pass) jsonError('Email et mot de passe requis');

    $db = getDB();

    // ── 1. Vérifier d'abord les membres de l'équipe ──
    try {
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

        $stmt2 = $db->prepare("SELECT * FROM cortoba_users WHERE email = ? AND is_admin = 0 AND statut != 'Inactif' LIMIT 1");
        $stmt2->execute(array($email));
        $member = $stmt2->fetch(PDO::FETCH_ASSOC);

        if ($member && password_verify($pass, $member['pass_hash'])) {
            // Générer un token et le stocker dans CA_accounts comme un compte temporaire
            // OU utiliser jwtEncode s'il est disponible
            $modules = json_decode(isset($member['modules']) ? $member['modules'] : '[]', true);
            if (!is_array($modules)) $modules = array();

            // Utiliser jwtEncode (disponible via middleware) pour un token valide
            $token = jwtEncode(array(
                'id'      => $member['id'],
                'email'   => $member['email'],
                'name'    => $member['prenom'] . ' ' . $member['nom'],
                'role'    => $member['role'],
                'modules' => $modules,
                'isMember'=> true,
            ));

            logMemberActivity($member['id'], $member['prenom'] . ' ' . $member['nom'], 'login');

            jsonOk(array(
                'token' => $token,
                'user'  => array(
                    'id'      => $member['id'],
                    'email'   => $member['email'],
                    'name'    => $member['prenom'] . ' ' . $member['nom'],
                    'role'    => $member['role'],
                    'modules' => $modules,
                    'isAdmin' => false,
                )
            ));
            exit;
        }
    } catch (Exception $e) {
        // Table inexistante ou erreur — continuer vers auth admin
    }

    // ── 2. Vérifier le compte admin (CA_accounts) ──
    $stmt = $db->prepare('SELECT * FROM CA_accounts WHERE email = ? LIMIT 1');
    $stmt->execute(array($email));
    $user = $stmt->fetch();

    if (!$user || !password_verify($pass, $user['password'])) {
        jsonError('Identifiants incorrects', 401);
    }
    if (!$user['approved']) {
        jsonError('Compte en attente de validation', 403);
    }

    $db->prepare('UPDATE CA_accounts SET last_login = NOW() WHERE id = ?')->execute(array($user['id']));

    logMemberActivity($user['id'], $user['name'], 'login', ['role' => $user['role']]);

    $token = jwtEncode(array(
        'id'    => $user['id'],
        'email' => $user['email'],
        'name'  => $user['name'],
        'role'  => $user['role'],
    ));

    jsonOk(array(
        'token' => $token,
        'user'  => array(
            'id'    => $user['id'],
            'email' => $user['email'],
            'name'  => $user['name'],
            'role'  => $user['role'],
        )
    ));
}

function handleMe() {
    $user = requireAuth();
    $db   = getDB();

    // Vérifier si c'est un membre de l'équipe (a un champ isMember dans le JWT)
    if (!empty($user['isMember'])) {
        try {
            $stmt = $db->prepare('SELECT id, prenom, nom, email, role, modules, profile_picture_url FROM cortoba_users WHERE id = ? LIMIT 1');
            $stmt->execute(array($user['id']));
        } catch (Exception $e) {
            // Colonne profile_picture_url absente — fallback sans elle
            $stmt = $db->prepare('SELECT id, prenom, nom, email, role, modules FROM cortoba_users WHERE id = ? LIMIT 1');
            $stmt->execute(array($user['id']));
        }
        $member = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$member) jsonError('Compte introuvable', 404);
        $member['modules'] = json_decode(isset($member['modules']) ? $member['modules'] : '[]', true);
        if (!is_array($member['modules'])) $member['modules'] = array();
        $member['name']    = $member['prenom'] . ' ' . $member['nom'];
        $member['isAdmin'] = false;
        jsonOk($member);
        return;
    }

    // Compte admin normal
    $stmt = $db->prepare('SELECT id, email, name, role, approved, last_login FROM CA_accounts WHERE id = ?');
    $stmt->execute(array($user['id']));
    $account = $stmt->fetch();
    if (!$account) jsonError('Compte introuvable', 404);
    jsonOk($account);
}
