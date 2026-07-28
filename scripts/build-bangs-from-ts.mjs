#!/usr/bin/env node
/** One-shot helper: build public/bangs.json from legacy src/bang.ts if present. */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bangTs = join(root, "src", "bang.ts");
const outPath = join(root, "public", "bangs.json");

if (!existsSync(bangTs)) {
  console.error("src/bang.ts not found — use pnpm bangs:sync instead");
  process.exit(1);
}

const { bangs } = await import(pathToFileURL(bangTs).href);
const out = bangs
  .map((b) => ({ t: b.t, u: b.u, d: b.d || "" }))
  .sort((a, b) => a.t.localeCompare(b.t));
writeFileSync(outPath, `${JSON.stringify(out)}\n`);
console.log(`Wrote ${out.length} bangs → ${outPath}`);
