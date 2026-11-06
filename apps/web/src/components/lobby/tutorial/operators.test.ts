// The providers' marks on the rent card: each known one in its colour, and a plain grey initial for the others.
import { describe, expect, it } from "vitest";
import { OPERATORS } from "../house/server";
import { operatorMark } from "./operators";

describe("a mobile money provider's mark", () => {
  it("has its own colour for each of the workshop's three", () => {
    const colours = OPERATORS.map((o) => operatorMark(o).bg);
    expect(new Set(colours).size).toBe(3);
    expect(operatorMark("Wave").path).toBeTruthy();
    expect(operatorMark("Orange Money").bg).toBe("#FF7900");
  });

  it("knows a provider whatever its case, and gives an unknown one its initial", () => {
    expect(operatorMark("orange money")).toEqual(operatorMark("Orange Money"));
    expect(operatorMark("MTN MoMo").letter).toBe("M");
    expect(operatorMark("Kash")).toMatchObject({ letter: "K" });
  });
});
