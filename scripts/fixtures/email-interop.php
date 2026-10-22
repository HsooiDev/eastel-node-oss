<?php
// Local CLI fixture only. php-email-code.php is the exact PHP reference helper
// from c49077c5a3bbe81ac108ec9518f2a8ae51f9ffd2 (SHA-256 in the delivery report).
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
date_default_timezone_set('UTC');
require __DIR__ . '/php-email-code.php';
$input = json_decode(stream_get_contents(STDIN), true, 32, JSON_THROW_ON_ERROR);
if (($input['operation'] ?? '') === 'issue') {
    $code = $input['code'] ?? str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    if (!is_string($code) || !preg_match('/^[0-9]{6}$/', $code)) exit(2);
    // Same raw bearer representation and one-hour SQL DATETIME as PHP auth.php.
    echo json_encode(['id' => 1, 'email' => 'fixture@example.invalid', 'code' => $code,
        'token' => bin2hex(random_bytes(32)), 'verified' => 0,
        'expires_at' => date('Y-m-d H:i:s', time() + 3600)], JSON_THROW_ON_ERROR);
} elseif (($input['operation'] ?? '') === 'check') {
    $problem = eastelCheckEmailCode($input['record'], $input['code'], $input['email'] ?? '');
    echo json_encode(['valid' => $problem === null], JSON_THROW_ON_ERROR);
} else exit(2);
