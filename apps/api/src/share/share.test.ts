// The page behind a shared house link: what a chat app's crawler reads for its preview card, and where a person lands.
import "reflect-metadata";
import { type Db, houses } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCity } from "../seed/city";
import { escapeHtml, sharePage } from "./share";
import { ShareController } from "./share.controller";

const SITE = "https://la-coloc.vercel.app";
let db: Db;
let share: ShareController;

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => `${id}.coloc.dev` });
  share = new ShareController(db, { publicUrl: SITE });
});

// A meta tag's content, read back from the page.
const meta = (html: string, key: string) => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(html)?.[1];

describe("a shared house", () => {
  it("previews its name and city, one line of what's in it, and the city's picture", async () => {
    const html = await share.house("sacre-coeur");
    expect(meta(html, "og:title")).toBe("Sacré-Cœur, Dakar");
    expect(meta(html, "og:description")).toBe("4 rooms · 1 free · Ndaje, Kër Bot, Prix Marché");
    expect(meta(html, "og:image")).toBe(`${SITE}/og/Dakar.jpg`);
    expect(meta(html, "og:url")).toBe(`${SITE}/api/share/house/sacre-coeur`);
    expect(meta(html, "twitter:card")).toBe("summary_large_image");
  });

  it("sends a person straight on to the house in its city", async () => {
    const html = await share.house("sacre-coeur");
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=/?city=Dakar&amp;in=house:sacre-coeur">');
    expect(html).toContain('<a href="/?city=Dakar&amp;in=house:sacre-coeur">');
  });

  it("says it in French when the link asks", async () => {
    const html = await share.house("sacre-coeur", "fr");
    expect(html).toContain('<html lang="fr">');
    expect(meta(html, "og:description")).toBe("4 chambres · 1 libre · Ndaje, Kër Bot, Prix Marché");
  });

  it("escapes what people wrote, and encodes a city's accents in addresses", async () => {
    await db.update(houses).set({ name: `<script>alert("x")</script>`, city: "Lomé" }).where(eq(houses.id, "sacre-coeur"));
    const html = await share.house("sacre-coeur");
    expect(html).not.toContain("<script>");
    expect(meta(html, "og:title")).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;, Lomé");
    expect(meta(html, "og:image")).toBe(`${SITE}/og/Lom%C3%A9.jpg`);
    expect(html).toContain("url=/?city=Lom%C3%A9&amp;in=house:sacre-coeur");
  });
});

describe("a link to no house", () => {
  it("previews La Coloc itself, with the generic picture, and lands on the city", async () => {
    for (const id of ["nope", "atelier", "x".repeat(100)]) {
      const html = await share.house(id);
      expect(meta(html, "og:title")).toBe("La Coloc");
      expect(meta(html, "og:image")).toBe(`${SITE}/og/city.jpg`);
      expect(html).toContain('content="0; url=/"');
    }
  });

  it("uses the generic picture for a city that isn't on the map", () => {
    const html = sharePage({ id: "h", name: "H", city: "Atlantis", rooms: [] }, SITE);
    expect(meta(html, "og:image")).toBe(`${SITE}/og/city.jpg`);
    expect(meta(html, "og:description")).toBe("0 rooms · full");
  });
});

describe("escapeHtml", () => {
  it("escapes the five characters that matter in text and quoted attributes", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});
