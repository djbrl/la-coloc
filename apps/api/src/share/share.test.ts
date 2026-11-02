// The page behind a shared house link: what a person sees, and what a chat app's crawler reads for its preview card.
import "reflect-metadata";
import { type Db, houses, rooms } from "@coloc/db";
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

const PITCH = "Your own room on a shared server: put your project online and split the bill with friends.";

describe("a shared house", () => {
  it("previews the same title as the page, one line of what's in it, and the city's picture", async () => {
    const html = await share.house("sacre-coeur");
    expect(meta(html, "og:title")).toBe("Join Sacré-Cœur on La Coloc");
    expect(html).toContain("<h1>Join Sacré-Cœur on La Coloc</h1>");
    expect(meta(html, "og:description")).toBe(`${PITCH} 4 rooms · 1 free · Ndaje, Kër Bot, Prix Marché`);
    expect(meta(html, "og:image")).toBe(`${SITE}/og/Dakar.jpg`);
    expect(meta(html, "og:url")).toBe(`${SITE}/api/share/house/sacre-coeur`);
    expect(meta(html, "twitter:card")).toBe("summary_large_image");
  });

  it("is a page of its own: nothing sends a person on, and it needs no JavaScript", async () => {
    const html = await share.house("sacre-coeur");
    expect(html).not.toContain('http-equiv="refresh"');
    expect(html).not.toContain("<script");
  });

  it("shows the city's picture, the city, the rooms, the free rooms and the projects", async () => {
    const html = await share.house("sacre-coeur");
    expect(html).toContain('<img src="/og/Dakar.jpg"');
    expect(html).toContain("<dt>City</dt><dd>Dakar</dd>");
    expect(html).toContain("<dt>Rooms</dt><dd>4</dd>");
    expect(html).toContain("<dt>Free</dt><dd>1</dd>");
    expect(html).toContain("<dt>Projects</dt><dd>Ndaje, Kër Bot, Prix Marché</dd>");
  });

  it("has one key, to take a room at the house", async () => {
    const html = await share.house("sacre-coeur");
    expect(html).toContain('<a class="key" href="/?city=Dakar&amp;in=house:sacre-coeur">Take a room</a>');
  });

  it("offers to see the house when it's full", () => {
    const html = sharePage({ id: "h", name: "H", city: "Dakar", rooms: [{ occupied: true, project: "P" }] }, SITE);
    expect(html).toContain('<a class="key" href="/?city=Dakar&amp;in=house:h">See the house</a>');
  });

  it("says it in French when the link asks", async () => {
    const html = await share.house("sacre-coeur", "fr");
    expect(html).toContain('<html lang="fr">');
    expect(meta(html, "og:title")).toBe("Rejoignez Sacré-Cœur sur La Coloc");
    expect(meta(html, "og:description")).toContain("4 chambres · 1 libre · Ndaje, Kër Bot, Prix Marché");
    expect(html).toContain(">Prendre une chambre</a>");
  });

  it("escapes what people wrote, and encodes a city's accents in addresses", async () => {
    await db.update(houses).set({ name: `<script>alert("x")</script>`, city: "Lomé" }).where(eq(houses.id, "sacre-coeur"));
    await db.update(rooms).set({ project: "<img src=x onerror=alert(1)>" }).where(eq(rooms.houseId, "sacre-coeur"));
    const html = await share.house("sacre-coeur");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    expect(meta(html, "og:title")).toBe("Join &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; on La Coloc");
    expect(meta(html, "og:image")).toBe(`${SITE}/og/Lom%C3%A9.jpg`);
    expect(html).toContain("/?city=Lom%C3%A9&amp;in=house:sacre-coeur");
  });
});

describe("a link to no house", () => {
  it("previews La Coloc itself, and says so kindly with a key to the city", async () => {
    for (const id of ["nope", "atelier", "x".repeat(100)]) {
      const html = await share.house(id);
      expect(meta(html, "og:title")).toBe("La Coloc");
      expect(meta(html, "og:image")).toBe(`${SITE}/og/city.jpg`);
      expect(html).toContain("<h1>This house isn&#39;t on the map</h1>");
      expect(html).toContain('<a class="key" href="/">Go to the city</a>');
    }
  });

  it("uses the generic picture for a city that isn't on the map", () => {
    const html = sharePage({ id: "h", name: "H", city: "Atlantis", rooms: [] }, SITE);
    expect(meta(html, "og:image")).toBe(`${SITE}/og/city.jpg`);
    expect(meta(html, "og:description")).toBe(`${PITCH} 0 rooms · full`);
  });
});

describe("escapeHtml", () => {
  it("escapes the five characters that matter in text and quoted attributes", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});
