<?php
// ============================================================
//  CORTOBA DIGITAL STUDIO — API de synchronisation
//  Met a jour les fonctions (fichiers) de la copie commerciale
//  depuis le dossier source /cortoba-plateforme/.
//  Les donnees (tables CDS_*) ne sont jamais touchees.
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$action = isset($_GET['action']) ? $_GET['action'] : '';

if      ($action === 'status')  handleStatus();
else if ($action === 'run')     handleRun();
else                            jsonError('Action inconnue', 404);

// ──────────────────────────────────────────────────────────────
//  STATUS — renvoie l'etat courant de l'instance
// ──────────────────────────────────────────────────────────────
function handleStatus() {
    $user = requireAdmin();
    $db   = getDB();
    ensureSyncSettingsTable($db);

    $lastSync = null;
    try {
        $stmt = $db->prepare("SELECT setting_value FROM " . t('settings') . " WHERE setting_key = 'cds_last_sync' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) $lastSync = $row['setting_value'];
    } catch (\Throwable $e) { /* table absente */ }

    jsonOk([
        'instance_name' => defined('INSTANCE_NAME')   ? INSTANCE_NAME   : 'Cortoba Digital Studio',
        'instance_slug' => defined('INSTANCE_SLUG')   ? INSTANCE_SLUG   : 'cortobadigitalstudio',
        'source'        => defined('INSTANCE_SOURCE') ? INSTANCE_SOURCE : 'cortoba-plateforme',
        'db_prefix'     => DB_PREFIX,
        'last_sync'     => $lastSync
    ]);
}

// ──────────────────────────────────────────────────────────────
//  RUN — execute la synchronisation des fichiers
// ──────────────────────────────────────────────────────────────
function handleRun() {
    $user = requireAdmin();
    @set_time_limit(300);

    $started = microtime(true);

    $destRoot   = realpath(__DIR__ . '/..');
    $sourceName = defined('INSTANCE_SOURCE') ? INSTANCE_SOURCE : 'cortoba-plateforme';
    $sourceRoot = realpath(dirname($destRoot) . '/' . $sourceName);

    if (!$sourceRoot || !is_dir($sourceRoot)) {
        jsonError('Dossier source introuvable : ' . $sourceName, 500);
    }
    if (!$destRoot || !is_dir($destRoot)) {
        jsonError('Dossier destination introuvable', 500);
    }
    if ($sourceRoot === $destRoot) {
        jsonError('Source et destination identiques — abandon', 500);
    }

    // Chemins relatifs (depuis la racine de l'instance) a ne JAMAIS ecraser
    $protected = [
        'config/db.php',           // Config BDD independante
        'config/trial_guard.php',  // Garde d'expiration des tenants
        'settings.html',           // Page de gestion commerciale
        'api/sync.php',            // Cette API
        'api/tenants.php',         // API gestion des tenants (essais)
        'api/migrate.php',         // API migration vers nouveau domaine
        '.htaccess',               // Routing local
    ];

    // Dossiers du source a ignorer (tenants/exports specifiques a l'instance)
    $skipDirs = ['c', 'exports'];

    // Fichiers du source a ignorer (residus d'install/dev)
    $skipFiles = [
        'install.php',
        '_livrables_fix.patch',
    ];

    // Transformations appliquees au contenu des fichiers texte
    $replacements = [
        'CA_'                  => 'CDS_',
        'cortoba-plateforme'   => 'cortobadigitalstudio',
        'cortoba_users'        => 'cds_users',
        'cortoba_modules'      => 'cds_modules',
        'cortoba_missions'     => 'cds_missions',
        'cortoba_livrables_catalogue' => 'cds_livrables_catalogue',
        'cortoba_taches_types' => 'cds_taches_types',
    ];

    // Extensions traitees comme texte (pour appliquer les remplacements)
    $textExt = ['php', 'sql', 'js', 'html', 'css', 'txt', 'json', 'md', 'htaccess'];

    $stats = ['copied' => 0, 'skipped' => 0, 'log' => []];

    syncDirectory($sourceRoot, $destRoot, '', $protected, $skipFiles, $skipDirs, $replacements, $textExt, $stats);

    // Enregistrer la date de derniere synchro
    try {
        $db = getDB();
        ensureSyncSettingsTable($db);
        $now = date('Y-m-d H:i:s');
        $db->prepare("INSERT INTO " . t('settings') . " (setting_key, setting_value, updated_at)
                      VALUES ('cds_last_sync', ?, NOW())
                      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()")
           ->execute([$now]);
        logMemberActivity($user['id'], $user['name'] ?? $user['email'] ?? 'admin', 'cds_sync', [
            'files_copied'  => $stats['copied'],
            'files_skipped' => $stats['skipped']
        ]);
    } catch (\Throwable $e) {
        $stats['log'][] = 'Journalisation echouee : ' . $e->getMessage();
    }

    jsonOk([
        'files_copied'  => $stats['copied'],
        'files_skipped' => $stats['skipped'],
        'log'           => array_slice($stats['log'], 0, 200),
        'duration_ms'   => (int) round((microtime(true) - $started) * 1000)
    ]);
}

// ──────────────────────────────────────────────────────────────
//  Parcourt recursivement $sourceDir et copie vers $destDir
// ──────────────────────────────────────────────────────────────
function syncDirectory($sourceRoot, $destRoot, $relPath, $protected, $skipFiles, $skipDirs, $replacements, $textExt, &$stats) {
    $sourceDir = $sourceRoot . ($relPath ? '/' . $relPath : '');
    $destDir   = $destRoot   . ($relPath ? '/' . $relPath : '');

    // Ignorer les dossiers proteges de l'instance (tenants, exports)
    if ($relPath !== '' && in_array($relPath, $skipDirs, true)) {
        $stats['skipped']++;
        $stats['log'][] = 'dossier protege : ' . $relPath;
        return;
    }

    if (!is_dir($destDir)) {
        if (!@mkdir($destDir, 0755, true)) {
            $stats['log'][] = 'mkdir impossible : ' . $relPath;
            return;
        }
    }

    $dh = @opendir($sourceDir);
    if (!$dh) {
        $stats['log'][] = 'opendir impossible : ' . $relPath;
        return;
    }

    while (($entry = readdir($dh)) !== false) {
        if ($entry === '.' || $entry === '..') continue;

        $sourcePath  = $sourceDir . '/' . $entry;
        $destPath    = $destDir   . '/' . $entry;
        $relEntry    = ($relPath ? $relPath . '/' : '') . $entry;
        $relEntryLow = strtolower($relEntry);

        if (is_dir($sourcePath)) {
            syncDirectory($sourceRoot, $destRoot, $relEntry, $protected, $skipFiles, $skipDirs, $replacements, $textExt, $stats);
            continue;
        }

        // Protection des fichiers specifiques a l'instance
        if (in_array($relEntry, $protected, true)) {
            $stats['skipped']++;
            $stats['log'][] = 'protege : ' . $relEntry;
            continue;
        }

        // Fichiers a ignorer du source
        if (in_array($entry, $skipFiles, true)) {
            $stats['skipped']++;
            $stats['log'][] = 'ignore : ' . $relEntry;
            continue;
        }

        $ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));

        if (in_array($ext, $textExt, true)) {
            // Fichier texte : lire, transformer, ecrire
            $content = @file_get_contents($sourcePath);
            if ($content === false) {
                $stats['log'][] = 'lecture echec : ' . $relEntry;
                continue;
            }
            $transformed = strtr($content, $replacements);
            if (@file_put_contents($destPath, $transformed) === false) {
                $stats['log'][] = 'ecriture echec : ' . $relEntry;
                continue;
            }
            $stats['copied']++;
        } else {
            // Binaire : copie directe si modifie
            $destExists = file_exists($destPath);
            if ($destExists && filesize($sourcePath) === filesize($destPath) && filemtime($sourcePath) <= filemtime($destPath)) {
                $stats['skipped']++;
                continue;
            }
            if (!@copy($sourcePath, $destPath)) {
                $stats['log'][] = 'copie binaire echec : ' . $relEntry;
                continue;
            }
            $stats['copied']++;
        }
    }

    closedir($dh);
}

// ──────────────────────────────────────────────────────────────
//  S'assure que la table des parametres existe
// ──────────────────────────────────────────────────────────────
function ensureSyncSettingsTable(PDO $db) {
    $tbl = t('settings');
    $db->exec("CREATE TABLE IF NOT EXISTS $tbl (
        `setting_key`   VARCHAR(120) NOT NULL PRIMARY KEY,
        `setting_value` LONGTEXT     DEFAULT NULL,
        `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}
