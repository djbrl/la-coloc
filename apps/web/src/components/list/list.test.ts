import { describe, expect, it } from "vitest";
import type { CityHouse, HouseView, Person, Room, Viewer } from "../../types";
import { cityTotals, faces, flag, keeps, roomsLine, rowLine, yoursFirst } from "./city";
import { fcfa } from "../lobby/house/server";
import { chefCanManage, houseFacts, roomLabel, tallyLine, workLine, workRows } from "./house";

const person = (login: string): Person => ({ login, name: login[0].toUpperCase() + login.slice(1), avatarUrl: null });
const room = (name: string, occupant: Person | null, extra: Partial<Room> = {}): Room => ({
  name,
  limits: { memoryMb: 256, cpus: 0.5 },
  status: occupant ? "live" : "empty",
  url: occupant ? `http://${name}.coloc.localhost` : null,
  project: occupant ? "A project" : null,
  projectDescription: null,
  ad: null,
  occupant,
  usage: null,
  ...extra,
});
const cityHouse = (id: string, extra: Partial<CityHouse> = {}): CityHouse => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  city: "Dakar",
  country: "SN",
  tagline: null,
  status: "live",
  demo: false,
  agentOnline: true,
  monthlyCostFcfa: null,
  plot: null,
  rooms: [room("one", person("awa")), room("two", null)],
  ...extra,
});
const viewer = (v: Partial<Viewer> = {}): Viewer => ({ login: "jib", member: false, role: null, room: null, application: null, ...v });

describe("the city list", () => {
  const almadies = cityHouse("almadies", { tagline: "Four apps by the sea." });
  const kpota = cityHouse("kpota", { city: "Lomé", status: "making", rooms: [room("a", person("kofi")), room("b", null), room("c", null)] });
  const full = cityHouse("full", { rooms: [room("x", person("moussa"), { project: "Prix Marché" })] });

  it("counts houses, free rooms and houses being set up", () => {
    expect(cityTotals([almadies, kpota, full])).toEqual({ houses: 3, free: 3, making: 1 });
  });

  it("filters, then searches names, cities, projects and people", () => {
    expect(keeps(full, "free", "")).toBe(false);
    expect(keeps(kpota, "making", "")).toBe(true);
    expect(keeps(almadies, "making", "")).toBe(false);
    expect(keeps(kpota, "all", "lomé")).toBe(true);
    expect(keeps(full, "all", "prix")).toBe(true);
    expect(keeps(full, "all", "Moussa")).toBe(true);
    expect(keeps(almadies, "all", "  ")).toBe(true);
    expect(keeps(almadies, "all", "nothing like it")).toBe(false);
  });

  it("puts your houses first and keeps the rest in order", () => {
    expect(yoursFirst([almadies, kpota, full], ["full"]).map((h) => h.id)).toEqual(["full", "almadies", "kpota"]);
  });

  it("says rooms the way a row should", () => {
    expect(roomsLine(almadies)).toBe("2 rooms, 1 free");
    expect(roomsLine(full)).toBe("1 room, all taken");
    expect(roomsLine(kpota)).toBe("3 rooms, 1 signed up");
  });

  it("falls back from the tagline to a free room's ad", () => {
    expect(rowLine(almadies)).toBe("Four apps by the sea.");
    expect(rowLine(cityHouse("ad", { rooms: [room("r", null, { ad: "Looking for a mobile dev" })] }))).toBe("Looking for a mobile dev");
    expect(rowLine(cityHouse("demo", { demo: true }))).toBe("An example house.");
  });

  it("shows a few faces and counts the rest", () => {
    const busy = cityHouse("busy", { rooms: ["a", "b", "c", "d", "e"].map((l) => room(l, person(l + "x"))) });
    expect(faces(busy).people.map((p) => p.login)).toEqual(["ax", "bx", "cx"]);
    expect(faces(busy).more).toBe(2);
    expect(faces(kpota)).toEqual({ people: [person("kofi")], more: 0 });
  });

  it("turns a country code into its flag", () => {
    expect(flag("SN")).toBe("🇸🇳");
    expect(flag("bj")).toBe("🇧🇯");
    expect(flag("")).toBe("");
    expect(flag("SEN")).toBe("");
  });
});

describe("a house's page in the list view", () => {
  const awa = person("awa");
  const moussa = person("moussa");
  const house = (extra: Partial<HouseView> = {}): HouseView => ({
    id: "sacre-coeur",
    name: "Sacré-Cœur",
    city: "Dakar",
    country: "SN",
    tagline: null,
    status: "live",
    demo: false,
    domain: "coloc.localhost",
    agentOnline: true,
    monthlyCostFcfa: 12000,
    rules: { strictReviews: true },
    chef: moussa,
    members: [
      { ...moussa, role: "chef" },
      { ...awa, role: "flatmate" },
    ],
    rooms: [
      room("awa", awa, { usage: { cpuPercent: 1.234, memoryBytes: 64 * 1048576, memoryLimitBytes: 256 * 1048576, at: "" } }),
      room("moussa", moussa),
      room("free", null),
    ],
    viewer: null,
    deployments: null,
    notes: null,
    doorbell: null,
    channel: null,
    chores: null,
    server: null,
    ledger: [{ login: "awa", given: 3, received: 1 }],
    ...extra,
  });

  it("lets the chef manage anyone else's room in a live house", () => {
    const chef = viewer({ login: "moussa", member: true, role: "chef", room: "moussa" });
    const awaRoom = house().rooms[0];
    expect(chefCanManage(awaRoom, chef, "live")).toBe(true);
    expect(chefCanManage(house().rooms[1], chef, "live")).toBe(false);
    expect(chefCanManage(awaRoom, chef, "making")).toBe(false);
    expect(chefCanManage(awaRoom, viewer({ member: true, role: "flatmate" }), "live")).toBe(false);
    expect(chefCanManage({ ...awaRoom, demo: true }, chef, "live")).toBe(false);
    expect(chefCanManage(house().rooms[2], chef, "live")).toBe(false);
  });

  it("lists the rooms at work with what they use and their reviews", () => {
    const rows = workRows(house(), viewer({ login: "moussa", member: true, role: "chef", room: "moussa" }));
    expect(rows.map((r) => r.room.name)).toEqual(["awa", "moussa"]);
    expect(rows[0]).toMatchObject({ memory: { mb: 64, pct: 25 }, cpu: "1.2", given: 3, received: 1, manage: true });
    expect(rows[1]).toMatchObject({ memory: null, cpu: null, given: 0, manage: false });
    expect(workLine(rows[0])).toBe("64 of 256 MB · 1.2% CPU");
    expect(workLine(rows[1])).toBe("256 MB and 0.5 CPU. Nothing measured yet.");
    expect(workRows(house({ status: "making" }), null)).toEqual([]);
    expect(workRows(house({ demo: true }), null)).toEqual([]);
    // Nothing measured, no reviews, nothing to manage: nothing worth a card.
    const quiet = house({ ledger: [], rooms: [room("awa", awa), room("moussa", moussa)] });
    expect(workRows(quiet, null)).toEqual([]);
    expect(workRows(quiet, viewer({ login: "moussa", member: true, role: "chef", room: "moussa" }))).toHaveLength(2);
  });

  it("names a build's room after whoever lives there", () => {
    expect(roomLabel(house(), "awa")).toBe("Awa");
    expect(roomLabel(house(), "free")).toBe("Room free");
    expect(roomLabel(house(), "gone")).toBe("Room gone");
    expect(tallyLine({ yes: 1, needed: 2 })).toBe("1 of 2 yes");
  });

  it("tells a visitor the rent and what's for flatmates, and a flatmate neither", () => {
    const visitor = houseFacts(house()).map((f) => f.key);
    expect(visitor).toEqual(["chef", "address", "rent", "reviews", "flatmates"]);
    expect(houseFacts(house()).find((f) => f.key === "rent")?.title).toBe(`About ${fcfa(4000)} a room, a month`);
    const flatmate = houseFacts(house({ viewer: viewer({ login: "awa", member: true, role: "flatmate", room: "awa" }) })).map((f) => f.key);
    expect(flatmate).toEqual(["chef", "address", "reviews"]);
  });

  it("leaves the address out of an example house", () => {
    expect(houseFacts(house({ demo: true, ledger: [] })).map((f) => f.key)).toEqual(["chef", "rent", "flatmates"]);
  });
});
