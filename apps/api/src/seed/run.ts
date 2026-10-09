// `npm run dev:seed`: resets the local database to the development city.
import { connect } from "@coloc/db";
import { seedCity } from "./city";

const DEFAULT_URL = "postgres://coloc:coloc-dev-only@127.0.0.1:5433/coloc";

async function main() {
  const url = process.env.COLOC_DATABASE_URL ?? DEFAULT_URL;
  // This wipes every table. Refuse anything that isn't on this machine.
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error(`refusing to seed a non-local database (${host})`);

  const { db, close } = await connect(url);
  const houseDomain = process.env.COLOC_DEV_HOUSE_DOMAIN ?? "coloc.localhost";
  await seedCity(db, {
    agentSecret: process.env.COLOC_DEV_AGENT_SECRET ?? "dev-secret-change-me",
    // Locally the one real house serves its rooms at <room>.coloc.localhost; demo houses never serve anything.
    domain: (id) => (id === "sacre-coeur" ? houseDomain : `${id}.coloc.dev`),
  });
  await close();
  console.log("seeded the development city");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
