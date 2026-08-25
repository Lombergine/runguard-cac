#!/usr/bin/env node
/**
 * Fails the build when the app's body-part vocabulary drifts from the
 * website's.
 *
 * The two `bodyParts.ts` files are duplicated rather than imported — app/ and
 * website/ are independent packages with no workspace between them — so
 * nothing but this check stops them from disagreeing. When they disagreed
 * before, the body map lit up or stayed dark depending on which form an entry
 * came through.
 *
 * Deliberately regex, not a TypeScript parse: no dependencies, no build step,
 * runnable from a git hook. It only ever reads the `key:` literals, which is
 * the whole of the shared contract.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "../src/lib/bodyParts.ts");
const WEBSITE = resolve(HERE, "../../website/src/lib/bodyParts.ts");

const KEY = /\bkey:\s*["']([^"']+)["']/g;

function keysOf(path) {
  const source = readFileSync(path, "utf8");
  return [...source.matchAll(KEY)].map((m) => m[1]);
}

let websiteKeys;
try {
  websiteKeys = keysOf(WEBSITE);
} catch (err) {
  if (err.code === "ENOENT") {
    console.log(`check:bodyparts — website copy not found yet (${WEBSITE}); skipping.`);
    process.exit(0);
  }
  throw err;
}

const appKeys = keysOf(APP);

if (appKeys.length === 0) {
  console.error(`check:bodyparts — no key: literals found in ${APP}.`);
  process.exit(1);
}

const appSet = new Set(appKeys);
const websiteSet = new Set(websiteKeys);
const onlyApp = appKeys.filter((k) => !websiteSet.has(k));
const onlyWebsite = websiteKeys.filter((k) => !appSet.has(k));

if (onlyApp.length === 0 && onlyWebsite.length === 0) {
  console.log(`check:bodyparts — ${appSet.size} parts, app and website agree.`);
  process.exit(0);
}

console.error("check:bodyparts — the two body-part lists have drifted.\n");
console.error(`  app     ${APP}`);
console.error(`  website ${WEBSITE}\n`);
for (const k of onlyApp) console.error(`  + ${k}   (app only)`);
for (const k of onlyWebsite) console.error(`  - ${k}   (website only)`);
console.error("\nMake the two files list the same keys, then run again.");
process.exit(1);
