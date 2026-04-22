<?php
// ============================================================
//  CORTOBA DIGITAL STUDIO — API Migration
//
//  Prepare un paquet de migration pour un tenant :
//    - Export complet des tables T_<SLUG>_*  (dump SQL)
//    - Copie des fichiers du tenant dans un ZIP
//    - README avec les instructions de deploiement
//
//  Actions :
//    POST ?action=prepare  Construit le paquet ZIP (slug, target_domain)
//    GET  ?action=download&slug=...&key=...  Telecharge le ZIP
//    POST ?action=finalize Marque le tenant comme 'migrated' (stoppe l'acces)
//    GET  ?action=list     Liste les paquets disponibles
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$action = isset($_GET['action']) ? $_GET['action'] : '';

if      ($action === 'prepare')  handlePrepare();
else if ($action === 'download') handleDownload();
else if ($action === 'finalize') handleFinalize();
else if ($action === 'list')     handleListPackages();
else                             jsonError('Action inconnue', 404);

// ─────────────────────────────────────────────────────────────
//  Dossier d'exports (hors arborescence web idealement, mais
//  protege par .htaccess et par cle d'acces generee)
// ─────────────────────────────────────────────────────────────
function getExportDir(): string {
    $dir = realpath(__DIR__ . '/..') . '/exports';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
        // Interdire l'acces web direct
        @file_put_contents($dir . '/.htaccess',
            "Require all denied\n" .
            "<Files \"*.zip\">\n  Require all denied\n</Files>\n" .
            "<Files \"*.sql\">\n  Require all denied\n</Files>\n");
        @file_put_contents($dir . '/index.html', '');
    }
    return $dir;
}

// ─────────────────────────────────────────────────────────────
//  PREPARE - construit le paquet ZIP (dump + fichiers + readme)
// ─────────────────────────────────────────────────────────────
function handlePrepare() {
    $admin = requireAdmin();
    @set_time_limit(600);

    $body       = getBody();
    $slug       = trim($body['slug'] ?? '');
    $targetHost = trim($body['target_domain'] ?? '');
    $targetPath = trim($body['target_path']   ?? '');

    if (!$slug)       jsonError('slug requis');
    if (!$targetHost) jsonError('Domaine cible requis (ex: client.com)');

    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM " . t('clients') . " WHERE slug = ?");
    $stmt->execute([$slug]);
    $tenant = $stmt->fetch();
    if (!$tenant) jsonError('Tenant introuvable', 404);

    $dbPrefix = $tenant['db_prefix'];
    $tenantDir = realpath(__DIR__ . '/..') . '/c/' . $slug;
    if (!is_dir($tenantDir)) jsonError('Dossier tenant introuvable : ' . $slug, 500);

    // 1. Generer le dump SQL
    $started = microtime(true);
    $dumpSql = buildSqlDump($db, $dbPrefix);

    // 2. Construire le ZIP
    $exportDir = getExportDir();
    $stamp     = date('Ymd-His');
    $key       = bin2hex(random_bytes(8));  // cle de telechargement
    $zipName   = "cds-migration-{$slug}-{$stamp}-{$key}.zip";
    $zipPath   = $exportDir . '/' . $zipName;

    if (!class_exists('ZipArchive')) {
        jsonError('Extension PHP ZipArchive indisponible', 500);
    }

    $zip = new ZipArchive();
    if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        jsonError('Impossible de creer le ZIP', 500);
    }

    // 2a. Fichiers du tenant
    $zipRoot = 'cortoba-plateforme';
    addDirToZip($zip, $tenantDir, $zipRoot, $slug, $dbPrefix, $targetHost, $targetPath);

    // 2b. Dump SQL (adapte pour le nouveau domaine : on retire le T_<SLUG>_)
    $finalDump = adaptDumpForMigration($dumpSql, $dbPrefix);
    $zip->addFromString($zipRoot . '/database.sql', $finalDump);

    // 2c. README
    $readme = buildMigrationReadme($tenant, $targetHost, $targetPath);
    $zip->addFromString($zipRoot . '/README-MIGRATION.txt', $readme);

    // 2d. .env sample pour le nouveau serveur
    $envSample = buildEnvSample($tenant, $targetHost, $targetPath);
    $zip->addFromString($zipRoot . '/config-sample.txt', $envSample);

    $zip->close();

    $size = filesize($zipPath);

    // 3. Enregistrer le paquet
    ensureMigrationsTable($db);
    $db->prepare("INSERT INTO " . t('migrations') . "
                  (id, slug, target_domain, target_path, zip_file, zip_key, size_bytes, created_at, created_by)
                  VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)")
       ->execute([
           bin2hex(random_bytes(16)), $slug, $targetHost, $targetPath,
           $zipName, $key, $size,
           $admin['name'] ?? $admin['email'] ?? 'admin'
       ]);

    logMemberActivity(
        $admin['id'] ?? 'admin',
        $admin['name'] ?? 'admin',
        'tenant_migrate_prepare',
        ['slug' => $slug, 'target' => $targetHost, 'size_kb' => (int)($size / 1024)]
    );

    jsonOk([
        'slug'          => $slug,
        'target_domain' => $targetHost,
        'target_path'   => $targetPath,
        'zip_file'      => $zipName,
        'zip_key'       => $key,
        'size_bytes'    => $size,
        'size_mb'       => round($size / 1048576, 2),
        'download_url'  => 'api/migrate.php?action=download&slug=' . rawurlencode($slug) . '&key=' . $key,
        'duration_ms'   => (int) round((microtime(true) - $started) * 1000)
    ]);
}

// ─────────────────────────────────────────────────────────────
//  DOWNLOAD - telecharge un paquet genere (auth + cle)
// ─────────────────────────────────────────────────────────────
function handleDownload() {
    requireAdmin();
    $slug = isset($_GET['slug']) ? trim($_GET['slug']) : '';
    $key  = isset($_GET['key'])  ? trim($_GET['key'])  : '';
    if (!$slug || !$key) jsonError('slug et key requis');

    $db = getDB();
    ensureMigrationsTable($db);
    $stmt = $db->prepare("SELECT zip_file FROM " . t('migrations') . " WHERE slug = ? AND zip_key = ? LIMIT 1");
    $stmt->execute([$slug, $key]);
    $zipFile = $stmt->fetchColumn();
    if (!$zipFile) jsonError('Paquet introuvable', 404);

    $zipPath = getExportDir() . '/' . $zipFile;
    if (!is_readable($zipPath)) jsonError('Fichier absent', 404);

    // Envoyer le fichier
    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $zipFile . '"');
    header('Content-Length: ' . filesize($zipPath));
    header('Cache-Control: no-store');
    readfile($zipPath);
    exit;
}

// ─────────────────────────────────────────────────────────────
//  FINALIZE - bascule le tenant en statut 'migrated'
// ─────────────────────────────────────────────────────────────
function handleFinalize() {
    $admin = requireAdmin();
    $body = getBody();
    $slug       = trim($body['slug'] ?? '');
    $targetHost = trim($body['target_domain'] ?? '');
    if (!$slug) jsonError('slug requis');

    $db = getDB();
    $stmt = $db->prepare("UPDATE " . t('clients') . "
                          SET status = 'migrated', migrated_at = NOW(), custom_domain = ?
                          WHERE slug = ?");
    $stmt->execute([$targetHost ?: null, $slug]);
    if ($stmt->rowCount() === 0) jsonError('Tenant introuvable', 404);

    logMemberActivity(
        $admin['id'] ?? 'admin',
        $admin['name'] ?? 'admin',
        'tenant_migrate_finalize',
        ['slug' => $slug, 'target' => $targetHost]
    );

    jsonOk([
        'slug'          => $slug,
        'status'        => 'migrated',
        'custom_domain' => $targetHost
    ]);
}

// ─────────────────────────────────────────────────────────────
//  LIST - liste les paquets generes
// ─────────────────────────────────────────────────────────────
function handleListPackages() {
    requireAdmin();
    $db = getDB();
    ensureMigrationsTable($db);
    $slug = isset($_GET['slug']) ? trim($_GET['slug']) : '';
    if ($slug) {
        $stmt = $db->prepare("SELECT * FROM " . t('migrations') . " WHERE slug = ? ORDER BY created_at DESC");
        $stmt->execute([$slug]);
    } else {
        $stmt = $db->query("SELECT * FROM " . t('migrations') . " ORDER BY created_at DESC LIMIT 50");
    }
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['size_mb']      = round(((int)$r['size_bytes']) / 1048576, 2);
        $r['download_url'] = 'api/migrate.php?action=download&slug=' . rawurlencode($r['slug']) . '&key=' . $r['zip_key'];
    }
    jsonOk($rows);
}

// ═════════════════════════════════════════════════════════════
//  Helpers
// ═════════════════════════════════════════════════════════════

function ensureMigrationsTable(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS " . t('migrations') . " (
        `id`            VARCHAR(32)  NOT NULL PRIMARY KEY,
        `slug`          VARCHAR(32)  NOT NULL,
        `target_domain` VARCHAR(200) DEFAULT NULL,
        `target_path`   VARCHAR(200) DEFAULT NULL,
        `zip_file`      VARCHAR(200) NOT NULL,
        `zip_key`       VARCHAR(32)  NOT NULL,
        `size_bytes`    BIGINT       NOT NULL DEFAULT 0,
        `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `created_by`    VARCHAR(120) DEFAULT NULL,
        KEY `idx_slug` (`slug`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

// Construit un dump SQL de toutes les tables portant le prefixe donne
function buildSqlDump(PDO $db, string $prefix): string {
    $stmt = $db->prepare("SELECT table_name FROM information_schema.tables
                          WHERE table_schema = ? AND table_name LIKE ?");
    $stmt->execute([DB_NAME, $prefix . '%']);
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    if (!$tables) return "-- Aucune table trouvee pour le prefixe {$prefix}\n";

    $out  = "-- ============================================\n";
    $out .= "-- Dump SQL pour migration tenant\n";
    $out .= "-- Prefixe source : {$prefix}\n";
    $out .= "-- Genere le     : " . date('Y-m-d H:i:s') . "\n";
    $out .= "-- ============================================\n\n";
    $out .= "SET NAMES utf8mb4;\n";
    $out .= "SET FOREIGN_KEY_CHECKS = 0;\n\n";

    foreach ($tables as $table) {
        // Structure
        $out .= "-- Table : {$table}\n";
        $out .= "DROP TABLE IF EXISTS `{$table}`;\n";
        $create = $db->query("SHOW CREATE TABLE `{$table}`")->fetch(PDO::FETCH_NUM);
        $out .= $create[1] . ";\n\n";

        // Donnees
        $rows = $db->query("SELECT * FROM `{$table}`")->fetchAll(PDO::FETCH_NUM);
        if (!$rows) continue;

        $cols = [];
        $colInfo = $db->query("SHOW COLUMNS FROM `{$table}`")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($colInfo as $c) $cols[] = '`' . $c['Field'] . '`';

        $chunkSize = 200;
        for ($i = 0; $i < count($rows); $i += $chunkSize) {
            $chunk = array_slice($rows, $i, $chunkSize);
            $values = [];
            foreach ($chunk as $row) {
                $vals = [];
                foreach ($row as $v) {
                    if ($v === null) $vals[] = 'NULL';
                    else $vals[] = $db->quote($v);
                }
                $values[] = '(' . implode(',', $vals) . ')';
            }
            $out .= "INSERT INTO `{$table}` (" . implode(',', $cols) . ") VALUES\n"
                  . implode(",\n", $values) . ";\n\n";
        }
    }

    $out .= "SET FOREIGN_KEY_CHECKS = 1;\n";
    return $out;
}

// Remplace le prefixe T_<SLUG>_ par CDS_ dans le dump (instance autonome chez le client)
function adaptDumpForMigration(string $dumpSql, string $dbPrefix): string {
    // On convertit le prefixe en CA_ (comme la plateforme originale)
    // Plus coherent avec le produit "Cortoba Atelier" racheté par le client
    return str_replace('`' . $dbPrefix, '`CA_', $dumpSql);
}

// Ajoute recursivement un dossier au ZIP avec transformation des prefixes
function addDirToZip(ZipArchive $zip, string $baseDir, string $zipBase,
                     string $slug, string $dbPrefix, string $targetHost, string $targetPath): void {
    $rii = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($baseDir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );

    $textExt = ['php', 'js', 'html', 'css', 'txt', 'json', 'md', 'htaccess', 'sql'];

    foreach ($rii as $file) {
        $rel = str_replace('\\', '/', substr($file->getPathname(), strlen($baseDir) + 1));
        if ($rel === '') continue;

        $zipPath = $zipBase . '/' . $rel;

        if ($file->isDir()) {
            $zip->addEmptyDir($zipPath);
            continue;
        }

        // Remplacer le config db.php par une version standalone (sans trial_guard)
        if ($rel === 'config/db.php') {
            $cfg = buildStandaloneDbConfig($slug, $targetHost, $targetPath);
            $zip->addFromString($zipPath, $cfg);
            continue;
        }

        $ext = strtolower(pathinfo($rel, PATHINFO_EXTENSION));
        if (in_array($ext, $textExt, true)) {
            $content = @file_get_contents($file->getPathname());
            if ($content === false) continue;
            // Retirer le prefixe T_<SLUG>_ → CA_
            $content = str_replace($dbPrefix, 'CA_', $content);
            // Rebasculer l'URL depuis /cortobadigitalstudio/c/<slug>/ vers /
            $oldPath = 'cortobadigitalstudio/c/' . $slug;
            if ($targetPath !== '') {
                $content = str_replace($oldPath, trim($targetPath, '/'), $content);
            } else {
                $content = str_replace($oldPath . '/', '', $content);
                $content = str_replace($oldPath, '', $content);
            }
            $zip->addFromString($zipPath, $content);
        } else {
            $zip->addFile($file->getPathname(), $zipPath);
        }
    }
}

// db.php standalone pour le nouveau domaine (sans trial_guard)
function buildStandaloneDbConfig(string $slug, string $targetHost, string $targetPath): string {
    $hostEsc = addslashes($targetHost);
    $slugEsc = addslashes($slug);
    return <<<PHP
<?php
// ============================================================
//  CORTOBA ATELIER — Configuration base de donnees
//  Instance standalone - migration du tenant "{$slugEsc}"
//  A ADAPTER selon les identifiants MySQL du nouvel hebergement
// ============================================================

define('DB_HOST',    'localhost');      // A ADAPTER
define('DB_NAME',    'database_name');  // A ADAPTER
define('DB_USER',    'db_user');        // A ADAPTER
define('DB_PASS',    'db_password');    // A ADAPTER
define('DB_CHARSET', 'utf8mb4');
define('DB_PREFIX',  'CA_');

define('JWT_SECRET', 'change_me_' . bin2hex(random_bytes(16)));  // A REGENERER
define('JWT_EXPIRY', 86400 * 7);

define('ADMIN_EMAIL', '');

define('INSTANCE_NAME', 'Cortoba Atelier');
define('INSTANCE_SLUG', '{$hostEsc}');

function getDB(): PDO {
    static \$pdo = null;
    if (\$pdo === null) {
        \$dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
        \$options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        try {
            \$pdo = new PDO(\$dsn, DB_USER, DB_PASS, \$options);
        } catch (PDOException \$e) {
            http_response_code(500);
            die(json_encode(['success' => false, 'error' => 'Connexion BDD impossible : ' . \$e->getMessage()]));
        }
    }
    return \$pdo;
}

function t(string \$table): string {
    return '`' . DB_PREFIX . \$table . '`';
}
PHP;
}

// README explicatif joint au ZIP
function buildMigrationReadme(array $tenant, string $targetHost, string $targetPath): string {
    $slug     = $tenant['slug'];
    $company  = $tenant['company_name'];
    $email    = $tenant['admin_email'];
    $stamp    = date('Y-m-d H:i:s');
    $path     = $targetPath ?: '/';
    $prefix   = $tenant['db_prefix'];

    return <<<TXT
===============================================================
  MIGRATION — {$company}
  Slug tenant : {$slug}
  Domaine cible : {$targetHost}
  Chemin cible : {$path}
  Genere le : {$stamp}
===============================================================

CONTENU DU PAQUET
-----------------
  cortoba-plateforme/
    ├── database.sql          Dump complet des tables (prefixe CA_)
    ├── config/db.php         Config BDD (A ADAPTER)
    ├── config-sample.txt     Recapitulatif des parametres
    ├── README-MIGRATION.txt  Ce fichier
    └── (fichiers de la plateforme)

ETAPES DE DEPLOIEMENT
---------------------

1. Creer une base MySQL sur le nouvel hebergement.
   Notez les identifiants (host, nom base, user, mot de passe).

2. Uploader tout le dossier cortoba-plateforme/ a l'emplacement souhaite
   sur le domaine {$targetHost}.
   (Typiquement public_html/ pour une installation a la racine)

3. Editer config/db.php :
   - DB_HOST, DB_NAME, DB_USER, DB_PASS : identifiants MySQL
   - JWT_SECRET : laisser la valeur auto-generee ou en mettre une propre
   - Le prefixe DB_PREFIX doit rester 'CA_'

4. Importer database.sql via phpMyAdmin (ou mysql -u ... < database.sql)
   dans la base creee a l'etape 1.

5. Tester l'acces a la plateforme :
   - Connexion : {$email}
   - Mot de passe : (celui defini lors de l'essai, ou regenerer via admin)

6. Une fois l'instance operationnelle, finaliser cote Cortoba :
   console settings → section Clients → "Marquer comme migre"
   Cela bloque l'acces a l'instance d'essai.

COMPTES
-------
  Compte admin : {$email}
  (mot de passe inchange depuis l'essai, ou regenere)

INFO TECHNIQUE
--------------
  Prefixe tables source : {$prefix}
  Prefixe tables cible  : CA_
  (le dump convertit automatiquement les prefixes)

SUPPORT
-------
  Cortoba Architecture
  cortobaarchitecture@gmail.com

===============================================================
TXT;
}

// Recapitulatif des parametres du tenant
function buildEnvSample(array $tenant, string $targetHost, string $targetPath): string {
    return "# Parametres tenant\n"
         . "TENANT_SLUG={$tenant['slug']}\n"
         . "COMPANY={$tenant['company_name']}\n"
         . "ADMIN_EMAIL={$tenant['admin_email']}\n"
         . "ADMIN_NAME={$tenant['admin_name']}\n"
         . "TARGET_DOMAIN={$targetHost}\n"
         . "TARGET_PATH={$targetPath}\n"
         . "DB_PREFIX_SOURCE={$tenant['db_prefix']}\n"
         . "DB_PREFIX_TARGET=CA_\n"
         . "EXPORT_DATE=" . date('Y-m-d H:i:s') . "\n";
}
