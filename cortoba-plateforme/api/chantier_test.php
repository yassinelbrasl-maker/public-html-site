<?php
error_reporting(E_ALL);
ini_set('display_errors', '1');
header('Content-Type: text/plain; charset=utf-8');

echo "PHP " . PHP_VERSION . "\n\n";

// Tokenize to check syntax
echo "Tokenizing chantier.php...\n";
try {
    $src = file_get_contents(__DIR__ . '/chantier.php');
    echo "File size: " . strlen($src) . " bytes\n";
    $tokens = token_get_all($src);
    echo "Tokens: " . count($tokens) . " - syntax OK\n\n";
} catch (\Throwable $e) {
    echo "Tokenize error: " . $e->getMessage() . "\n\n";
}

// Try include
echo "Including chantier.php...\n";
try {
    ob_start();
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $_GET['action'] = '';
    $_GET['id'] = null;
    require_once __DIR__ . '/../config/middleware.php';
    ob_end_clean();

    ob_start();
    include __DIR__ . '/chantier.php';
    $out = ob_get_clean();
    echo "Include OK. Output length: " . strlen($out) . "\n";
    echo "Output: " . substr($out, 0, 800) . "\n";
} catch (\Throwable $e) {
    $captured = ob_get_clean();
    echo "CAUGHT ERROR: " . $e->getMessage() . "\n";
    echo "File: " . basename($e->getFile()) . " line " . $e->getLine() . "\n";
    echo "Captured output: " . substr($captured, 0, 500) . "\n";
}
