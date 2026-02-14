/**
 * Generates optimized images at build time:
 * - Hero: 360×360 WebP from me.jpeg (EXIF orientation applied so rotation stays correct).
 * - Carousel: 240×240 WebP thumbnails.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, "..", "src", "assets");
const CAROUSEL_DIR = path.join(ASSETS_DIR, "carousel");
const THUMBS_DIR = path.join(ASSETS_DIR, "carousel-thumbs");
const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const THUMB_SIZE = 240; // 2× display size (120px) for retina
const HERO_SIZE = 360; // 2× display size (180px) for retina
const WEBP_QUALITY = 80;
const HERO_WEBP_QUALITY = 85;

// Hero: apply EXIF orientation (so rotation is correct), then resize and output WebP.
const heroSources = ["me.jpeg", "me.jpg"];
const heroSource = heroSources.find((f) => fs.existsSync(path.join(ASSETS_DIR, f)));
if (heroSource) {
  const heroIn = path.join(ASSETS_DIR, heroSource);
  const heroOut = path.join(ASSETS_DIR, "me-hero.webp");
  await sharp(heroIn)
    .rotate() // apply EXIF orientation so output is correct after we strip EXIF
    .resize(HERO_SIZE, HERO_SIZE, { fit: "cover" })
    .webp({ quality: HERO_WEBP_QUALITY })
    .toFile(heroOut);
  console.log(`Hero: ${heroSource} → me-hero.webp`);
} else {
  console.warn("scripts/build-carousel-thumbs.js: no me.jpeg/me.jpg found, skipping hero");
}

if (!fs.existsSync(CAROUSEL_DIR)) {
  console.warn("scripts/build-carousel-thumbs.js: carousel dir not found, skipping");
  process.exit(0);
}

fs.mkdirSync(THUMBS_DIR, { recursive: true });

const files = fs.readdirSync(CAROUSEL_DIR).filter((f) => {
  const ext = path.extname(f).toLowerCase();
  return EXTENSIONS.includes(ext) && !f.startsWith(".");
});

if (files.length === 0) {
  console.warn("scripts/build-carousel-thumbs.js: no images in carousel, skipping");
  process.exit(0);
}

await Promise.all(
  files.map(async (file) => {
    const base = path.basename(file, path.extname(file));
    const outPath = path.join(THUMBS_DIR, `${base}.webp`);
    const inPath = path.join(CAROUSEL_DIR, file);
    await sharp(inPath)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
      .webp({ quality: WEBP_QUALITY })
      .toFile(outPath);
    console.log(`  ${file} → ${base}.webp`);
  })
);

console.log(`Built ${files.length} carousel thumbnails in ${THUMBS_DIR}`);
