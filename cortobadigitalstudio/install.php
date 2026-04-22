<?php
// ============================================================
//  CORTOBA DIGITAL STUDIO — Installation (unique)
//  1. Cree toutes les tables CDS_* a partir de schema.sql
//  2. Cree le compte administrateur
//  3. SUPPRIMER ce fichier apres la premiere installation
// ============================================================

require_once __DIR__ . '/config/db.php';

header('Content-Type: text/html; charset=utf-8');

echo '<!doctype html><html lang="fr"><head><meta charset="utf-8">';
echo '<title>Installation — Cortoba Digital Studio</title>';
echo '<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; background:#0e0e0e; color:#e8e8e8;
         padding:40px 20px; line-height:1.6; max-width:720px; margin:0 auto; }
  h1 { color:#c8a96e; font-size:20px; letter-spacing:.15em; text-transform:uppercase; border-bottom:1px solid #2a2a2a; padding-bottom:12px; }
  h2 { color:#c8a96e; font-size:14px; letter-spacing:.1em; text-transform:uppercase; margin:28px 0 12px; }
  .ok   { color:#6ec07b; }
  .err  { color:#e07b72; }
  .warn { color:#c8a96e; }
  pre   { background:#161616; border:1px solid #2a2a2a; padding:12px; border-radius:4px; font-size:12px; overflow-x:auto; }
  code  { color:#c8a96e; }
  ul    { padding-left:22px; } li { margin:4px 0; }
  .box  { background:#161616; border:1px solid #2a2a2a; border-radius:4px; padding:16px; margin:16px 0; }
  .danger { background:rgba(224,123,114,.1); border-color:rgba(224,123,114,.3); color:#e07b72; }
</style></head><body>';

echo '<h1>Cortoba Digital Studio — Installation</h1>';

$db = getDB();

// ─────────────────────────────────────────────
// ETAPE 1 : Creer les tables CDS_*
// ─────────────────────────────────────────────
echo '<h2>1. Creation des tables CDS_*</h2>';

$schemaPath = __DIR__ . '/schema.sql';
if (!is_readable($schemaPath)) {
    echo '<p class="err">schema.sql introuvable : ' . htmlspecialchars($schemaPath) . '</p>';
    exit;
}

$sql = file_get_contents($schemaPath);

// Retirer les commentaires en ligne (-- ...)
$sql = preg_replace('/^\s*--[^\n]*$/m', '', $sql);

// Decouper sur les ; en fin d'instruction (en ignorant ceux dans les chaines)
$statements = [];
$buffer = '';
$inString = false;
$stringChar = '';
$prev = '';
for ($i = 0, $n = strlen($sql); $i < $n; $i++) {
    $c = $sql[$i];
    if ($inString) {
        $buffer .= $c;
        if ($c === $stringChar && $prev !== '\\') $inString = false;
    } else {
        if ($c === '"' || $c === "'") { $inString = true; $stringChar = $c; $buffer .= $c; }
        else if ($c === ';') {
            $trimmed = trim($buffer);
            if ($trimmed !== '') $statements[] = $trimmed;
            $buffer = '';
        } else {
            $buffer .= $c;
        }
    }
    $prev = $c;
}
if (trim($buffer) !== '') $statements[] = trim($buffer);

$created = 0; $skipped = 0; $errors = [];
$stmtTypes = ['CREATE TABLE', 'CREATE INDEX', 'ALTER TABLE', 'SET '];

foreach ($statements as $stmt) {
    $upper = strtoupper(substr(ltrim($stmt), 0, 20));
    $isRelevant = false;
    foreach ($stmtTypes as $t) {
        if (strpos($upper, $t) === 0) { $isRelevant = true; break; }
    }
    if (!$isRelevant) { $skipped++; continue; }

    try {
        $db->exec($stmt);
        if (strpos($upper, 'CREATE TABLE') === 0) {
            $created++;
        }
    } catch (PDOException $e) {
        // Ignorer les erreurs "table deja existante"
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = htmlspecialchars(substr($stmt, 0, 80)) . ' : ' . htmlspecialchars($e->getMessage());
        }
    }
}

// Compter les tables CDS_ existantes
try {
    $dbName = DB_NAME;
    $stmt = $db->prepare("SELECT COUNT(*) FROM information_schema.tables
                          WHERE table_schema = ? AND table_name LIKE ?");
    $stmt->execute([$dbName, DB_PREFIX . '%']);
    $totalTables = (int)$stmt->fetchColumn();
} catch (\Throwable $e) {
    $totalTables = '?';
}

echo '<div class="box">';
echo '<p class="ok">✓ ' . $created . ' tables creees (idempotent, IF NOT EXISTS)</p>';
echo '<p>Total de tables <code>' . DB_PREFIX . '*</code> presentes : <strong>' . $totalTables . '</strong></p>';
if (!empty($errors)) {
    echo '<p class="err">✗ ' . count($errors) . ' erreur(s) :</p><ul>';
    foreach (array_slice($errors, 0, 10) as $err) echo '<li class="err">' . $err . '</li>';
    echo '</ul>';
}
echo '</div>';

// ─────────────────────────────────────────────
// ETAPE 2 : Compte administrateur
// ─────────────────────────────────────────────
echo '<h2>2. Compte administrateur</h2>';

try {
    $stmt = $db->prepare('SELECT id, email FROM ' . t('accounts') . ' WHERE email = ?');
    $stmt->execute([ADMIN_EMAIL]);
    $existing = $stmt->fetch();

    if ($existing) {
        echo '<p class="warn">• Admin <code>' . htmlspecialchars(ADMIN_EMAIL) . '</code> deja present.</p>';
    } else {
        $id   = bin2hex(random_bytes(16));
        $hash = password_hash('Yassine2026', PASSWORD_BCRYPT, ['cost' => 12]);
        $db->prepare('INSERT INTO ' . t('accounts') . ' (id, email, name, role, password, approved) VALUES (?,?,?,?,?,1)')
           ->execute([$id, ADMIN_EMAIL, 'Administrateur CDS', 'admin', $hash]);
        echo '<div class="box">';
        echo '<p class="ok">✓ Compte administrateur cree</p>';
        echo '<ul>';
        echo '<li>Email : <code>' . htmlspecialchars(ADMIN_EMAIL) . '</code></li>';
        echo '<li>Mot de passe : <code>Yassine2026</code></li>';
        echo '</ul>';
        echo '</div>';
    }
} catch (PDOException $e) {
    echo '<p class="err">✗ Creation admin impossible : ' . htmlspecialchars($e->getMessage()) . '</p>';
}

// ─────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────
echo '<h2>3. Prochaine etape</h2>';
echo '<p>Connectez-vous sur la page de gestion :</p>';
echo '<p><a href="settings" style="color:#c8a96e;">→ /cortobadigitalstudio/settings</a></p>';

echo '<div class="box danger">';
echo '<strong>⚠ Securite :</strong> supprimez <code>install.php</code> du serveur apres cette premiere installation.';
echo '</div>';

echo '</body></html>';
