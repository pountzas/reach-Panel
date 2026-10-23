#!/usr/bin/env node
/**
 * Rasterize design/reachpanel-logo.svg into:
 *   - design/app-icon.png (1024×1024 RGBA, transparent) — Tauri master
 *   - companion/assets/icon.png (logo on #121820)
 *   - companion/assets/android-icon-foreground.png (66% safe zone)
 *   - companion/assets/android-icon-background.png (#121820 fill)
 *   - companion/assets/android-icon-monochrome.png (white silhouette)
 *
 * Usage (repo root):
 *   node scripts/generate-brand-icons.mjs
 *   npm run tauri -- icon design/app-icon.png
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const SIZE = 1024;
const SAFE_ZONE = 0.66;
const COMPANION_BG = "#121820";

const svgPath = path.join(root, "design", "reachpanel-logo.svg");
const designDir = path.join(root, "design");
const companionAssets = path.join(root, "companion", "assets");

/** @returns {Promise<Buffer>} */
async function renderLogo(size) {
  // SVG declares 1024×1024; density keeps native crispness before resize.
  return sharp(svgPath, { density: 144 })
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .png()
    .toBuffer();
}

async function writeAppIcon(logoBuf) {
  const out = path.join(designDir, "app-icon.png");
  await sharp(logoBuf).png().toFile(out);
  console.log(`wrote ${path.relative(root, out)}`);
}

async function writeCompanionIcon(logoBuf) {
  const out = path.join(companionAssets, "icon.png");
  const bg = await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: COMPANION_BG,
    },
  })
    .png()
    .toBuffer();

  await sharp(bg)
    .composite([{ input: logoBuf, gravity: "centre" }])
    .png()
    .toFile(out);
  console.log(`wrote ${path.relative(root, out)}`);
}

async function writeForeground(logoBuf) {
  const out = path.join(companionAssets, "android-icon-foreground.png");
  const logoSize = Math.round(SIZE * SAFE_ZONE);
  const scaled = await sharp(logoBuf)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, gravity: "centre" }])
    .png()
    .toFile(out);
  console.log(`wrote ${path.relative(root, out)}`);
}

async function writeBackground() {
  const out = path.join(companionAssets, "android-icon-background.png");
  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: COMPANION_BG,
    },
  })
    .png()
    .toFile(out);
  console.log(`wrote ${path.relative(root, out)}`);
}

/**
 * White-on-transparent silhouette from the logo alpha channel.
 * @param {Buffer} logoBuf
 */
async function writeMonochrome(logoBuf) {
  const out = path.join(companionAssets, "android-icon-monochrome.png");
  const logoSize = Math.round(SIZE * SAFE_ZONE);
  const { data, info } = await sharp(logoBuf)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const a = data[i * 4 + 3];
    const o = i * 4;
    rgba[o] = 255;
    rgba[o + 1] = 255;
    rgba[o + 2] = 255;
    rgba[o + 3] = a;
  }

  const silhouette = await sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: silhouette, gravity: "centre" }])
    .png()
    .toFile(out);
  console.log(`wrote ${path.relative(root, out)}`);
}

async function main() {
  await mkdir(designDir, { recursive: true });
  await mkdir(companionAssets, { recursive: true });

  const logoBuf = await renderLogo(SIZE);
  const meta = await sharp(logoBuf).metadata();
  if (meta.width !== SIZE || meta.height !== SIZE) {
    throw new Error(
      `Expected ${SIZE}×${SIZE} logo raster, got ${meta.width}×${meta.height}`,
    );
  }

  await writeAppIcon(logoBuf);
  await writeCompanionIcon(logoBuf);
  await writeForeground(logoBuf);
  await writeBackground();
  await writeMonochrome(logoBuf);

  console.log("\nNext: npm run tauri -- icon design/app-icon.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
