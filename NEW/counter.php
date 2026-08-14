<?php
// counter.php — fake-feed counter for Plantoids.
//   GET counter.php?n=21          -> prints current count   (the plantoid polls this)
//   GET counter.php?n=21&feed=1   -> increments, prints new count  (the public "feed" action)
//
// Storage: one text file per plantoid at data/counters/<n>.txt

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

$DATA_DIR = __DIR__ . '/data';

// plantoid number: digits only
$n = isset($_GET['n']) ? preg_replace('/\D/', '', $_GET['n']) : '';
if ($n === '') {
    http_response_code(400);
    echo '';                 // empty body -> client reads it as 0
    exit;
}

$dir  = $DATA_DIR . '/counters';
$file = $dir . '/' . $n . '.txt';
if (!is_dir($dir)) { mkdir($dir, 0775, true); }

$feed = isset($_GET['feed']) && $_GET['feed'] !== '0';

// open (create if missing), lock for the whole read/increment/write
$fp = fopen($file, 'c+');
if ($fp === false) { http_response_code(500); echo ''; exit; }
flock($fp, LOCK_EX);

$count = (int) trim(stream_get_contents($fp));   // empty/garbage -> 0

if ($feed) {
    $count++;
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, (string) $count);
    fflush($fp);
}

flock($fp, LOCK_UN);
fclose($fp);

echo $count;

?>