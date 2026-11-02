// The city someone belongs to, chosen once, when they first log in: the one nearest the country they're in. It's looked
// up here, in a small database of countries by IP address (DB-IP Lite, docs/licences.md), so the address never goes to
// anyone else, and it isn't stored: only the city is.
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { createRequire } from "node:module";
import { Logger } from "@nestjs/common";
import { Reader, type Response } from "mmdb-lib";

const log = new Logger("homeCity");

// Everyone outside Africa, and anyone we can't place, starts here.
export const DEFAULT_CITY = "Dakar";

const COUNTRIES: Record<string, string[]> = {
  Dakar: ["SN", "GM", "GW", "MR", "ML", "CV", "GN", "SL", "LR"],
  Abidjan: ["CI", "BF", "GH"],
  Lomé: ["TG"],
  Cotonou: ["BJ", "NG", "NE"],
  Douala: ["CM", "GA", "GQ", "CG", "CD", "CF", "TD", "ST", "AO"],
  Kigali: ["RW", "BI", "UG", "KE", "TZ", "ET", "SO", "DJ", "ER", "SS", "SD", "ZM", "MW", "MZ", "ZW", "ZA", "BW", "NA", "LS", "SZ", "MG", "MU", "SC", "KM"],
  Marrakech: ["MA", "EH"],
  Tunis: ["TN", "DZ", "LY", "EG"],
};
const CITY_OF = new Map(Object.entries(COUNTRIES).flatMap(([city, list]) => list.map((country) => [country, city] as const)));

/** The city for a country, by its two-letter code. */
export const cityOfCountry = (country: string | null | undefined): string => (country && CITY_OF.get(country.toUpperCase())) || DEFAULT_CITY;

// Read the first time someone new logs in, then kept: 8 MB nobody needs until then.
let reader: Reader<Response> | null = null;
function countries() {
  if (!reader) reader = new Reader<Response>(readFileSync(createRequire(__filename).resolve("@ip-location-db/dbip-country-mmdb/dbip-country.mmdb")));
  return reader;
}

/** The two-letter country of an IP address. Null for a private address, or one the database doesn't know. */
export function countryOf(ip: string | null): string | null {
  const address = ip?.replace(/^::ffff:/, "") ?? "";
  if (!isIP(address)) return null;
  // This database's rows are one field, not the shape the library's types describe.
  const row = countries().get(address) as unknown as { country_code?: string } | null;
  return row?.country_code ?? null;
}

/** The city for someone logging in from this address. Never in the way of logging in: any trouble is the default. */
export function homeCityFor(ip: string | null): string {
  try {
    return cityOfCountry(countryOf(ip));
  } catch (e) {
    log.warn(`couldn't place an address: ${(e as Error).message}`);
    return DEFAULT_CITY;
  }
}
