<?php
$API_KEY = 'AIzaSyDDIViMVYuwV0ZMWNbcRU-l2S8EFtUErlQ';

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
$data = json_decode($body, true);

$systemPrompt = "You are the professional studio assistant for Cortoba Architecture Studio, based in Midoun, Djerba, Tunisia. Founded by Amal Cortoba and Yassine Mestiri, both HQE-certified architects. Services: architectural design (2D/3D), real estate assistance, interior design, construction management. Contact: +216 94 119 120. Respond in the same language as the user (French, English, or Arabic). Be warm and concise.";

$messages = $data['messages'] ?? [];
$geminiContents = [];
foreach ($messages as $msg) {
    $geminiContents[] = [
        'role'  => $msg['role'] === 'assistant' ? 'model' : 'user',
        'parts' => [['text' => $msg['content']]]
    ];
}

$geminiPayload = [
    'system_instruction' => ['parts' => [['text' => $systemPrompt]]],
    'contents'           => $geminiContents,
    'generationConfig'   => ['maxOutputTokens' => 500, 'temperature' => 0.7]
];

$url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=' . $API_KEY;

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($geminiPayload),
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
]);

$response  = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

// Return full Gemini response for debugging
if ($curlError) {
    echo json_encode(['error' => 'curl: ' . $curlError]);
    exit;
}

$geminiData = json_decode($response, true);

// Show full raw response to debug
if (!isset($geminiData['candidates'][0]['content']['parts'][0]['text'])) {
    echo json_encode(['error' => 'Bad response', 'raw' => $geminiData]);
    exit;
}

$replyText = $geminiData['candidates'][0]['content']['parts'][0]['text'];
echo json_encode(['content' => [['type' => 'text', 'text' => $replyText]]]);
