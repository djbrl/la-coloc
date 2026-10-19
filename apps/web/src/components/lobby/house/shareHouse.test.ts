import { describe, expect, it } from "vitest";
import { whatsappLink } from "../tutorial/share";
import { houseShareLink, houseShareText, shareWays } from "./shareHouse";

describe("sharing a house", () => {
  it("links to the API's share page on the site's own origin", () => {
    expect(houseShareLink("https://la-coloc.vercel.app", "sacre-coeur")).toBe("https://la-coloc.vercel.app/api/share/house/sacre-coeur");
    expect(houseShareLink("https://la-coloc.vercel.app/", "a b")).toBe("https://la-coloc.vercel.app/api/share/house/a%20b");
    expect(houseShareLink("https://la-coloc.vercel.app", "sacre-coeur", "fr")).toBe("https://la-coloc.vercel.app/api/share/house/sacre-coeur?lang=fr");
  });

  it("says the house, its city and the link, ready for WhatsApp", () => {
    const link = houseShareLink("https://la-coloc.vercel.app", "sacre-coeur");
    const text = houseShareText("Sacré-Cœur", "Dakar", link);
    expect(text).toBe("Sacré-Cœur, Dakar: https://la-coloc.vercel.app/api/share/house/sacre-coeur");
    expect(whatsappLink(text)).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
  });

  it("offers only the copy for a link that opens on this computer alone", () => {
    expect(shareWays("http://localhost:5173/api/share/house/x", true)).toEqual({ whatsapp: false, native: false, anywhere: false });
    expect(shareWays("https://la-coloc.vercel.app/api/share/house/x", true)).toEqual({ whatsapp: true, native: true, anywhere: true });
    expect(shareWays("https://la-coloc.vercel.app/api/share/house/x", false)).toMatchObject({ whatsapp: true, native: false });
  });
});
