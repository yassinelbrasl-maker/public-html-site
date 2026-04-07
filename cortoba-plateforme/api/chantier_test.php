<?php
error_reporting(E_ALL);
ini_set('display_errors', '1');
header('Content-Type: text/plain; charset=utf-8');

echo "PHP " . PHP_VERSION . "\n\n";

// Check syntax of chantier.php without executing it
$file = __DIR__ . '/chantier.php';
$output = [];
$code = 0;
exec('php -l ' . escapeshellarg($file) . ' 2>&1', $output, $code);
echo "Syntax check (exec): code=$code\n";
echo implode("\n", $output) . "\n\n";

// Alternative: try to include and catch the error
echo "Trying to tokenize...\n";
try {
    $tokens = token_get_all(file_get_contents($file));
    echo "Tokenized OK: " . count($tokens) . " tokens\n\n";
} catch (\Throwable $e) {
    echo "Tokenize error: " . $e->getMessage() . "\n\n";
}

// Try to actually include it via eval-like approach
echo "Trying require in isolated scope...\n";
try {
    // Capture output to prevent headers issues
    ob_start();
    // Set required globals
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $_GET['action'] = '__diag_noop__';
    require_once __DIR__ . '/../config/middleware.php';
    ob_end_clean();

    ob_start();
    include $file;
    $out = ob_get_clean();
    echo "Include result: " . substr($out, 0, 500) . "\n";
} catch (\Throwable $e) {
    ob_end_clean();
    echo "Include error: " . $e->getMessage() . "\n";
    echo "File: " . basename($e->getFile()) . ":" . $e->getLine() . "\n";
}
