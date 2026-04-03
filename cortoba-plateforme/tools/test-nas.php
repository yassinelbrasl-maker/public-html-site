<?php
// ═══════════════════════════════════════════════════════════
//  Test NAS WebDAV — diagnostic de création de dossiers
//  Usage: php tools/test-nas.php
// ═══════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/middleware.php';

header('Content-Type: text/plain; charset=utf-8');

echo "=== DIAGNOSTIC NAS WebDAV ===\n\n";

// 1. Lire les paramètres depuis CA_settings
$db = getDB();
$keys = ['cortoba_nas_local', 'cortoba_nas_webdav_port', 'cortoba_nas_webdav',
         'cortoba_nas_user', 'cortoba_nas_pass', 'cortoba_nas_public_ip'];
$cfg = [];
foreach ($keys as $k) {
    try {
        $stmt = $db->prepare('SELECT setting_value FROM CA_settings WHERE setting_key = ? LIMIT 1');
        $stmt->execute([$k]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $decoded = json_decode($row['setting_value'], true);
            $cfg[$k] = ($decoded !== null) ? $decoded : $row['setting_value'];
        } else {
            $cfg[$k] = '';
        }
    } catch (Exception $e) {
        $cfg[$k] = '(erreur: ' . $e->getMessage() . ')';
    }
}

echo "1. PARAMETRES (table CA_settings):\n";
foreach ($cfg as $k => $v) {
    $display = ($k === 'cortoba_nas_pass' && $v) ? str_repeat('*', strlen($v)) : $v;
    echo "   $k = '$display'\n";
}

// 2. Extraire IP et WebDAV base
$local      = $cfg['cortoba_nas_local'] ?: '';
$webdavPort = $cfg['cortoba_nas_webdav_port'] ?: '5005';
$webdavBase = $cfg['cortoba_nas_webdav'] ?: '';
$user       = $cfg['cortoba_nas_user'] ?: 'admin';
$pass       = $cfg['cortoba_nas_pass'] ?: '';
$publicIp   = $cfg['cortoba_nas_public_ip'] ?: '';

// Auto-extract webdav base from UNC path
if (!$webdavBase && $local && preg_match('/^[\\\\\/]{2}[^\\\\\/]+[\\\\\/](.+)$/', $local, $mx)) {
    $webdavBase = str_replace('\\', '/', trim($mx[1], '\\/'));
    echo "\n   -> WebDAV base auto-extrait du UNC: '$webdavBase'\n";
} else if (!$webdavBase) {
    echo "\n   ⚠ WebDAV base (cortoba_nas_webdav) est VIDE et l'auto-extraction a échoué !\n";
    echo "   -> cortoba_nas_local ('$local') n'est pas au format UNC (\\\\IP\\share\\path)\n";
    echo "   -> Le chemin WebDAV sera INCOMPLET !\n";
}

// Extract IP
if ($publicIp) {
    $ip = trim($publicIp);
    echo "\n   -> IP utilisée (publique): $ip\n";
} elseif ($local) {
    if (preg_match('/^[\\\\\/]{2}([^\\\\\/]+)/', $local, $m)) {
        $ip = $m[1];
    } else {
        $ip = trim($local);
    }
    echo "\n   -> IP utilisée (locale): $ip\n";
} else {
    $ip = '';
    echo "\n   ⚠ AUCUNE IP configurée !\n";
}

echo "\n2. URL WebDAV construite:\n";
$base = rtrim('http://' . $ip . ':' . $webdavPort . ($webdavBase ? '/' . ltrim(str_replace('\\', '/', $webdavBase), '/') : ''), '/');
echo "   Base: $base\n";
$testYear = date('Y');
$yearUrl = $base . '/' . $testYear . '/';
echo "   Année: $yearUrl\n";
$testFolder = $yearUrl . 'TEST_NAS_DIAG/';
echo "   Test:  $testFolder\n";

if (!$ip || !$webdavPort) {
    echo "\n⚠ Configuration incomplète — impossible de tester.\n";
    exit;
}

// 3. Test ping HTTP
echo "\n3. TEST CONNEXION HTTP:\n";
if (!function_exists('curl_init')) {
    echo "   ⚠ cURL non disponible !\n";
    exit;
}

$ch = curl_init('http://' . $ip . ':' . $webdavPort . '/');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_NOBODY, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

echo "   HTTP GET http://$ip:$webdavPort/ → code=$httpCode";
if ($error) echo " erreur='$error'";
echo "\n";

if ($httpCode == 0) {
    echo "   ⚠ CONNEXION IMPOSSIBLE — le NAS n'est pas accessible sur ce port.\n";
    echo "   Vérifiez: IP, port WebDAV, firewall, réseau.\n";
    exit;
}

// 4. Test PROPFIND sur la base
echo "\n4. TEST PROPFIND (lecture dossiers):\n";
$ch = curl_init($base . '/');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PROPFIND');
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Depth: 1', 'Content-Type: application/xml']);
curl_setopt($ch, CURLOPT_USERPWD, $user . ':' . $pass);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
$body = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

echo "   PROPFIND $base/ → code=$httpCode\n";
if ($error) echo "   Erreur cURL: $error\n";

if ($httpCode == 207) {
    echo "   ✓ WebDAV accessible — contenu:\n";
    if (preg_match_all('/<(?:D:|d:)?href>([^<]+)<\/(?:D:|d:)?href>/i', $body, $matches)) {
        foreach ($matches[1] as $href) {
            echo "     $href\n";
        }
    }
} elseif ($httpCode == 401) {
    echo "   ⚠ AUTHENTIFICATION ÉCHOUÉE — vérifiez user/pass\n";
} elseif ($httpCode == 404) {
    echo "   ⚠ CHEMIN INTROUVABLE — le dossier WebDAV n'existe pas\n";
    echo "   Essai sans le base path...\n";
    // Try without webdav base
    $altBase = 'http://' . $ip . ':' . $webdavPort . '/';
    $ch = curl_init($altBase);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PROPFIND');
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Depth: 1', 'Content-Type: application/xml']);
    curl_setopt($ch, CURLOPT_USERPWD, $user . ':' . $pass);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    $body2 = curl_exec($ch);
    $code2 = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    echo "   PROPFIND $altBase → code=$code2\n";
    if ($code2 == 207 && preg_match_all('/<(?:D:|d:)?href>([^<]+)<\/(?:D:|d:)?href>/i', $body2, $m2)) {
        echo "   Dossiers à la racine:\n";
        foreach ($m2[1] as $href) echo "     $href\n";
    }
} else {
    echo "   ⚠ Réponse inattendue\n";
    if ($body) echo "   Body: " . substr($body, 0, 500) . "\n";
}

// 5. Test MKCOL (créer un dossier test puis le supprimer)
echo "\n5. TEST CRÉATION DOSSIER:\n";
echo "   MKCOL $testFolder\n";

$ch = curl_init($testFolder);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'MKCOL');
curl_setopt($ch, CURLOPT_USERPWD, $user . ':' . $pass);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
$mkBody = curl_exec($ch);
$mkCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$mkError = curl_error($ch);
curl_close($ch);

echo "   → code=$mkCode\n";
if ($mkError) echo "   Erreur: $mkError\n";
if ($mkCode == 201) {
    echo "   ✓ DOSSIER CRÉÉ avec succès !\n";
    // Nettoyer : supprimer le dossier test
    $ch = curl_init($testFolder);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'DELETE');
    curl_setopt($ch, CURLOPT_USERPWD, $user . ':' . $pass);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    curl_exec($ch);
    $delCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    echo "   Nettoyage (DELETE): code=$delCode\n";
} elseif ($mkCode == 405) {
    echo "   → Dossier existe déjà (405) — OK\n";
} elseif ($mkCode == 409) {
    echo "   ⚠ CONFLIT (409) — le dossier parent n'existe pas\n";
    echo "   → Le chemin année '$testYear' n'existe probablement pas dans '$base'\n";
} elseif ($mkCode == 401) {
    echo "   ⚠ AUTHENTIFICATION ÉCHOUÉE\n";
} elseif ($mkCode == 0) {
    echo "   ⚠ PAS DE RÉPONSE — connexion impossible\n";
} else {
    echo "   ⚠ Code inattendu\n";
    if ($mkBody) echo "   Body: " . substr($mkBody, 0, 300) . "\n";
}

echo "\n=== FIN DIAGNOSTIC ===\n";
