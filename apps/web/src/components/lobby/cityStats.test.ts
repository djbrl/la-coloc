import { describe, expect, it } from "vitest";
import { cityAlert, cityStats } from "./cityStats";

const awa = { login: "awa", name: "Awa", avatarUrl: null };
const room = (status: "live" | "failed" | "down", occupied = true) => ({ status, occupant: occupied ? awa : null });
type House = Parameters<typeof cityAlert>[0][number] & Parameters<typeof cityStats>[0][number];
const house = (over: Partial<House> = {}): House => ({
  id: "sacre-coeur",
  name: "Sacré-Cœur",
  city: "Dakar",
  demo: false,
  status: "live",
  agentOnline: true,
  rooms: [room("live"), room("live", false)],
  ...over,
});

describe("the city's alert", () => {
  it("says nothing while every house is fine", () => {
    expect(cityAlert([house(), house({ id: "almadies", name: "Almadies" })], ["sacre-coeur"])).toBeNull();
  });

  it("names a house you live in whose server is down", () => {
    expect(cityAlert([house({ agentOnline: false })], ["sacre-coeur"])).toEqual({ kind: "down", houses: ["Sacré-Cœur"] });
  });

  it("keeps a stranger's trouble off your screen: their server, and anyone's failed build", () => {
    expect(cityAlert([house({ agentOnline: false })], ["almadies"])).toBeNull();
    expect(cityAlert([house({ agentOnline: false })], [])).toBeNull();
    expect(cityAlert([house({ rooms: [room("failed"), room("failed")] })], ["sacre-coeur"])).toBeNull();
  });

  it("leaves example houses and a house being set up alone", () => {
    expect(cityAlert([house({ demo: true, agentOnline: false })], ["sacre-coeur"])).toBeNull();
    expect(cityAlert([house({ status: "making", agentOnline: false })], ["sacre-coeur"])).toBeNull();
  });
});

describe("the travel menu's stats", () => {
  it("counts houses per city, and only real projects as online", () => {
    const stats = cityStats([house(), house({ demo: true }), house({ city: "Lomé", rooms: [room("down")] })]);
    expect(stats.get("Dakar")).toEqual({ houses: 2, online: 1 });
    expect(stats.get("Lomé")).toEqual({ houses: 1, online: 0 });
  });
});
