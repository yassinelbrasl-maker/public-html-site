<?php
// ============================================================
//  CORTOBA ATELIER — Image optimizer
//  Resize + re-encode uploaded images to keep the public site fast.
// ============================================================
//
// optimizeImage($srcPath, $opts = [])
//   - Resizes image in place if it exceeds max_width / max_height.
//   - Re-encodes JPEG/WebP at a reasonable quality (default 82).
//   - Respects EXIF orientation for JPEG.
//   - Preserves PNG transparency.
//   - Silently no-ops if GD is missing or the file is not a supported image.
//
// Returns an array: [
//   'ok'          => bool,
//   'width'       => int,          // final width  (0 if not processed)
//   'height'      => int,          // final height (0 if not processed)
//   'before'      => int,          // size in bytes before
//   'after'       => int,          // size in bytes after
//   'skipped'     => string|null,  // reason if skipped, or null
// ]

function optimizeImage(string $srcPath, array $opts = []): array {
    $defaults = [
        'max_width'   => 1920,
        'max_height'  => 1920,
        'quality'     => 82,   // JPEG / WebP quality
        'png_level'   => 6,    // PNG compression level 0-9
    ];
    $o = array_merge($defaults, $opts);

    $result = [
        'ok'      => false,
        'width'   => 0,
        'height'  => 0,
        'before'  => 0,
        'after'   => 0,
        'skipped' => null,
    ];

    if (!is_file($srcPath) || !is_readable($srcPath)) {
        $result['skipped'] = 'file_missing';
        return $result;
    }

    $result['before'] = filesize($srcPath) ?: 0;

    if (!function_exists('imagecreatefromstring')) {
        $result['skipped'] = 'gd_missing';
        return $result;
    }

    $info = @getimagesize($srcPath);
    if (!$info) {
        $result['skipped'] = 'not_an_image';
        return $result;
    }

    [$w, $h] = $info;
    $type    = $info[2]; // IMAGETYPE_*
    $mime    = $info['mime'] ?? '';

    $src = null;
    switch ($type) {
        case IMAGETYPE_JPEG:
            if (!function_exists('imagecreatefromjpeg')) { $result['skipped'] = 'jpeg_unsupported'; return $result; }
            $src = @imagecreatefromjpeg($srcPath);
            break;
        case IMAGETYPE_PNG:
            if (!function_exists('imagecreatefrompng')) { $result['skipped'] = 'png_unsupported'; return $result; }
            $src = @imagecreatefrompng($srcPath);
            break;
        case IMAGETYPE_WEBP:
            if (!function_exists('imagecreatefromwebp')) { $result['skipped'] = 'webp_unsupported'; return $result; }
            $src = @imagecreatefromwebp($srcPath);
            break;
        default:
            $result['skipped'] = 'unsupported_type';
            return $result;
    }

    if (!$src) {
        $result['skipped'] = 'decode_failed';
        return $result;
    }

    // Honour EXIF orientation for JPEG so the saved pixels match what the user sees.
    if ($type === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
        $exif = @exif_read_data($srcPath);
        if ($exif && !empty($exif['Orientation'])) {
            switch ((int)$exif['Orientation']) {
                case 3: $src = imagerotate($src, 180, 0); break;
                case 6: $src = imagerotate($src, -90, 0); $tmp = $w; $w = $h; $h = $tmp; break;
                case 8: $src = imagerotate($src,  90, 0); $tmp = $w; $w = $h; $h = $tmp; break;
            }
        }
    }

    // Figure out target dimensions keeping aspect ratio.
    $maxW = max(1, (int)$o['max_width']);
    $maxH = max(1, (int)$o['max_height']);
    $scale = min($maxW / $w, $maxH / $h, 1.0);
    $newW = max(1, (int)round($w * $scale));
    $newH = max(1, (int)round($h * $scale));

    $dst = imagecreatetruecolor($newW, $newH);

    if ($type === IMAGETYPE_PNG || $type === IMAGETYPE_WEBP) {
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        $transparent = imagecolorallocatealpha($dst, 0, 0, 0, 127);
        imagefilledrectangle($dst, 0, 0, $newW, $newH, $transparent);
    }

    imagecopyresampled($dst, $src, 0, 0, 0, 0, $newW, $newH, $w, $h);
    imagedestroy($src);

    // Write to a temp file then swap, so a failed encode can't truncate the original.
    $tmp = $srcPath . '.tmp_opt';
    $ok = false;
    switch ($type) {
        case IMAGETYPE_JPEG:
            $ok = @imagejpeg($dst, $tmp, (int)$o['quality']);
            break;
        case IMAGETYPE_PNG:
            $ok = @imagepng($dst, $tmp, (int)$o['png_level']);
            break;
        case IMAGETYPE_WEBP:
            $ok = function_exists('imagewebp')
                ? @imagewebp($dst, $tmp, (int)$o['quality'])
                : false;
            break;
    }
    imagedestroy($dst);

    if (!$ok || !is_file($tmp)) {
        if (is_file($tmp)) @unlink($tmp);
        $result['skipped'] = 'encode_failed';
        return $result;
    }

    // Only swap if the optimized file is smaller OR dimensions actually changed.
    $newSize = filesize($tmp) ?: 0;
    $dimsChanged = ($newW !== $w) || ($newH !== $h);
    if ($newSize > 0 && ($dimsChanged || $newSize < $result['before'])) {
        @rename($tmp, $srcPath);
    } else {
        @unlink($tmp);
    }

    clearstatcache(true, $srcPath);
    $result['ok']     = true;
    $result['width']  = $newW;
    $result['height'] = $newH;
    $result['after']  = filesize($srcPath) ?: $result['before'];
    return $result;
}
