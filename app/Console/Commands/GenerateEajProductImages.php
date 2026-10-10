<?php

namespace App\Console\Commands;

use App\Models\Product;
use Database\Seeders\BoundaryCafeProductSeeder;
use Database\Seeders\EajCafeProductSeeder;
use Illuminate\Console\Command;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * AI-generates the EAJ Cafe menu photos with OpenAI's image model. The EAJ logo is sent as the reference
 * image so it is printed on each product's cup, wrapper or box. The API key comes from the environment
 * (OPENAI_API_KEY) and is never written anywhere. Photos saved to the default folder are put on the
 * EAJ products straight away (only product_img changes; prices and stock are left alone).
 */
class GenerateEajProductImages extends Command
{
    protected $signature = 'eaj:product-images
        {--only=* : Only these products (name or slug), e.g. --only=Americano --only=taro}
        {--force : Regenerate photos that already exist}
        {--dry-run : Print the prompts without calling the API}
        {--quality=medium : low, medium or high (higher costs more)}
        {--path= : Output folder (default public/images/products/eaj)}';

    protected $description = 'AI-generate the EAJ Cafe product photos (EAJ logo on the packaging) for EajCafeProductSeeder';

    private const ENDPOINT = 'https://api.openai.com/v1/images/edits';

    private const BRAND = 'EAJ Café brand colours are deep navy (#030B2E) and crimson pink-red (#F81155) with white.';

    /** What each item is, where the name alone does not say it (meal contents match the Boundary Cafe menu boards). */
    private const SUBJECTS = [
        'Strawberry Cloud' => 'an iced strawberry milk drink topped with a thick cloud of sweet cream foam and strawberry drizzle',
        'Muscovado Caramel Espresso Frappe' => 'a blended iced espresso frappe with muscovado caramel drizzle and whipped cream',
        'Muscovado Cream Latte' => 'an iced latte with a layer of muscovado sugar cream on top',
        'Dark Chocolate Cloud' => 'an iced dark chocolate drink topped with a cloud of cream foam and cocoa dust',
        'White Chocolate' => 'an iced white chocolate latte',
        'Matcha Espresso Fusion' => 'a layered iced drink of green matcha milk with an espresso shot floating on top',
        'Strawberry Sparkle' => 'a sparkling iced strawberry soda with fresh strawberry slices',
        'Blueberry Sparkle' => 'a sparkling iced blueberry soda with fresh blueberries',
        'Fresh Calamansi' => 'an iced fresh calamansi (Philippine lime) juice with calamansi halves',
        'Dark Chocolate' => 'an iced dark chocolate milk drink',
        'Strawberry Latte' => 'an iced strawberry milk latte with visible strawberry purée layer',
        'Matcha Latte' => 'an iced green matcha latte',
        'Taro' => 'a purple taro (ube-like) blended frappe with whipped cream',
        'Strawberry' => 'a pink blended strawberry frappe with whipped cream',
        'Avocado' => 'a green blended avocado frappe with whipped cream',
        'Mango' => 'a yellow blended mango frappe with whipped cream',
        'Japanese Matcha' => 'a green blended Japanese matcha frappe with whipped cream',
        "Cookies n' Cream" => "a blended cookies 'n cream frappe with crushed chocolate cookies and whipped cream",
        'Fiesta Meal A' => '1 pc fried chicken, bacon and chicken tocino with 1 cup of rice, plus a glass of iced drink',
        'Fiesta Meal B' => 'a grilled Hungarian sausage, bacon and pork tocino with 1 cup of rice, plus a glass of iced drink',
        'Tocino Meal' => 'sweet glazed Filipino pork tocino with 1 cup of rice and cucumber slices, plus a glass of iced drink',
        'Chicken Meal' => '1 pc crispy fried chicken with 1 cup of rice, plus a glass of iced drink',
        'Hungarian Sausage Meal' => 'a grilled Hungarian sausage with 1 cup of rice, plus a glass of iced drink',
        'Bacon Meal' => 'crispy bacon strips with 1 cup of rice, plus a glass of iced drink',
        'Boundary Burger' => 'a classic beef burger with lettuce, tomato and cheese on a brioche bun',
        'Chicken Burger' => 'a crispy fried chicken burger with lettuce and mayo',
        'Ultimate Burger' => 'a tall double beef burger with cheese, bacon and lettuce',
        'Nachos' => 'tortilla nachos with cheese sauce, ground beef and salsa',
        'Lumpia Shanghai' => 'golden fried Filipino lumpia shanghai spring rolls with sweet chili dip',
        'Cheesy Fries' => 'french fries covered in melted cheese sauce',
        'Batchoy' => 'a hot bowl of La Paz batchoy noodle soup with pork, chicharon and egg',
        'Cheesecake' => 'a slice of creamy New York cheesecake',
        'Mango Graham Cake' => 'a slice of layered Filipino mango graham float cake',
        'Tiramisu Classic' => 'a square of classic tiramisu dusted with cocoa',
        'Nachos & Fries Combo' => 'a plate of cheesy nachos and french fries with a glass of iced drink',
        'Burger & Fries Combo' => 'a beef burger with french fries and a cheese dip, plus a glass of iced drink',
        'Pancit Bihon' => 'a large platter of Filipino pancit bihon rice noodles with vegetables, chicken and calamansi',
        'Lumpia Shanghai Bundle' => 'a big platter of fried lumpia shanghai spring rolls with dipping sauce',
        'Fried Chicken Bundle' => 'a sharing platter of crispy fried chicken pieces',
        'Boundary Favorites Snack Bundle' => 'a sharing platter of nachos, fries and lumpia shanghai',
        'Barkada Fries' => 'a large sharing basket of seasoned french fries with dips',
        'Barkada Nachos' => 'a large sharing platter of loaded nachos',
        'Barkada Burgers' => '5 beef burgers on a wooden board with 1 pitcher of iced juice',
        'Rice' => 'a cup of steamed white rice',
        'Pitcher Juice' => 'a glass pitcher of iced fruit juice',
        'Bacon Bits' => 'a small cup of crispy bacon bits',
        'Egg' => 'a sunny-side-up fried egg',
        'Hotdog' => 'a grilled Filipino red hotdog',
        'Extra Espresso Shot' => 'a single espresso shot in a small glass',
        'Whipped Cream' => 'a small cup of fluffy whipped cream',
        'Flavor Syrup' => 'a small bottle of caramel flavor syrup with a pump',
    ];

    public function handle(): int
    {
        $dir = $this->option('path') ?: public_path(EajCafeProductSeeder::IMAGE_DIR);
        $logo = public_path(ltrim(EajCafeProductSeeder::LOGO, '/'));
        $key = (string) config('services.openai.key');
        $dryRun = (bool) $this->option('dry-run');

        if (! in_array($this->option('quality'), ['low', 'medium', 'high'], true)) {
            $this->error('--quality must be low, medium or high.');

            return self::FAILURE;
        }
        if (! $dryRun && $key === '') {
            $this->error('Set OPENAI_API_KEY in your terminal first (it is never saved), e.g. PowerShell: $env:OPENAI_API_KEY="sk-..."');

            return self::FAILURE;
        }
        if (! is_file($logo)) {
            $this->error("The EAJ logo is missing: {$logo}");

            return self::FAILURE;
        }

        $items = $this->selectedItems();
        if ($items === []) {
            $this->error('No product matches --only.');

            return self::FAILURE;
        }
        if (! $dryRun && ! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $made = $skipped = $failed = $linked = 0;
        $usesPublicFolder = ! $this->option('path');
        foreach ($items as $menuIndex => [$category, $name]) {
            $file = $dir.DIRECTORY_SEPARATOR.EajCafeProductSeeder::imageFile($name);
            $prompt = $this->prompt($category, $name);

            if ($dryRun) {
                $this->line("<info>{$name}</info>: {$prompt}");

                continue;
            }
            if (is_file($file) && ! $this->option('force')) {
                $skipped++;
            } else {
                try {
                    $this->saveWebp($this->generate($key, $logo, $prompt), $file);
                    $made++;
                    $this->info("✓ {$name}");
                } catch (RuntimeException|ConnectionException $e) {
                    $failed++;
                    $this->error("✗ {$name}: {$e->getMessage()}");

                    continue;
                }
            }

            if ($usesPublicFolder) {
                $linked += Product::where('barcode', EajCafeProductSeeder::barcode($menuIndex))
                    ->update(['product_img' => EajCafeProductSeeder::imagePath($name)]);
            }
        }

        if (! $dryRun) {
            $this->newLine();
            $this->line("Generated {$made}, skipped {$skipped} (already there), failed {$failed}.");
            $this->line($usesPublicFolder
                ? "{$linked} EAJ product(s) now show their photo."
                : 'Photos were saved outside public/, so the products were not changed.');
        }

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    /** @return array<int, array{0: string, 1: string, 2: int}> keyed by position in the menu */
    private function selectedItems(): array
    {
        $only = array_map(fn (string $value) => Str::slug($value), (array) $this->option('only'));

        return array_filter(
            BoundaryCafeProductSeeder::MENU,
            fn (array $item) => $only === [] || in_array(Str::slug($item[1]), $only, true),
        );
    }

    /** One square menu photo: the item, its packaging, and the EAJ logo printed on that packaging. */
    public function prompt(string $category, string $name): string
    {
        $subject = self::SUBJECTS[$name] ?? "{$name} ({$category})";
        $packaging = match (true) {
            $name === 'Americano' => 'served hot in a white paper coffee cup with a navy sleeve; the EAJ logo is printed on the sleeve',
            $name === 'Extra Espresso Shot' => 'next to a small navy paper cup; the EAJ logo is printed on the cup',
            $name === 'Batchoy' => 'in a navy ceramic bowl; the EAJ logo is printed on the side of the bowl',
            in_array($category, ['Signature Blends', 'Coffee', 'Non-Coffee', 'Frappes'], true) => 'served in a tall clear plastic cup with a dome lid; the EAJ logo is printed large and centred on the cup',
            $category === 'Sulit Meals' => 'plated on a dark round plate over a banana leaf with the drink beside it; the EAJ logo is printed on the drink glass and on a small navy paper tag on the plate',
            $category === 'Burgers' => 'half-wrapped in navy burger paper; the EAJ logo is printed on the wrapper',
            $category === 'Combos' => 'on a navy serving tray lined with paper; the EAJ logo is printed on the tray paper and the drink cup',
            $category === 'Shareable Plates' => 'on a large wooden sharing board; the EAJ logo is printed on a navy paper flag pick and on the board liner',
            $category === 'Desserts' => 'on a white dessert plate with a navy paper napkin; the EAJ logo is printed on the napkin',
            $category === 'Snacks and Sides' => 'in a navy paper snack box; the EAJ logo is printed on the box',
            default => 'in a small navy paper cup or container; the EAJ logo is printed on it',
        };

        return 'Square 1:1 professional café menu photo for EAJ Café. '.self::BRAND." The product is {$subject}, {$packaging}. "
            ."Use the attached image as the exact EAJ logo: a crimson-and-white 'EA' mark on a navy rounded square - keep its shapes and colours exactly, do not redraw or alter it. "
            ."Add the product name \"{$name}\" as a bold clean headline at the top in white or crimson lettering, spelled exactly. "
            .'Appetizing, realistic studio food photography, soft warm light, background in the EAJ navy and crimson colours. '
            .'No other text, no other logos or brand names, no people.';
    }

    /** Ask the image model for one 1024x1024 image, with the logo as the reference input. Returns raw image bytes. */
    private function generate(string $key, string $logo, string $prompt): string
    {
        $response = Http::withToken($key)
            ->timeout(240)
            ->retry(3, 5000, fn ($exception) => $exception instanceof ConnectionException
                || in_array($exception->response?->status(), [429, 500, 502, 503], true), throw: false)
            ->attach('image[]', (string) file_get_contents($logo), 'eaj-logo.png', ['Content-Type' => 'image/png'])
            ->post(self::ENDPOINT, [
                'model' => config('services.openai.image_model'),
                'prompt' => $prompt,
                'size' => '1024x1024',
                'quality' => $this->option('quality'),
                'n' => 1,
            ]);

        if ($response->failed()) {
            throw new RuntimeException('OpenAI '.$response->status().': '.($response->json('error.message') ?? $response->body()));
        }

        $bytes = base64_decode((string) $response->json('data.0.b64_json'), true);
        if (! $bytes) {
            throw new RuntimeException('OpenAI returned no image.');
        }

        return $bytes;
    }

    /** Store as WebP like the rest of the menu photos. */
    private function saveWebp(string $bytes, string $file): void
    {
        $image = @imagecreatefromstring($bytes);
        if ($image === false) {
            throw new RuntimeException('The returned image could not be read.');
        }

        imagepalettetotruecolor($image);
        $saved = imagewebp($image, $file, 82);
        imagedestroy($image);

        if (! $saved) {
            throw new RuntimeException("Could not write {$file}");
        }
    }
}
