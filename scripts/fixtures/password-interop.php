<?php
declare(strict_types=1);
// Synthetic stdin-only contract fixture. No application config, DB, or network.
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
if (!defined('PASSWORD_ARGON2ID')) {
    throw new RuntimeException('PHP Argon2id support is required.');
}
if ($input['operation'] === 'hash') {
    echo json_encode(['hash' => password_hash($input['password'], PASSWORD_ARGON2ID)], JSON_THROW_ON_ERROR);
} else {
    echo json_encode(['valid' => password_verify($input['password'], $input['hash'])], JSON_THROW_ON_ERROR);
}
