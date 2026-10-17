// The development city's own keys, made once per laptop and kept in dev/.env.local (git-ignored), so nothing that
// guards the laptop is a string printed in this public repo:
//
//   COLOC_DB_PASSWORD        the database password. Postgres starts with the compose file's "coloc-dev-only" (it only
//                            reads a password on its very first start), so `secureDatabase` changes it from inside the
//                            container, where the image lets `psql` in without one.
//   COLOC_DATABASE_URL       the API's (and the seed's) connection string, with that password.
//   COLOC_DEV_AGENT_SECRET   the two development caretakers' house key. The seed stores its hash, and `secureDatabase`
//                            writes it onto an existing database, so the caretakers' first call is accepted.
//
// A room's code can reach this laptop's ports on Docker Desktop (host.docker.internal), so these must not be guessable.
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DB_CONTAINER = process.env.COLOC_DB_CONTAINER ?? "coloc-db";
const DEV_HOUSES = ["sacre-coeur", "atelier"];

function readEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/** Makes whichever key is missing, appends it to dev/.env.local, and returns all three. Hex only: safe in SQL and URLs. */
export function ensureDevKeys(root) {
  const file = join(root, "dev/.env.local");
  const have = readEnv(file);
  const made = [];
  const add = (name, value) => {
    appendFileSync(file, `${existsSync(file) && !readFileSync(file, "utf8").endsWith("\n") ? "\n" : ""}${name}=${value}\n`);
    have[name] = value;
    made.push(name);
  };
  if (!have.COLOC_DB_PASSWORD) add("COLOC_DB_PASSWORD", randomBytes(24).toString("hex"));
  if (!have.COLOC_DATABASE_URL) add("COLOC_DATABASE_URL", `postgres://coloc:${have.COLOC_DB_PASSWORD}@127.0.0.1:5433/coloc`);
  if (!have.COLOC_DEV_AGENT_SECRET) add("COLOC_DEV_AGENT_SECRET", randomBytes(32).toString("hex"));
  return { dbPassword: have.COLOC_DB_PASSWORD, databaseUrl: have.COLOC_DATABASE_URL, agentSecret: have.COLOC_DEV_AGENT_SECRET, made };
}

function psql(sql) {
  return spawnSync("docker", ["exec", DB_CONTAINER, "psql", "-U", "coloc", "-d", "coloc", "-v", "ON_ERROR_STOP=1", "-qc", sql], { encoding: "utf8" });
}

/** Whether the database container is up (it may still be starting: psql answers once it accepts connections). */
export function databaseRunning() {
  return spawnSync("docker", ["exec", DB_CONTAINER, "pg_isready", "-U", "coloc"], { stdio: "ignore" }).status === 0;
}

/**
 * Sets the database password to this laptop's own, and the development houses' key hash to this laptop's key.
 * Both are idempotent. Returns what went wrong, or null.
 */
export function secureDatabase({ dbPassword, agentSecret }) {
  if (!/^[0-9a-f]+$/.test(dbPassword) || !/^[0-9a-f]+$/.test(agentSecret)) return "the keys in dev/.env.local must be hex";
  const pw = psql(`ALTER ROLE coloc PASSWORD '${dbPassword}'`);
  if (pw.status !== 0) return (pw.stderr || pw.stdout || "psql failed").trim();
  // A fresh database has no tables until the API migrates it; the seed writes the right hash then.
  const hash = createHash("sha256").update(agentSecret).digest("hex");
  const ids = DEV_HOUSES.map((id) => `'${id}'`).join(",");
  psql(`DO $$ BEGIN IF to_regclass('public.houses') IS NOT NULL THEN UPDATE houses SET agent_secret_hash = '${hash}' WHERE id IN (${ids}) AND agent_secret_hash IS NOT NULL; END IF; END $$`);
  return null;
}
