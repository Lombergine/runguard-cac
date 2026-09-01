/**
 * Mint a dev session token and write it into `app/.env`.
 *
 *   cd website
 *   npx tsx --env-file=.env.local scripts/dev-token.ts athlete 4
 *   npx tsx --env-file=.env.local scripts/dev-token.ts coach 1
 *
 * FROM INSIDE `website/`, never the repo root — `db.ts` resolves the SQLite
 * file from `process.cwd()`, so from the root it would silently create a new
 * empty database rather than failing (root `CLAUDE.md` spells this out).
 *
 * ── WHAT IT IS FOR ──────────────────────────────────────────────────────────
 *
 * `EXPO_PUBLIC_DEV_TOKEN` in `app/.env` lets a dev build skip the sign-in
 * screen: `app/src/lib/auth.ts` sends it as the Bearer when the keychain is
 * empty. It works for EITHER role — the app reads which from the token's own
 * shape — so this script is also how you move the simulator between the athlete
 * tabs and the coach tabs.
 *
 * ── WHY YOU WILL NEED IT AGAIN ──────────────────────────────────────────────
 *
 * Tokens carry the row's `token_version`, so anything that bumps a version — a
 * password reset, a revocation — invalidates every token minted before it, the
 * dev one included. The symptom is the app 401ing on every request at once.
 * Re-run this, then RESTART METRO: Expo inlines `EXPO_PUBLIC_*` at bundle time,
 * so a fast refresh will not pick up the new value.
 *
 * ── THE TOKEN IS NEVER PRINTED ──────────────────────────────────────────────
 *
 * It goes straight into `app/.env`, which is gitignored. Only the name of whom
 * it signs in as comes back to the terminal. A token is never rendered and
 * never logged — see `DEPLOY.md` → *Credentials*.
 */
import fs from "node:fs";
import path from "node:path";

import { signAthleteToken, signTeam } from "../src/lib/session";
import { getAthlete, getTeam } from "../src/lib/db";

function usage(): never {
  console.error(
    "usage: npx tsx --env-file=.env.local scripts/dev-token.ts <athlete|coach> <id>"
  );
  process.exit(2);
}

async function main() {
  const role = process.argv[2];
  const id = Number(process.argv[3]);
  if （!Number.isInteger(id)） usage();

  const envPath = path.resolve(process.cwd(), "../app/.env");

  let token: string;
  let who: string;

  if (role === "coach") {
    const team = await getTeam(id);
    if (!team) throw new Error(`No team with id ${id}.`);
    token = signTeam(id, team.token_version);
    who = `coach of ${team.name} (token_version ${team.token_version})`;
  } else if (role === "athlete") {
    const athlete = await getAthlete(id);
    if (!athlete) throw new Error(`No athlete with id ${id}.`);
    token = signAthleteToken(id, athlete.token_version);
    who = `athlete ${athlete.name} (token_version ${athlete.token_version})`;
  } else {
    usage();
  }

  // Replace the line if it exists, append if it does not. Everything else in
  // the file is left exactly as it was.
  const before = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const line = `EXPO_PUBLIC_DEV_TOKEN=${token}`;
  const after = /^EXPO_PUBLIC_DEV_TOKEN=.*$/m.test(before)
    ? before.replace(/^EXPO_PUBLIC_DEV_TOKEN=.*$/m, line)
    : (before === "" || before.endsWith("\n") ? before : `${before}\n`) + `${line}\n`;
  fs.writeFileSync(envPath, after);

  console.log(`app/.env dev token now signs in as ${who}.`);
  console.log("Restart Metro — EXPO_PUBLIC_* is inlined at bundle time.");
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(String(e));
    process.exit(1);
  }
);
