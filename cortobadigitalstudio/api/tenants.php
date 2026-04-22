<?php
// ============================================================
//  CORTOBA DIGITAL STUDIO — API Tenants (clients en essai)
//
//  Gestion des clients potentiels qui testent la plateforme :
//    - Chaque tenant = un dossier /cortobadigitalstudio/c/<slug>/
//    - Isolation BDD par prefixe T_<SLUG>_
//    - Duree d'essai variable (trial_days)
//    - Migration possible vers un nouveau domaine
//
//  Actions :
//    GET  ?action=list           Liste tous les tenants
//    POST ?action=create         Cree un nouveau tenant
//    POST ?action=extend         Prolonge un essai
//    POST ?action=revoke         Revoque l'acces
//    POST ?action=reactivate     Reactive un essai revoque
//    POST ?action=delete         Supprime definitivement (fichiers + tables)
//    POST ?action=regenerate     Regenere le mot de passe admin du tenant
//    GET  ?action=get&slug=...   Details d'un tenant
// ============================================================

require_once __DIR__ . '/../config/middleware.php';

$action = isset($_GET['action']) ? $_GET['action'] : '';

if      ($action === 'list')       handleList();
else if ($action === 'get')        handleGet();
else if ($action === 'create')     handleCreate();
else if ($action === 'extend')     handleExtend();
else if ($action === 'revoke')     handleRevoke();
else if ($action === 'reactivate') handleReactivate();
else if ($action === 'delete')     handleDelete();
else if ($action === 'regenerate') handleRegeneratePassword();
else                                jsonError('Action inconnue', 404);

// ─────────────────────────────────────────────────────────────
//  Initialisation - creer la table CDS_clients si absente
// ─────────────────────────────────────────────────────────────
function ensureTenantsTable() {
    static $done = false;
    if ($done) return;
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS " . t('clients') . " (
        `slug`             VARCHAR(32)  NOT NULL PRIMARY KEY,
        `company_name`     VARCHAR(200) NOT NULL,
        `admin_email`      VARCHAR(191) NOT NULL,
        `admin_name`       VARCHAR(120) DEFAULT NULL,
        `admin_phone`      VARCHAR(40)  DEFAULT NULL,
        `db_prefix`        VARCHAR(40)  NOT NULL UNIQUE,
        `trial_days`       INT          NOT NULL DEFAULT 14,
        `trial_started_at` DATETIME     NOT NULL,
        `trial_expires_at` DATETIME     NOT NULL,
        `status`           VARCHAR(20)  NOT NULL DEFAULT 'trial',
        `custom_domain`    VARCHAR(200) DEFAULT NULL,
        `migrated_at`      DATETIME     DEFAULT NULL,
        `notes`            TEXT         DEFAULT NULL,
        `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `created_by`       VARCHAR(120) DEFAULT NULL,
        KEY `idx_status`  (`status`),
        KEY `idx_expires` (`trial_expires_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $done = true;
}

// ─────────────────────────────────────────────────────────────
//  LIST - retourne tous les tenants avec statut calcule
// ─────────────────────────────────────────────────────────────
function handleList() {
    requireAdmin();
    ensureTenantsTable();
    $db = getDB();

    $rows = $db->query("SELECT * FROM " . t('clients') . " ORDER BY created_at DESC")->fetchAll();
    $now  = new DateTime();

    foreach ($rows as &$row) {
        $expires = new DateTime($row['trial_expires_at']);
        $diff = $now->diff($expires);
        $daysRemaining = (int)$diff->days;
        if ($expires < $now) $daysRemaining = -$daysRemaining;

        $row['days_remaining'] = $daysRemaining;
        $row['expired']        = $expires < $now;
        $row['platform_url']   = buildTenantUrl($row['slug']);
        $row['settings_url']   = buildTenantUrl($row['slug']) . 'settings';
    }
    unset($row);

    jsonOk($rows);
}

// ─────────────────────────────────────────────────────────────
//  GET - details d'un tenant
// ─────────────────────────────────────────────────────────────
function handleGet() {
    requireAdmin();
    ensureTenantsTable();
    $slug = isset($_GET['slug']) ? trim($_GET['slug']) : '';
    if (!$slug) jsonError('Parametre slug requis');

    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM " . t('clients') . " WHERE slug = ?");
    $stmt->execute([$slug]);
    $row = $stmt->fetch();
    if (!$row) jsonError('Tenant introuvable', 404);

    $row['platform_url'] = buildTenantUrl($row['slug']);
    $row['settings_url'] = buildTenantUrl($row['slug']) . 'settings';

    jsonOk($row);
}

// ─────────────────────────────────────────────────────────────
//  CREATE - cree un nouveau tenant (dossier + BDD + compte)
// ─────────────────────────────────────────────────────────────
function handleCreate() {
    $admin = requireAdmin();
    ensureTenantsTable();
    @set_time_limit(300);

    $body = getBody();
    $company   = trim($body['company_name'] ?? '');
    $email     = strtolower(trim($body['admin_email'] ?? ''));
    $adminName = trim($body['admin_name']  ?? '');
    $phone     = trim($body['admin_phone'] ?? '');
    $days      = (int)($body['trial_days']  ?? 14);
    $notes     = trim($body['notes'] ?? '');

    if (!$company)                           jsonError('Nom de l\'entreprise requis');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) jsonError('Email administrateur invalide');
    if ($days < 1 || $days > 365)            jsonError('Duree d\'essai entre 1 et 365 jours');

    $db = getDB();

    // Generer un slug unique
    $slug = generateSlug($company);
    $baseSlug = $slug;
    $i = 1;
    while (slugExists($db, $slug)) {
        $slug = $baseSlug . '-' . (++$i);
        if ($i > 99) jsonError('Impossible de generer un slug unique');
    }

    $dbPrefix = 'T_' . strtoupper(str_replace('-', '_', $slug)) . '_';

    // Verifier capacite MySQL (prefixe + nom table max 64 chars)
    if (strlen($dbPrefix) > 30) {
        jsonError('Nom d\'entreprise trop long, raccourcissez pour obtenir un prefixe BDD plus court');
    }

    // 1. Creer le dossier tenant
    $instanceRoot = realpath(__DIR__ . '/..');
    $tenantsRoot  = $instanceRoot . '/c';
    $tenantDir    = $tenantsRoot . '/' . $slug;

    if (!is_dir($tenantsRoot) && !@mkdir($tenantsRoot, 0755, true)) {
        jsonError('Creation du dossier /c impossible', 500);
    }
    if (is_dir($tenantDir)) {
        jsonError('Dossier tenant deja existant : ' . $slug, 500);
    }
    if (!@mkdir($tenantDir, 0755, true)) {
        jsonError('Creation du dossier tenant impossible', 500);
    }

    // 2. Copier les fichiers depuis la racine de l'instance
    $copyLog = ['copied' => 0, 'errors' => []];
    try {
        copyInstanceToTenant($instanceRoot, $tenantDir, $slug, $dbPrefix, $copyLog);
    } catch (\Throwable $e) {
        cleanupTenantDir($tenantDir);
        jsonError('Copie des fichiers echouee : ' . $e->getMessage(), 500);
    }

    // 3. Creer les tables du tenant en appliquant le prefixe T_<SLUG>_
    $schemaPath = $instanceRoot . '/schema.sql';
    if (!is_readable($schemaPath)) {
        cleanupTenantDir($tenantDir);
        jsonError('schema.sql introuvable', 500);
    }
    $schemaSql = file_get_contents($schemaPath);
    $schemaSql = str_replace('CDS_', $dbPrefix, $schemaSql);

    $tablesCreated = 0;
    $schemaErrors  = [];
    foreach (splitSqlStatements($schemaSql) as $stmt) {
        $upper = strtoupper(substr(ltrim($stmt), 0, 20));
        if (strpos($upper, 'CREATE TABLE') !== 0 && strpos($upper, 'CREATE INDEX') !== 0 &&
            strpos($upper, 'ALTER TABLE')  !== 0 && strpos($upper, 'SET ')           !== 0) {
            continue;
        }
        try {
            $db->exec($stmt);
            if (strpos($upper, 'CREATE TABLE') === 0) $tablesCreated++;
        } catch (PDOException $e) {
            if (strpos($e->getMessage(), 'already exists') === false) {
                $schemaErrors[] = substr($stmt, 0, 60) . ' : ' . $e->getMessage();
            }
        }
    }

    if ($tablesCreated === 0 && !empty($schemaErrors)) {
        cleanupTenantDir($tenantDir);
        dropTenantTables($db, $dbPrefix);
        jsonError('Creation des tables echouee : ' . implode(' | ', array_slice($schemaErrors, 0, 3)), 500);
    }

    // 4. Creer le compte admin du tenant dans T_<SLUG>_accounts
    $tenantPassword = generateRandomPassword();
    $hash = password_hash($tenantPassword, PASSWORD_BCRYPT, ['cost' => 12]);
    $adminId = bin2hex(random_bytes(16));

    try {
        $db->prepare("INSERT INTO `{$dbPrefix}accounts`
                      (id, email, name, role, password, approved)
                      VALUES (?, ?, ?, 'admin', ?, 1)")
           ->execute([$adminId, $email, $adminName ?: 'Administrateur', $hash]);
    } catch (PDOException $e) {
        cleanupTenantDir($tenantDir);
        dropTenantTables($db, $dbPrefix);
        jsonError('Creation du compte admin echouee : ' . $e->getMessage(), 500);
    }

    // 5. Enregistrer dans CDS_clients
    $now      = new DateTime();
    $expiresAt = (clone $now)->modify('+' . $days . ' days');

    try {
        $db->prepare("INSERT INTO " . t('clients') . "
                      (slug, company_name, admin_email, admin_name, admin_phone,
                       db_prefix, trial_days, trial_started_at, trial_expires_at,
                       status, notes, created_by)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'trial', ?, ?)")
           ->execute([
               $slug, $company, $email, $adminName, $phone,
               $dbPrefix, $days,
               $now->format('Y-m-d H:i:s'),
               $expiresAt->format('Y-m-d H:i:s'),
               $notes,
               $admin['name'] ?? $admin['email'] ?? 'admin'
           ]);
    } catch (PDOException $e) {
        cleanupTenantDir($tenantDir);
        dropTenantTables($db, $dbPrefix);
        jsonError('Enregistrement du tenant echoue : ' . $e->getMessage(), 500);
    }

    logMemberActivity(
        $admin['id'] ?? 'admin',
        $admin['name'] ?? $admin['email'] ?? 'admin',
        'tenant_create',
        ['slug' => $slug, 'company' => $company, 'trial_days' => $days]
    );

    jsonOk([
        'slug'             => $slug,
        'company_name'     => $company,
        'admin_email'      => $email,
        'admin_password'   => $tenantPassword,   // Retourne en clair UNE SEULE FOIS
        'db_prefix'        => $dbPrefix,
        'trial_days'       => $days,
        'trial_expires_at' => $expiresAt->format('Y-m-d H:i:s'),
        'platform_url'     => buildTenantUrl($slug),
        'settings_url'     => buildTenantUrl($slug) . 'settings',
        'files_copied'     => $copyLog['copied'],
        'tables_created'   => $tablesCreated
    ]);
}

// ─────────────────────────────────────────────────────────────
//  EXTEND - prolonge la duree d'essai
// ─────────────────────────────────────────────────────────────
function handleExtend() {
    $admin = requireAdmin();
    ensureTenantsTable();
    $body = getBody();
    $slug = trim($body['slug'] ?? '');
    $days = (int)($body['days'] ?? 0);

    if (!$slug)              jsonError('slug requis');
    if ($days < 1 || $days > 365) jsonError('Prolongation entre 1 et 365 jours');

    $db = getDB();
    $stmt = $db->prepare("SELECT trial_expires_at, status FROM " . t('clients') . " WHERE slug = ?");
    $stmt->execute([$slug]);
    $row = $stmt->fetch();
    if (!$row) jsonError('Tenant introuvable', 404);

    // Si deja expire, on repart de maintenant. Sinon on prolonge la date existante.
    $now     = new DateTime();
    $current = new DateTime($row['trial_expires_at']);
    $base    = ($current < $now) ? $now : $current;
    $newExpires = (clone $base)->modify('+' . $days . ' days');

    $db->prepare("UPDATE " . t('clients') . "
                  SET trial_expires_at = ?, status = 'trial', trial_days = trial_days + ?
                  WHERE slug = ?")
       ->execute([$newExpires->format('Y-m-d H:i:s'), $days, $slug]);

    logMemberActivity(
        $admin['id'] ?? 'admin',
        $admin['name'] ?? 'admin',
        'tenant_extend',
        ['slug' => $slug, 'days' => $days]
    );

    jsonOk([
        'slug'             => $slug,
        'trial_expires_at' => $newExpires->format('Y-m-d H:i:s'),
        'days_added'       => $days
    ]);
}

// ─────────────────────────────────────────────────────────────
//  REVOKE - marque le tenant comme revoque (trial_guard bloque)
// ─────────────────────────────────────────────────────────────
function handleRevoke() {
    $admin = requireAdmin();
    ensureTenantsTable();
    $body = getBody();
    $slug = trim($body['slug'] ?? '');
    if (!$slug) jsonError('slug requis');

    $db = getDB();
    $stmt = $db->prepare("UPDATE " . t('clients') . " SET status = 'revoked' WHERE slug = ?");
    $stmt->execute([$slug]);
    if ($stmt->rowCount() === 0) jsonError('Tenant introuvable', 404);

    logMemberActivity(
        $admin['id'] ?? 'admin',
        $admin['name'] ?? 'admin',
        'tenant_revoke',
        ['slug' => $slug]
    );

    jsonOk(['slug' => $slug, 'status' => 'revoked']);
}

// ─────────────────────────────────────────────────────────────
//  REACTIVATE - remet un tenant en statut trial
// ─────────────────────────────────────────────────────────────
function handleReactivate() {
    $admin = requireAdmin();
    ensureTenantsTable();
    $body = getBody();
    $slug = trim($body['slug'] ?? '');
    if (!$slug) jsonError('slug requis');

    $db = getDB();
    $stmt = $db->prepare("UPDATE " . t('clients') . " SET status = 'trial' WHERE slug = ?");
    $stmt->execute([$slug]);
    if ($stmt->rowCount() === 0) jsonError('Tenant introuvable', 404);

    logMemberActivity(
        $admin['id'] ?? 'admin',
        $admin['name'] ?? 'admin',
        'tenant_reactivate',
        ['slug' => $slug]
    );

    jsonOk(['slug' => $slug, 'status' => 'trial']);
}

// ─────────────────────────────────────────────────────────────
//  DELETE - suppression DEFINITIVE (fichiers + tables)
// ─────────────────────────────────────────────────────────────
function handleDelete() {
    $admin = requireAdmin();
    ensureTenantsTable();
    $body = getBody();
    $slug    = trim($body['slug'] ?? '');
    $confirm = trim($body['confirm'] ?? '');
    if (!$slug)                     jsonError('slug requis');
    if ($confirm !== $slug)         jsonError('Confirmation requise (tapez le slug pour confirmer)');

    $db = getDB();
    $stmt = $db->prepare("SELECT db_prefix FROM " . t('clients') . " WHERE slug = ?");
    $stmt->execute([$slug]);
    $row = $stmt->fetch();
    if (!$row) jsonError('Tenant introuvable', 404);

    $dbPrefix = $row['db_prefix'];

    // 1. Supprimer les tables
    dropTenantTables($db, $dbPrefix);

    // 2. Supprimer le dossier
    $tenantDir = realpath(__DIR__ . '/..') . '/c/' . $slug;
    cleanupTenantDir($tenantDir);

    // 3. Supprimer l'enregistrement
    $db->prepare("DELETE FROM " . t('clients') . " WHERE slug = ?")->execute([$slug]);

    logMemberActivity(
        $admin['id'] ?? 'admin',
        $admin['name'] ?? 'admin',
        'tenant_delete',
        ['slug' => $slug]
    );

    jsonOk(['slug' => $slug, 'deleted' => true]);
}

// ─────────────────────────────────────────────────────────────
//  REGENERATE - regenere le mot de passe admin du tenant
// ─────────────────────────────────────────────────────────────
function handleRegeneratePassword() {
    $admin = requireAdmin();
    ensureTenantsTable();
    $body = getBody();
    $slug = trim($body['slug'] ?? '');
    if (!$slug) jsonError('slug requis');

    $db = getDB();
    $stmt = $db->prepare("SELECT db_prefix, admin_email FROM " . t('clients') . " WHERE slug = ?");
    $stmt->execute([$slug]);
    $row = $stmt->fetch();
    if (!$row) jsonError('Tenant introuvable', 404);

    $dbPrefix = $row['db_prefix'];
    $newPass  = generateRandomPassword();
    $hash     = password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 12]);

    $stmt2 = $db->prepare("UPDATE `{$dbPrefix}accounts` SET password = ? WHERE email = ?");
    $stmt2->execute([$hash, $row['admin_email']]);

    if ($stmt2->rowCount() === 0) {
        // Compte supprime : recreer
        $id = bin2hex(random_bytes(16));
        $db->prepare("INSERT INTO `{$dbPrefix}accounts` (id, email, name, role, password, approved)
                      VALUES (?, ?, 'Administrateur', 'admin', ?, 1)")
           ->execute([$id, $row['admin_email'], $hash]);
    }

    logMemberActivity(
        $admin['id'] ?? 'admin',
        $admin['name'] ?? 'admin',
        'tenant_regenerate_password',
        ['slug' => $slug]
    );

    jsonOk([
        'slug'           => $slug,
        'admin_email'    => $row['admin_email'],
        'admin_password' => $newPass
    ]);
}

// ═════════════════════════════════════════════════════════════
//  Helpers
// ═════════════════════════════════════════════════════════════

function generateSlug(string $name): string {
    $slug = strtolower(trim($name));
    $slug = str_replace(
        ['à','á','â','ã','ä','ç','è','é','ê','ë','ì','í','î','ï',
         'ñ','ò','ó','ô','õ','ö','ù','ú','û','ü','ý','ÿ'],
        ['a','a','a','a','a','c','e','e','e','e','i','i','i','i',
         'n','o','o','o','o','o','u','u','u','u','y','y'],
        $slug
    );
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
    $slug = trim($slug, '-');
    if ($slug === '') $slug = 'client-' . substr(bin2hex(random_bytes(3)), 0, 6);
    if (strlen($slug) > 24) $slug = substr($slug, 0, 24);
    return $slug;
}

function slugExists(PDO $db, string $slug): bool {
    $stmt = $db->prepare("SELECT 1 FROM " . t('clients') . " WHERE slug = ?");
    $stmt->execute([$slug]);
    if ($stmt->fetchColumn()) return true;

    // Verifier aussi qu'aucun dossier n'existe sous c/
    $tenantDir = realpath(__DIR__ . '/..') . '/c/' . $slug;
    return is_dir($tenantDir);
}

function generateRandomPassword(int $length = 14): string {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%&*';
    $max   = strlen($chars) - 1;
    $pass  = '';
    for ($i = 0; $i < $length; $i++) {
        $pass .= $chars[random_int(0, $max)];
    }
    return $pass;
}

function buildTenantUrl(string $slug): string {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'] ?? 'cortobaarchitecture.com';
    $slugEnc = rawurlencode($slug);
    return $scheme . '://' . $host . '/cortobadigitalstudio/c/' . $slugEnc . '/';
}

// Decoupe un script SQL en instructions, en respectant les chaines
function splitSqlStatements(string $sql): array {
    $sql = preg_replace('/^\s*--[^\n]*$/m', '', $sql);
    $statements = [];
    $buf = '';
    $inStr = false;
    $strCh = '';
    $prev = '';
    for ($i = 0, $n = strlen($sql); $i < $n; $i++) {
        $c = $sql[$i];
        if ($inStr) {
            $buf .= $c;
            if ($c === $strCh && $prev !== '\\') $inStr = false;
        } else {
            if ($c === '"' || $c === "'") { $inStr = true; $strCh = $c; $buf .= $c; }
            else if ($c === ';') {
                $t = trim($buf);
                if ($t !== '') $statements[] = $t;
                $buf = '';
            } else {
                $buf .= $c;
            }
        }
        $prev = $c;
    }
    if (trim($buf) !== '') $statements[] = trim($buf);
    return $statements;
}

// Supprime toutes les tables portant le prefixe donne
function dropTenantTables(PDO $db, string $prefix): void {
    try {
        $stmt = $db->prepare("SELECT table_name FROM information_schema.tables
                              WHERE table_schema = ? AND table_name LIKE ?");
        $stmt->execute([DB_NAME, $prefix . '%']);
        $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
        if (!$tables) return;
        $db->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($tables as $tbl) {
            $db->exec("DROP TABLE IF EXISTS `$tbl`");
        }
        $db->exec('SET FOREIGN_KEY_CHECKS = 1');
    } catch (\Throwable $e) { /* silencieux */ }
}

// Supprime recursivement un dossier
function cleanupTenantDir(string $dir): void {
    if (!$dir || !is_dir($dir)) return;
    // Securite : ne jamais descendre au-dessus du dossier /c/
    $realC = realpath(__DIR__ . '/..') . DIRECTORY_SEPARATOR . 'c';
    $realDir = realpath($dir);
    if (!$realDir || strpos($realDir, $realC) !== 0) return;

    $rii = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($realDir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($rii as $f) {
        if ($f->isDir()) @rmdir($f->getPathname());
        else             @unlink($f->getPathname());
    }
    @rmdir($realDir);
}

// Copie les fichiers de l'instance commerciale vers le dossier tenant
function copyInstanceToTenant(string $srcRoot, string $destRoot, string $slug, string $dbPrefix, array &$log) {
    // Fichiers/dossiers a ne JAMAIS copier dans un tenant
    $skipNames = [
        'c',                   // dossier des tenants (eviter recursion)
        'install.php',         // pas d'installeur dans les tenants
        'schema.sql',          // pas besoin, tables deja creees
        '_livrables_fix.patch',
        '.git',
    ];
    $skipApi = [
        'tenants.php',         // l'API de gestion des tenants reste au niveau instance
        'migrate.php',         // meme chose pour la migration
        'sync.php',            // pas de synchro dans un tenant
    ];

    copyDirRecursive($srcRoot, $destRoot, '', $skipNames, $skipApi, $slug, $dbPrefix, $log);
}

function copyDirRecursive(string $srcRoot, string $destRoot, string $rel,
                          array $skipNames, array $skipApi,
                          string $slug, string $dbPrefix, array &$log) {
    $srcDir  = $srcRoot  . ($rel ? '/' . $rel : '');
    $destDir = $destRoot . ($rel ? '/' . $rel : '');

    if (!is_dir($destDir) && !@mkdir($destDir, 0755, true)) {
        $log['errors'][] = 'mkdir ' . $rel;
        return;
    }

    $dh = @opendir($srcDir);
    if (!$dh) return;

    while (($entry = readdir($dh)) !== false) {
        if ($entry === '.' || $entry === '..') continue;
        if (in_array($entry, $skipNames, true)) continue;

        $sPath = $srcDir  . '/' . $entry;
        $dPath = $destDir . '/' . $entry;
        $relEntry = ($rel ? $rel . '/' : '') . $entry;

        if (is_dir($sPath)) {
            // Ne pas copier settings.html : laisser au tenant la page minimale
            copyDirRecursive($srcRoot, $destRoot, $relEntry, $skipNames, $skipApi, $slug, $dbPrefix, $log);
            continue;
        }

        // Exclusion des fichiers API reserves au niveau instance
        if ($rel === 'api' && in_array($entry, $skipApi, true)) continue;

        $ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
        $textExt = ['php', 'js', 'html', 'css', 'txt', 'json', 'md'];

        if ($relEntry === 'config/db.php') {
            // Ecrire un db.php custom qui inclut le trial_guard
            $custom = buildTenantDbConfig($slug, $dbPrefix);
            if (@file_put_contents($dPath, $custom) === false) {
                $log['errors'][] = 'config/db.php';
                continue;
            }
            $log['copied']++;
            continue;
        }

        if ($relEntry === 'settings.html') {
            // Remplacer par une page settings simplifiee pour le tenant (pas de section Clients)
            $tenantSettings = buildTenantSettingsHtml($slug);
            if (@file_put_contents($dPath, $tenantSettings) === false) {
                $log['errors'][] = 'settings.html';
                continue;
            }
            $log['copied']++;
            continue;
        }

        if (in_array($ext, $textExt, true)) {
            $content = @file_get_contents($sPath);
            if ($content === false) { $log['errors'][] = 'read ' . $relEntry; continue; }
            // Remplacement prefixe BDD (CDS_ -> T_<SLUG>_)
            $content = str_replace('CDS_', $dbPrefix, $content);
            $content = str_replace('cortobadigitalstudio', 'cortobadigitalstudio/c/' . $slug, $content);
            // Attention : eviter les doubles remplacements sur les URLs deja adaptees
            $content = preg_replace(
                '#cortobadigitalstudio/c/' . preg_quote($slug, '#') . '/c/' . preg_quote($slug, '#') . '/#',
                'cortobadigitalstudio/c/' . $slug . '/',
                $content
            );
            if (@file_put_contents($dPath, $content) === false) {
                $log['errors'][] = 'write ' . $relEntry;
                continue;
            }
        } else {
            if (!@copy($sPath, $dPath)) {
                $log['errors'][] = 'copy ' . $relEntry;
                continue;
            }
        }
        $log['copied']++;
    }
    closedir($dh);
}

// Genere un db.php custom pour un tenant :
//  - utilise le prefixe T_<SLUG>_
//  - verifie l'expiration de l'essai a chaque requete via trial_guard
function buildTenantDbConfig(string $slug, string $dbPrefix): string {
    $slugEsc   = addslashes($slug);
    $prefixEsc = addslashes($dbPrefix);
    return <<<PHP
<?php
// ============================================================
//  TENANT "{$slug}" — Configuration BDD (generee automatiquement)
//  Donnees isolees via prefixe {$dbPrefix}
//  NE PAS EDITER : regenere a chaque reinstallation du tenant.
// ============================================================

define('DB_HOST',    '10.10.10.100');
define('DB_NAME',    'dxmmmjkr_CAS');
define('DB_USER',    'dxmmmjkr_admin');
define('DB_PASS',    'Yassine2026');
define('DB_CHARSET', 'utf8mb4');
define('DB_PREFIX',  '{$prefixEsc}');

define('JWT_SECRET', 'tenant_{$slugEsc}_secret_' . hash('sha256', '{$slugEsc}'));
define('JWT_EXPIRY', 86400 * 7);

define('ADMIN_EMAIL', '');

define('INSTANCE_NAME',    'Plateforme (essai)');
define('INSTANCE_SLUG',    'cortobadigitalstudio/c/{$slugEsc}');
define('INSTANCE_SOURCE',  '');

define('TENANT_SLUG',      '{$slugEsc}');
define('TENANT_DB_PREFIX', '{$prefixEsc}');
// Prefixe du registre central (instance commerciale)
define('MASTER_DB_PREFIX', 'CDS_');

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

// Trial guard : verifie que l'essai du tenant est toujours valide
require_once __DIR__ . '/../../../config/trial_guard.php';
trialGuardCheck(TENANT_SLUG);
PHP;
}

// Genere une page settings minimale pour le tenant (juste lien vers la plateforme)
function buildTenantSettingsHtml(string $slug): string {
    $slugEsc = htmlspecialchars($slug, ENT_QUOTES, 'UTF-8');
    return <<<HTML
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Gestion — {$slugEsc}</title>
  <style>
    body { font-family:-apple-system,Segoe UI,sans-serif; background:#0e0e0e; color:#e8e8e8;
           padding:40px 20px; max-width:720px; margin:0 auto; line-height:1.6; }
    h1 { color:#c8a96e; font-size:18px; letter-spacing:.15em; text-transform:uppercase;
         border-bottom:1px solid #2a2a2a; padding-bottom:12px; }
    a { color:#c8a96e; text-decoration:none; }
    .box { background:#161616; border:1px solid #2a2a2a; border-radius:4px; padding:16px; margin:16px 0; }
  </style>
</head>
<body>
  <h1>Plateforme — {$slugEsc}</h1>
  <div class="box">
    <p>Cette instance est une copie d'essai de la plateforme Cortoba Digital Studio.</p>
    <p>Acces principal : <a href="./plateforme-nas.html">plateforme-nas.html</a></p>
    <p>Portail client : <a href="./portail-client.html">portail-client.html</a></p>
  </div>
  <div class="box">
    <p>La gestion commerciale (prolongation, migration) se fait depuis la console principale :
       <a href="/cortobadigitalstudio/settings">cortobadigitalstudio/settings</a></p>
  </div>
</body>
</html>
HTML;
}
