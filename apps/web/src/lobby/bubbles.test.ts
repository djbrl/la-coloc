import { describe, expect, it } from "vitest";
import { bubbleText, SAY } from "./bubbles";

describe("a speech bubble's text", () => {
  it("is the line as written when it's short", () => {
    expect(bubbleText("Nanga def ?")).toBe("Nanga def ?");
  });

  it("is cut to 80 characters, ending with an ellipsis", () => {
    const long = "a".repeat(200);
    const cut = bubbleText(long);
    expect(Array.from(cut)).toHaveLength(SAY.max);
    expect(cut.endsWith("…")).toBe(true);
    // Exactly 80 stays whole.
    expect(bubbleText("b".repeat(80))).toBe("b".repeat(80));
  });

  it("doesn't leave a space before the ellipsis", () => {
    const text = `${"word ".repeat(15)}${"x".repeat(30)}`;
    expect(bubbleText(text, 11)).toBe("word word…");
  });

  it("never cuts an emoji or an accented letter in half", () => {
    const family = "👩‍👩‍👧";
    const cut = bubbleText(family.repeat(5), 3);
    expect(cut).toBe(`${family}${family}…`);
    expect(bubbleText("é".repeat(4), 3)).toBe("éé…");
  });

  it("puts everything on one line, with single spaces", () => {
    expect(bubbleText("  hello\n\n\tthere   you  ")).toBe("hello there you");
  });

  it("keeps markup as plain text (the bubble writes it with textContent)", () => {
    expect(bubbleText("<b>hi</b> & <script>")).toBe("<b>hi</b> & <script>");
  });

  it("is empty for an empty or blank line", () => {
    expect(bubbleText("")).toBe("");
    expect(bubbleText(" \n ")).toBe("");
  });
});
