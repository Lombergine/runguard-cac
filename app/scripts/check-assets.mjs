#!/usr/bin/env node
/**
 * Guards the app icons and splash against silently gaining weight, and against
 * the two things App Store validation rejects outright.
 *
 * The store rules are not stylistic. Apple requires the marketing icon to be
 * exactly 1024x1024, and rejects an icon that carries an alpha channel — both
 * fail at upload time, long after the build has been paid for, so they are
 * cheaper to catch here.
 *
 * The size ceiling is the softer rule: every one of these files is shipped in
 * the binary, on every install, forever. A design tool that exports a 24-bit
 * gradient where a palette would do can quietly add hundreds of kilobytes.
 *
 * Deliberately dependency-free: it parses the PNG header itself. That is only
 * ~20 lines because IHDR is at a fixed offset, and it keeps the check runnable
 * from a git hook with no install step.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, "../assets");

/** Decimal KB, matching how the platforms and app stores quote download size. */
const MAX_BYTES = 150_000;
const ICON = "icon.png";
const ICON_SIDE = 1024;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** colourType -> whether the format can carry per-pixel alpha. */
const ALPHA_TYPES = new Set([4, 6]);
const TYPE_NAME = {
  0: "grey", 2: "rgb", 3: "palette", 4: "grey+a", 6: "rgba",
};

function readPng(path) {
  const buf = readFileSync(path);
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) return { bytes: buf.length, png: false };

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf[25];

  // A palette image is only translucent if it actually ships a tRNS chunk, so
  // walk the chunk list rather than guessing from the colour type alone.
  let hasTrns = false;
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    if (type === "tRNS") hasTrns = true;
    if (type === "IEND") break;
    off += 12 + len;
  }

  return {
    bytes: buf.length, png: true, width, height, colorType,
    hasAlpha: ALPHA_TYPES.has(colorType) || hasTrns,
  };
}

const files = readdirSync(ASSETS).filter((f) => f.toLowerCase().endsWith(".png")).sort();

if (files.length === 0) {
  console.error(`check:assets — no PNGs found in ${ASSETS}.`);
  process.exit(1);
}

const rows = files.map((name) => ({ name, ...readPng(join(ASSETS, name)) }));
const problems = [];

for (const r of rows) {
  if (!r.png) {
    problems.push(`${r.name} is not a PNG.`);
    continue;
  }
  if (r.bytes > MAX_BYTES) {
    problems.push(
      `${r.name} is ${kb(r.bytes)}, over the ${kb(MAX_BYTES)} ceiling ` +
      `— re-export it, or reduce it to a palette if the artwork allows.`
    );
  }
  if (r.name === ICON) {
    if (r.width !== ICON_SIDE || r.height !== ICON_SIDE) {
      problems.push(
        `${ICON} is ${r.width}x${r.height}; Apple requires exactly ${ICON_SIDE}x${ICON_SIDE}.`
      );
    }
    if (r.hasAlpha) {
      problems.push(
        `${ICON} carries an alpha channel; App Store validation rejects that. ` +
        `Flatten it onto an opaque background.`
      );
    }
  }
}

if (!rows.some((r) => r.name === ICON)) problems.push(`${ICON} is missing from ${ASSETS}.`);

function kb(bytes) {
  return `${(bytes / 1000).toFixed(1)} KB`;
}

const w = Math.max(...rows.map((r) => r.name.length), 5);
const total = rows.reduce((s, r) => s + r.bytes, 0);

console.log(`check:assets — ${ASSETS}\n`);
console.log(`  ${"asset".padEnd(w)}  ${"size".padStart(9)}  ${"pixels".padStart(11)}  format   alpha`);
console.log(`  ${"-".repeat(w)}  ${"-".repeat(9)}  ${"-".repeat(11)}  -------  -----`);
for (const r of rows) {
  const over = r.bytes > MAX_BYTES ? "  <-- over ceiling" : "";
  console.log(
    `  ${r.name.padEnd(w)}  ${kb(r.bytes).padStart(9)}  ` +
    `${(r.png ? `${r.width}x${r.height}` : "-").padStart(11)}  ` +
    `${(r.png ? TYPE_NAME[r.colorType] ?? `?${r.colorType}` : "-").padEnd(7)}  ` +
    `${(r.png ? (r.hasAlpha ? "yes" : "no") : "-").padEnd(5)}${over}`
  );
}
console.log(`  ${"-".repeat(w)}  ${"-".repeat(9)}`);
console.log(`  ${"total".padEnd(w)}  ${kb(total).padStart(9)}\n`);

if (problems.length === 0) {
  console.log(`check:assets — ${rows.length} assets, all within budget.`);
  process.exit(0);
}

console.error("check:assets — failed.\n");
for (const p of problems) console.error(`  ! ${p}`);
console.error("");
process.exit(1);
