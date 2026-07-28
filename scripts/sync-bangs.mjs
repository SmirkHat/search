#!/usr/bin/env node
/**
 * Fetch DuckDuckGo + Kagi bang catalogs and write:
 *   public/bangs-hot.json  — top bangs by DDG `r` (fast path)
 *   public/bangs.json      — full merged catalog (fallback)
 *
 * Merge priority (highest wins): LOCAL_BANGS > Kagi > DuckDuckGo
 * Usage: pnpm bangs:sync
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const hotPath = join(root, "public", "bangs-hot.json");
const fullPath = join(root, "public", "bangs.json");

/** How many bangs in the fast-path catalog (by DDG popularity `r`). */
const HOT_LIMIT = 500;

const KAGI_BANGS_URL =
  "https://raw.githubusercontent.com/kagisearch/bangs/main/data/bangs.json";

const LOCAL_BANGS = [
  {
    t: "t3",
    u: "https://www.t3.chat/new?q={{{s}}}",
    d: "www.t3.chat",
  },
  {
    t: "gweb",
    u: "https://www.google.com/search?udm=14&q={{{s}}}",
    d: "www.google.com",
  },
  {
    t: "npmx",
    u: "https://npmx.dev/search?q={{{s}}}",
    d: "npmx.dev",
  },
  {
    t: "searx",
    u: "https://search.rhscz.eu/search?q={{{s}}}",
    d: "search.rhscz.eu",
  },
  {
    t: "searxng",
    u: "https://search.rhscz.eu/search?q={{{s}}}",
    d: "search.rhscz.eu",
  },
  {
    t: "kagi",
    u: "https://kagi.com/search?q={{{s}}}",
    d: "kagi.com",
  },
  {
    t: "yep",
    u: "https://yep.com/web?q={{{s}}}",
    d: "yep.com",
  },
  {
    t: "presearch",
    u: "https://presearch.com/search?q={{{s}}}",
    d: "presearch.com",
  },
  {
    t: "yandex",
    u: "https://yandex.com/search/?text={{{s}}}",
    d: "yandex.com",
  },
  {
    t: "yandexen",
    u: "https://yandex.com/search/?text={{{s}}}",
    d: "yandex.com",
  },
];

/** Always keep these in the hot set (picker / common defaults). */
const ALWAYS_HOT = new Set([
  "g",
  "gweb",
  "ddg",
  "seznam",
  "szn",
  "sp",
  "brave",
  "ecosia",
  "qwant",
  "y",
  "b",
  "bing",
  "t3",
  "npmx",
  "searx",
  "searxng",
  "kagi",
  "mojeek",
  "yandex",
  "yandexen",
  "swisscows",
  "yep",
]);

function normalize(entry) {
  if (!entry || typeof entry !== "object") return null;
  const t = String(entry.t ?? "").trim().toLowerCase();
  const u = String(entry.u ?? "").trim();
  if (!t || !u) return null;
  return {
    t,
    u,
    d: String(entry.d ?? "").trim(),
    r: typeof entry.r === "number" ? entry.r : 0,
  };
}

function stripRank(entry) {
  // Compact on disk: trigger + URL only (domain derived at runtime).
  return { t: entry.t, u: entry.u };
}

function parseBangSource(source) {
  try {
    const data = JSON.parse(source);
    if (Array.isArray(data)) return data;
  } catch {
    // fall through to legacy JS evaluation
  }

  const sandbox = { module: { exports: {} }, exports: {}, bangs: undefined };
  vm.createContext(sandbox);
  vm.runInContext(
    `${source}\n;this.__result = (typeof bangs !== 'undefined' ? bangs : (module.exports.bangs || module.exports || exports));`,
    sandbox,
    { timeout: 10_000 },
  );
  const data = sandbox.__result;
  if (!Array.isArray(data)) {
    throw new Error("Upstream bang.js did not yield an array");
  }
  return data;
}

async function fetchUpstream() {
  const res = await fetch("https://duckduckgo.com/bang.js", {
    headers: {
      "User-Agent": "SmirkHatSearchBangSync/1.0",
      Accept: "application/json, application/javascript, text/plain, */*",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch bang.js: ${res.status}`);
  }
  return parseBangSource(await res.text());
}

/**
 * Kagi community bangs. Expand `ts` (additional triggers) into separate entries.
 */
async function fetchKagiBangs() {
  const res = await fetch(KAGI_BANGS_URL, {
    headers: {
      "User-Agent": "SmirkHatSearchBangSync/1.0",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Kagi bangs: ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Kagi bangs.json did not yield an array");
  }

  const out = [];
  for (const entry of data) {
    const base = normalize(entry);
    if (!base) continue;
    // Kagi has no DDG-style rank — keep modest so DDG popularity still drives hot set
    base.r = 0;
    out.push(base);

    const extras = entry.ts;
    if (!Array.isArray(extras)) continue;
    for (const extra of extras) {
      const t = String(extra ?? "").trim().toLowerCase();
      if (!t || t === base.t) continue;
      out.push({ t, u: base.u, d: base.d, r: 0 });
    }
  }
  return out;
}

function buildHot(byT) {
  const ranked = [...byT.values()].sort(
    (a, b) => b.r - a.r || a.t.localeCompare(b.t),
  );
  const hot = new Map();

  for (const t of ALWAYS_HOT) {
    const bang = byT.get(t);
    if (bang) hot.set(t, bang);
  }
  for (const bang of ranked) {
    if (hot.size >= HOT_LIMIT) break;
    hot.set(bang.t, bang);
  }

  return [...hot.values()].sort((a, b) => b.r - a.r || a.t.localeCompare(b.t));
}

async function main() {
  console.log("Fetching DuckDuckGo bangs…");
  const upstream = await fetchUpstream();
  const byT = new Map();

  for (const entry of upstream) {
    const n = normalize(entry);
    if (n) byT.set(n.t, n);
  }
  console.log(`  DDG: ${byT.size} triggers`);

  console.log("Fetching Kagi bangs…");
  let kagiCount = 0;
  let kagiNew = 0;
  try {
    const kagi = await fetchKagiBangs();
    for (const entry of kagi) {
      kagiCount += 1;
      const prev = byT.get(entry.t);
      if (!prev) kagiNew += 1;
      // Prefer Kagi URL/domain; preserve DDG popularity rank when present
      byT.set(entry.t, {
        ...entry,
        r: prev?.r ?? entry.r,
      });
    }
    console.log(`  Kagi: ${kagiCount} entries (${kagiNew} new triggers)`);
  } catch (error) {
    console.warn("  Kagi merge skipped:", error.message ?? error);
  }

  for (const local of LOCAL_BANGS) {
    const prev = byT.get(local.t);
    const boost = ALWAYS_HOT.has(local.t);
    byT.set(local.t, {
      ...local,
      r: boost ? (prev?.r ?? Number.MAX_SAFE_INTEGER) : (prev?.r ?? 0),
    });
  }

  const hot = buildHot(byT).map(stripRank);
  const full = [...byT.values()]
    .sort((a, b) => b.r - a.r || a.t.localeCompare(b.t))
    .map(stripRank);

  writeFileSync(hotPath, `${JSON.stringify(hot)}\n`);
  writeFileSync(fullPath, `${JSON.stringify(full)}\n`);
  console.log(
    `Wrote ${hot.length} hot bangs → ${hotPath} (${(Buffer.byteLength(JSON.stringify(hot)) / 1024).toFixed(1)} KB)`,
  );
  console.log(
    `Wrote ${full.length} bangs → ${fullPath} (${(Buffer.byteLength(JSON.stringify(full)) / 1024).toFixed(1)} KB)`,
  );

  const gen = spawnSync(
    process.execPath,
    [join(__dirname, "generate-hot-module.mjs")],
    { stdio: "inherit" },
  );
  if (gen.status !== 0) {
    throw new Error("generate-hot-module failed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
