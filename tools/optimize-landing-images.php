<?php

$files = glob(__DIR__.'/../public/uploads/*.png');
$outputDirectory = __DIR__.'/../public/uploads/optimized';

if (! is_dir($outputDirectory)) {
    mkdir($outputDirectory, 0777, true);
}

foreach ($files as $file) {
    $name = pathinfo($file, PATHINFO_FILENAME);
    $source = imagecreatefrompng($file);

    if (! $source) {
        continue;
    }

    imagepalettetotruecolor($source);
    imagealphablending($source, true);
    imagesavealpha($source, true);

    $width = imagesx($source);
    $height = imagesy($source);
    $maxWidth = $name === 'banner' ? 1920 : ($name === 'logo' ? 512 : 960);

    if ($width > $maxWidth) {
        $newHeight = (int) round($height * $maxWidth / $width);
        $scaled = imagescale($source, $maxWidth, $newHeight, IMG_BICUBIC_FIXED);
        imagedestroy($source);
        $source = $scaled;
    }

    imagewebp($source, $outputDirectory.'/'.$name.'.webp', 82);
    imagedestroy($source);
}
