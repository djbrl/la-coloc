// The seeded city's fridge notes are written with the house's own templates, so a juror reads them in French too.
import { fridgeNotes } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { describe, expect, it } from "vitest";
import { readNote } from "../houses/lines";
import { seedCity } from "./city";

describe("the seeded life", () => {
  it("only pins notes the web can say in either language", async () => {
    const db = await testDb();
    await seedCity(db, { agentSecret: "dev-secret-change-me", domain: (id) => `${id}.coloc.dev`, life: true });
    const notes = await db.select().from(fridgeNotes);
    expect(notes.length).toBeGreaterThan(5);
    expect(notes.filter((n) => readNote(n.text) === null).map((n) => n.text)).toEqual([]);
  });
});
