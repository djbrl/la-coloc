import { describe, expect, it } from "vitest";
import { CITIES } from "../chat/channels";
import { cityOfCountry, countryOf, DEFAULT_CITY, homeCityFor } from "./homeCity";

describe("the city someone belongs to", () => {
  it("is the one nearest their country", () => {
    expect(cityOfCountry("SN")).toBe("Dakar");
    expect(cityOfCountry("TG")).toBe("Lomé");
    expect(cityOfCountry("ng")).toBe("Cotonou");
    expect(cityOfCountry("KE")).toBe("Kigali");
    expect(cityOfCountry("DZ")).toBe("Tunis");
  });
  it("is the default outside Africa, or when we can't tell", () => {
    expect(cityOfCountry("FR")).toBe(DEFAULT_CITY);
    expect(cityOfCountry(null)).toBe(DEFAULT_CITY);
    expect(homeCityFor(null)).toBe(DEFAULT_CITY);
    expect(homeCityFor("not an address")).toBe(DEFAULT_CITY);
    expect(homeCityFor("127.0.0.1")).toBe(DEFAULT_CITY);
    expect(homeCityFor("10.0.0.4")).toBe(DEFAULT_CITY);
  });
  it("is always a city on the map", () => {
    for (const country of ["SN", "CI", "TG", "BJ", "CM", "RW", "MA", "TN", "FR"]) expect(CITIES).toContain(cityOfCountry(country));
  });
  it("reads real addresses from the database, the way a proxy passes them on", () => {
    // Sonatel, in Senegal, and Google's public DNS in the United States.
    expect(countryOf("41.82.0.1")).toBe("SN");
    expect(countryOf("::ffff:41.82.0.1")).toBe("SN");
    expect(countryOf("8.8.8.8")).toBe("US");
    expect(homeCityFor("41.82.0.1")).toBe("Dakar");
  });
});
