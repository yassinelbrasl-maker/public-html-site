<?php
// ═══════════════════════════════════════════════════════
//  CORTOBA ATELIER — Proxy scan de factures (Gemini Vision)
//  Fichier : /cortoba_plateforme/facture_proxy.php
// ═══════════════════════════════════════════════════════

$API_KEY = 'AIzaSyBDr7mKsjrp591EJIE2UqlaTCRY3Qj3soE';
$MODEL   = 'gemini-2.0-flash-lite';

// Augmenter les limites PHP
@set_time_limit(120);
@ini_set('memory_limit', '256M');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$body = file_get_contents('php://input');
if (!$body) {
    http_response_code(400);
    echo json_encode(['error' => 'Corps de requête vide']);
    exit;
}

$data = json_decode($body, true);
if (!$data || !isset($data['imageBase64']) || !isset($data['mimeType'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Paramètres manquants : imageBase64 et mimeType requis']);
    exit;
}

// Réduire la taille de l'image si trop grosse (>500KB base64 ≈ 375KB image)
$imageData = $data['imageBase64'];
$mimeType  = $data['mimeType'];

$prompt = "Tu es un expert comptable. Analyse cette facture et retourne UNIQUEMENT un objet JSON (sans markdown, sans texte avant ou après). " .
    "Structure exacte requise : " .
    "{\"fournisseur\":\"nom\",\"reference\":\"ref\",\"date\":\"YYYY-MM-DD\",\"libelle\":\"description\",\"categorie\":\"categorie\",\"montant_ht\":0.000,\"taux_tva\":19,\"montant_tva\":0.000,\"montant_ttc\":0.000,\"code_tva_fournisseur\":\"matricule\",\"lignes\":[{\"desc\":\"article\",\"ht\":0.000,\"tva\":19}],\"message\":\"\"} " .
    "Catégories possibles : Salaires & charges, Logiciels & licences, Loyer & charges, Déplacements, Fournitures, Marketing & communication, Frais bancaires, Honoraires externes, Autre. " .
    "taux_tva = pourcentage entier (7, 13, 19, etc). Si champ absent = null. Dans message : noter les informations manquantes. " .
    "IMPORTANT : Répondre UNIQUEMENT avec le JSON, aucun autre texte.";

$payload = [
    'contents' => [[
        'parts' => [
            ['text' => $prompt],
            ['inline_data' => [
                'mime_type' => $mimeType,
                'data'      => $imageData
            ]]
        ]
    ]],
    'generationConfig' => [
        'temperature'     => 0.1,
        'maxOutputTokens' => 1024,
        'responseMimeType' => 'application/json'
    ]
];

$url = 'https://generativelanguage.googleapis.com/v1beta/models/' . $MODEL . ':generateContent?key=' . $API_KEY;

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($payload),
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_TIMEOUT        => 90,
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$response  = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(500);
    echo json_encode(['error' => 'Erreur réseau cURL : ' . $curlError]);
    exit;
}

if (!$response) {
    http_response_code(500);
    echo json_encode(['error' => 'Réponse vide du serveur Gemini (timeout ?)']);
    exit;
}

$geminiData = json_decode($response, true);

// Vérifier les erreurs Gemini
if (isset($geminiData['error'])) {
    http_response_code(500);
    echo json_encode(['error' => 'Erreur Gemini : ' . ($geminiData['error']['message'] ?? json_encode($geminiData['error']))]);
    exit;
}

// Extraire le texte
if (!isset($geminiData['candidates'][0]['content']['parts'][0]['text'])) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Structure de réponse Gemini inattendue',
        'http_code' => $httpCode,
        'raw' => substr($response, 0, 500)
    ]);
    exit;
}

$text  = $geminiData['candidates'][0]['content']['parts'][0]['text'];
$clean = preg_replace('/```json\s*|\s*```/', '', $text);
$clean = trim($clean);

$parsed = json_decode($clean, true);
if (!$parsed) {
    // Essayer de trouver le JSON dans le texte
    preg_match('/\{.*\}/s', $clean, $matches);
    if ($matches) {
        $parsed = json_decode($matches[0], true);
    }
    if (!$parsed) {
        http_response_code(500);
        echo json_encode(['error' => 'JSON invalide retourné par Gemini', 'raw' => substr($clean, 0, 300)]);
        exit;
    }
}

echo json_encode($parsed);
