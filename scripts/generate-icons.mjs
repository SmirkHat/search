/**
 * Rasterize public/logo.svg → public/icons/*.png for PWA / favicon / OpenSearch.
 * Usage: node scripts/generate-icons.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = path.join(root, "public/logo.svg");
const outDir = path.join(root, "public/icons");
const BG = "#08090a";

/** Standard any-purpose sizes */
const SIZES = [16, 32, 48, 180, 192, 512];

/** Maskable: logo inset ~70% on theme background (safe zone) */
const MASKABLE = [192, 512];

async function renderAny(svg, size) {
  return sharp(svg)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function renderMaskable(svg, size) {
  const inset = Math.round(size * 0.7);
  const logo = await sharp(svg)
    .resize(inset, inset, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toBuffer();
}

const svg = await readFile(svgPath);
await mkdir(outDir, { recursive: true });

for (const size of SIZES) {
  const file = path.join(outDir, `icon-${size}.png`);
  await writeFile(file, await renderAny(svg, size));
  console.log("wrote", path.relative(root, file));
}

for (const size of MASKABLE) {
  const file = path.join(outDir, `icon-${size}-maskable.png`);
  await writeFile(file, await renderMaskable(svg, size));
  console.log("wrote", path.relative(root, file));
}
