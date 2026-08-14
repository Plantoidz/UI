<?php
// video.php — receive a generated Plantoid video, store it, return its public URL.
//   POST multipart: file=<mp4>, token_id=<str>, plantoid=<n>
//   Response body: the public URL, as a plain string.

header('Content-Type: text/plain; charset=utf-8');

$DATA_DIR  = __DIR__ . '/data';
$BASE_URL  = 'https://feed.plantoid.org';     // <-- must map to this script's folder; adjust
$MAX_BYTES = 200 * 1024 * 1024;          // 200 MB cap

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); echo 'POST only'; exit;
}

// fields — sanitize, never trust
$plantoid = isset($_POST['plantoid']) ? preg_replace('/\D/', '', $_POST['plantoid']) : '';
$token    = isset($_POST['token_id']) ? preg_replace('/[^A-Za-z0-9_-]/', '', $_POST['token_id']) : '';
if ($plantoid === '' || $token === '') {
    http_response_code(400); echo 'missing plantoid or token_id'; exit;
}

// upload present and OK?
if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400); echo 'no file'; exit;
}
if ($_FILES['file']['size'] > $MAX_BYTES) {
    http_response_code(413); echo 'file too large'; exit;
}

// store at videos/<plantoid>/<token>.mp4 — name derived here, not from the client
$dir = $DATA_DIR . '/videos/' . $plantoid;
if (!is_dir($dir)) { mkdir($dir, 0775, true); }
$dest = $dir . '/' . $token . '.mp4';

if (!move_uploaded_file($_FILES['file']['tmp_name'], $dest)) {
    http_response_code(500); echo 'could not store file'; exit;
}

echo $BASE_URL . '/data/videos/' . $plantoid . '/' . $token . '.mp4';
