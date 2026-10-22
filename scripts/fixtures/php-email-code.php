<?php
/** Shared mailbox proof, including a locked wrong-code budget across both APIs. */
function eastelCheckEmailCode(array $record, string $code, string $expectedEmail = ''): ?string {
    $email = strtolower(trim((string)($record['email'] ?? '')));
    if ($email === '' || ($expectedEmail !== '' && $email !== strtolower(trim($expectedEmail)))) {
        return 'Verification does not belong to this email.';
    }
    $expires = strtotime((string)($record['expires_at'] ?? ''));
    if ($expires === false || $expires <= time()) {
        return 'Verification code has expired. Please request a new one.';
    }
    if (!preg_match('/^[0-9]{6}$/', $code)) return 'Invalid code format.';

    $key = hash('sha256', (string)($record['id'] ?? '') . '|' . $email);
    $file = sys_get_temp_dir() . '/eastel_email_code_' . $key . '.json';
    $lock = @fopen($file, 'c+');
    if ($lock === false) return 'Verification is temporarily unavailable. Please try again.';
    try {
        if (!flock($lock, LOCK_EX)) return 'Verification is temporarily unavailable. Please try again.';
        $raw = stream_get_contents($lock);
        $state = $raw === '' ? ['count' => 0] : json_decode($raw, true);
        if (!is_array($state) || !isset($state['count']) || !is_int($state['count']) || $state['count'] < 0) {
            return 'Verification is temporarily unavailable. Please request a new code.';
        }
        if ($state['count'] >= 5) return 'Too many incorrect attempts. Please request a new code.';
        if (!hash_equals((string)($record['code'] ?? ''), $code)) {
            $state['count']++;
            $encoded = json_encode($state);
            rewind($lock);
            if (!ftruncate($lock, 0) || fwrite($lock, $encoded) !== strlen($encoded) || !fflush($lock)) {
                return 'Verification is temporarily unavailable. Please request a new code.';
            }
            return $state['count'] >= 5 ? 'Too many incorrect attempts. Please request a new code.' : 'Incorrect verification code. Please try again.';
        }
        return null;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
