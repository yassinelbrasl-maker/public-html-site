<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$folders = isset($_GET['folders']) ? $_GET['folders'] : '';
if (!$folders) {
    echo json_encode(array('success' => false, 'error' => 'Parametre folders requis'));
    exit;
}

$basePath = '/share';
$fullPath = $basePath . '/' . ltrim(str_replace('\\', '/', $folders), '/');

// Securite : bloquer traversee de repertoire
if (strpos($folders, '..') !== false) {
    echo json_encode(array('success' => false, 'error' => 'Chemin non autorise'));
    exit;
}

$result = array('path' => $fullPath, 'folders_param' => $folders);

if (is_dir($fullPath)) {
    $result['success'] = true;
    $result['message'] = 'Le dossier existe deja';
    $result['created'] = 0;
} else {
    $ok = @mkdir($fullPath, 0777, true);
    if ($ok) {
        $result['success'] = true;
        $result['message'] = 'Dossier cree';
        $result['created'] = 1;

        // Copier les sous-dossiers du template 00-Dossier Type
        $yearDir = dirname($fullPath);
        $templateDir = $yearDir . '/00-Dossier Type';
        $copied = array();
        if (is_dir($templateDir)) {
            $items = @scandir($templateDir);
            if ($items) {
                foreach ($items as $item) {
                    if ($item === '.' || $item === '..') continue;
                    $src = $templateDir . '/' . $item;
                    if (is_dir($src)) {
                        $dest = $fullPath . '/' . $item;
                        if (!is_dir($dest)) {
                            copyDir($src, $dest);
                            $copied[] = $item;
                        }
                    }
                }
            }
        }
        if ($copied) {
            $result['template_copied'] = $copied;
        }
    } else {
        $err = error_get_last();
        $result['success'] = false;
        $result['error'] = isset($err['message']) ? $err['message'] : 'Impossible de creer le dossier';
    }
}

echo json_encode($result);

function copyDir($src, $dst) {
    @mkdir($dst, 0777, true);
    $items = @scandir($src);
    if (!$items) return;
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $s = $src . '/' . $item;
        $d = $dst . '/' . $item;
        if (is_dir($s)) {
            copyDir($s, $d);
        } else {
            @copy($s, $d);
        }
    }
}
