<?php
// ============================================================
//  CORTOBA ATELIER — Middleware (auth, CORS, helpers)
// ============================================================

require_once __DIR__ . '/db.php';

function setCorsHeaders() {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Content-Type: application/json; charset=utf-8');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function jsonOk($data, int $code = 200) {
    http_response_code($code);
    echo json_encode(['success' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function jsonError(string $message, int $code = 400) {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function getBody() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function base64url_encode(string $data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
function base64url_decode(string $data) {
    return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
}

function jwtEncode(array $payload) {
    $header  = base64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload['iat'] = time();
    $payload['exp'] = time() + JWT_EXPIRY;
    $payloadEnc = base64url_encode(json_encode($payload));
    $sig = base64url_encode(hash_hmac('sha256', "$header.$payloadEnc", JWT_SECRET, true));
    return "$header.$payloadEnc.$sig";
}

function jwtDecode(string $token) {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$header, $payload, $sig] = $parts;
    $expectedSig = base64url_encode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    if (!hash_equals($expectedSig, $sig)) return null;
    $data = json_decode(base64url_decode($payload), true);
    if (!$data || empty($data['exp']) || $data['exp'] < time()) return null;
    return $data;
}

function requireAuth() {
    $token = null;
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strpos($authHeader, 'Bearer ') === 0) {
        $token = substr($authHeader, 7);
    }
    if (!$token) {
        jsonError('Token d\'authentification requis', 401);
    }
    $payload = jwtDecode($token);
    if (!$payload) {
        jsonError('Token invalide ou expiré', 401);
    }
    return $payload;
}

function requireAdmin() {
    $user = requireAuth();
    if (($user['role'] ?? '') !== 'admin') {
        jsonError('Accès administrateur requis', 403);
    }
    return $user;
}

function sanitize($val) {
    if (is_string($val)) return trim(htmlspecialchars($val, ENT_QUOTES, 'UTF-8'));
    if (is_array($val)) return array_map('sanitize', $val);
    return $val;
}

// ── Journal d'acces membres ──

function ensureMemberActivityLogTable() {
    static $done = false;
    if ($done) return;
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS `CA_member_activity_log` (
        `id`         VARCHAR(32)  NOT NULL PRIMARY KEY,
        `user_id`    VARCHAR(32)  NOT NULL,
        `user_name`  VARCHAR(200) DEFAULT NULL,
        `action`     VARCHAR(80)  NOT NULL,
        `details`    TEXT         DEFAULT NULL,
        `ip_address` VARCHAR(45)  DEFAULT NULL,
        `cree_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY `idx_user`  (`user_id`),
        KEY `idx_date`  (`cree_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $done = true;
}

function logMemberActivity($userId, $userName, $action, $details = null) {
    try {
        ensureMemberActivityLogTable();
        $db = getDB();
        $db->prepare("INSERT INTO CA_member_activity_log (id, user_id, user_name, action, details, ip_address)
                      VALUES (?, ?, ?, ?, ?, ?)")
           ->execute([bin2hex(random_bytes(16)), $userId, $userName, $action,
                      $details ? json_encode($details) : null,
                      $_SERVER['REMOTE_ADDR'] ?? null]);
    } catch (\Throwable $e) { /* silencieux */ }
}

// ── Restrictions dynamiques par rôle ──

function getRestrictions() {
    static $cache = null;
    if ($cache !== null) return $cache;
    $defaults = [
        'stagiaire' => ['creer_projets'=>true,'creer_clients'=>true,'creer_devis'=>true,'creer_factures'=>true,'supprimer'=>true],
        'membre'    => ['creer_projets'=>false,'creer_clients'=>false,'creer_devis'=>false,'creer_factures'=>false,
                        'supprimer'=>true,'voir_salaires'=>true,'voir_contacts_perso'=>true,'gerer_parametres'=>true],
    ];
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT setting_value FROM CA_settings WHERE setting_key = 'cfg_restrictions' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row) {
            $saved = json_decode($row['setting_value'], true);
            if (is_array($saved)) {
                foreach ($defaults as $role => $rules) {
                    foreach ($rules as $key => $def) {
                        if (isset($saved[$role][$key])) {
                            $defaults[$role][$key] = (bool)$saved[$role][$key];
                        }
                    }
                }
            }
        }
    } catch (\Throwable $e) { /* use defaults */ }
    $cache = $defaults;
    return $cache;
}

function isRestricted(array $user, string $action): bool {
    $role = strtolower(trim($user['role'] ?? ''));
    $isAdmin = ($role === 'admin') || ($role === 'architecte gérant');
    if ($isAdmin) return false;

    $restrictions = getRestrictions();
    $group = ($role === 'stagiaire') ? 'stagiaire' : 'membre';
    return !empty($restrictions[$group][$action]);
}

setCorsHeaders();
