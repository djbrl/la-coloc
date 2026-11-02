import { describe, expect, it } from "vitest";
import { billedRooms } from "./leases";

const room = (name: string, occupantId: string | null, memoryMb = 256) => ({ name, occupantId, memoryMb });

describe("who pays for a room this month", () => {
  it("is whoever lives in it, once per room, and nobody for a free room", () => {
    expect(billedRooms([room("a", "awa"), room("b", "awa", 512), room("c", null)], [])).toEqual([
      { name: "a", memoryMb: 256, payer: "awa" },
      { name: "b", memoryMb: 512, payer: "awa" },
    ]);
  });

  it("stays whoever left it, until the month is over", () => {
    expect(billedRooms([room("a", null)], [{ room: "a", userId: "awa", memoryMb: 256 }])).toEqual([{ name: "a", memoryMb: 256, payer: "awa" }]);
  });

  it("isn't someone who moved in since", () => {
    expect(billedRooms([room("a", "fatou")], [{ room: "a", userId: "awa", memoryMb: 256 }])).toEqual([{ name: "a", memoryMb: 256, payer: "awa" }]);
  });
});
