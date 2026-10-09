import "reflect-metadata";
import { type Db, houses, memberships, rooms } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { asc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthService } from "../auth/auth.service";
import { seedCity } from "../seed/city";
import { CityController } from "./houses.controller";
import { HousesService, slugify } from "./houses.service";

let db: Db;
let as: string | null;
let controller: CityController;
let changed: string[];

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  as = null;
  // Logs the request in as whoever `as` names.
  const auth = {
    userFromRequest: async () => (as ? (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, as!) })) ?? null : null),
  } as unknown as AuthService;
  const service = new HousesService(db);
  changed = [];
  service.changes.subscribe((id) => changed.push(id));
  controller = new CityController(service, auth);
});

const req = { headers: {} };
const rent = (body: unknown) => controller.rent(body, req);

describe("starting a coloc on an empty plot", () => {
  it("creates a house in the making that the city shows on its plot", async () => {
    as = "jib";
    const res = await rent({ city: "Dakar", plot: "2.1.0.1", name: "  Médina Lab ", tagline: "" });
    expect(res).toEqual({ id: "medina-lab" });
    expect(changed).toContain("medina-lab");

    const city = await controller.city();
    const h = city.houses.find((x) => x.id === "medina-lab")!;
    expect(h).toMatchObject({ name: "Médina Lab", city: "Dakar", country: "SN", tagline: null, status: "making", demo: false, plot: "2.1.0.1" });
    expect(h.rooms.map((r) => [r.name, r.occupant?.login ?? null])).toEqual([
      ["jib", "jib"],
      ["room-2", null],
      ["room-3", null],
      ["room-4", null],
    ]);

    const [row] = await db.select().from(houses).where(eq(houses.id, "medina-lab"));
    expect(row.domain).toBe("medina-lab.coloc.dev");
    expect(row.monthlyCostFcfa).toBeNull();
    const members = await db.select().from(memberships).where(eq(memberships.houseId, "medina-lab"));
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ role: "chef", tontinePosition: 0 });
    const rs = await db.select().from(rooms).where(eq(rooms.houseId, "medina-lab")).orderBy(asc(rooms.name));
    expect(rs.every((r) => r.memoryMb === 256 && r.cpus === 0.5 && r.status === "empty")).toBe(true);
  });

  it("asks you to log in first", async () => {
    await expect(rent({ city: "Dakar", plot: "2.1.0.1", name: "Médina Lab" })).rejects.toThrow("Log in first.");
  });

  it("refuses a plot someone already rented", async () => {
    as = "jib";
    await rent({ city: "Dakar", plot: "2.1.0.1", name: "Médina Lab" });
    as = "awa";
    await expect(rent({ city: "Dakar", plot: "2.1.0.1", name: "Plateau" })).rejects.toThrow("That plot is taken.");
    // The same key in another city is a different plot.
    await expect(rent({ city: "Lomé", plot: "2.1.0.1", name: "Plateau" })).resolves.toEqual({ id: "plateau" });
  });

  it("refuses a name another house already has", async () => {
    as = "jib";
    await expect(rent({ city: "Dakar", plot: "2.1.0.1", name: "Almadies" })).rejects.toThrow("A house already has that name.");
  });

  it("lets a person set up one house at a time", async () => {
    as = "jib";
    await rent({ city: "Dakar", plot: "2.1.0.1", name: "Médina Lab" });
    await expect(rent({ city: "Dakar", plot: "3.1.0.0", name: "Plateau" })).rejects.toThrow(
      "You're already setting up Médina Lab. Finish that one first.",
    );
  });

  it("rejects a plot key the lobby never gives out", async () => {
    as = "jib";
    for (const plot of ["2.1.0", "2.1.0.2", "a.b.c.d", "123.1.0.1"]) {
      await expect(rent({ city: "Dakar", plot, name: "Médina Lab" })).rejects.toThrow("That isn't a plot in the lobby.");
    }
  });

  it("only builds in cities that are on the map", async () => {
    as = "jib";
    await expect(rent({ city: "Atlantis", plot: "2.1.0.1", name: "Médina Lab" })).rejects.toThrow("No such city.");
  });
});

describe("house ids", () => {
  it("are slugs of the name", () => {
    expect(slugify("Sacré-Cœur")).toBe("sacre-coeur");
    expect(slugify("  Bè Kpota!! ")).toBe("be-kpota");
    expect(slugify("x".repeat(39) + " y")).toBe("x".repeat(39));
  });
});
