<?php
// ============================================================
//  CORTOBA ATELIER — Configuration base de données
//  Adapter les identifiants selon cPanel > MySQL Databases
// ============================================================

define('DB_HOST',    '10.10.10.100');
define('DB_NAME',    'dxmmmjkr_CAS');           // Ex: dxmmmjkr_cortoba
define('DB_USER',    'dxmmmjkr_admin');   // Ex: dxmmmjkr_admin
define('DB_PASS',    'Yassine2026');  // Mot de passe MySQL
define('DB_CHARSET', 'utf8mb4');
define('DB_PREFIX',  'CA_');

define('JWT_SECRET', 'corotba_secret_CHANGEZ_MOI_2026_xK9pL');
define('JWT_EXPIRY', 86400 * 7); // 7 jours

define('ADMIN_EMAIL', 'cortobaarchitecture@gmail.com');

function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            http_response_code(500);
            die(json_encode([
                'success' => false,
                'error'   => 'Connexion BDD impossible : ' . $e->getMessage()
            ]));
        }
    }
    return $pdo;
}

function t(string $table): string {
    return '`' . DB_PREFIX . $table . '`';
}
