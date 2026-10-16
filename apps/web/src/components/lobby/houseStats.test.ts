import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../../i18n";
import { houseCounts, houseStatsWords as w } from "./houseStats";

const room = (name: string, occupied: boolean) => ({ name, occupant: occupied ? { login: name, name: null, avatarUrl: null } : null });

describe("a house at a glance", () => {
  afterEach(() => setLang("en"));

  it("counts who lives there, the rooms and the free ones", () => {
    expect(houseCounts({ rooms: [room("a", true), room("b", false), room("c", true), room("d", false)] } as never)).toEqual({ people: 2, rooms: 4, free: 2 });
    expect(houseCounts({ rooms: [] } as never)).toEqual({ people: 0, rooms: 0, free: 0 });
  });

  it("names each chip in a sentence, in English and French", () => {
    expect(w.people(1)).toBe("1 person lives here");
    expect(w.free(0)).toBe("No room free");
    setLang("fr");
    expect(w.people(3)).toBe("3 personnes habitent ici");
    expect(w.free(1)).toBe("1 chambre libre");
  });
});
