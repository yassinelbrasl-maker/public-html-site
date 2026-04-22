<?php
// ============================================================
//  CORTOBA DIGITAL STUDIO — Configuration base de donnees
//  Copie commerciale - donnees independantes via prefixe CDS_
//  Adapter les identifiants selon cPanel > MySQL Databases
// ============================================================

define('DB_HOST',    '10.10.10.100');
define('DB_NAME',    'dxmmmjkr_CAS');           // Meme base, prefixe different
define('DB_USER',    'dxmmmjkr_admin');
define('DB_PASS',    'Yassine2026');
define('DB_CHARSET', 'utf8mb4');
define('DB_PREFIX',  'CDS_');                   // Prefixe independant pour la copie commerciale

define('JWT_SECRET', 'cortoba_digital_studio_secret_2026_xQ7pM');
define('JWT_EXPIRY', 86400 * 7); // 7 jours

define('ADMIN_EMAIL', 'cortobaarchitecture@gmail.com');

// Marqueur d'instance commerciale (utilise par sync et settings)
define('INSTANCE_NAME',    'Cortoba Digital Studio');
define('INSTANCE_SLUG',    'cortobadigitalstudio');
define('INSTANCE_SOURCE',  'cortoba-plateforme'); // Dossier source pour la synchro

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
