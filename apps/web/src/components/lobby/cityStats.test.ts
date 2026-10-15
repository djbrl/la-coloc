import { describe, expect, it } from "vitest";
import { cityAlert, cityStats } from "./cityStats";

const awa = { login: "awa", name: "Awa", avatarUrl: null };
const room = (status: "live" | "failed" | "down", occupied = true) => ({ status, occupant: occupied ? awa : null });
type House = Parameters<typeof cityAlert>[0][number] & { city: string };
const house = (over: Partial<House> = {}): House => ({
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
    expect(cityAlert([house(), house({ name: "Almadies" })])).toBeNull();
  });

  it("names the real houses whose server is down, before anything else", () => {
    const alert = cityAlert([house({ agentOnline: false, rooms: [room("failed")] }), house({ name: "Almadies", demo: true, agentOnline: false })]);
    expect(alert).toEqual({ kind: "down", houses: ["Sacré-Cœur"] });
  });

  it("counts failed builds in real houses only, and leaves a house being set up alone", () => {
    expect(cityAlert([house({ rooms: [room("failed"), room("failed")] }), house({ demo: true, rooms: [room("failed")] })])).toEqual({ kind: "failed", rooms: 2 });
    expect(cityAlert([house({ status: "making", agentOnline: false })])).toBeNull();
  });
});

describe("the travel menu's stats", () => {
  it("counts houses per city, and only real projects as online", () => {
    const stats = cityStats([house(), house({ demo: true }), house({ city: "Lomé", rooms: [room("down")] })]);
    expect(stats.get("Dakar")).toEqual({ houses: 2, online: 1 });
    expect(stats.get("Lomé")).toEqual({ houses: 1, online: 0 });
  });
});
