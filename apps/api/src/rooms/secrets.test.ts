import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkSecret, SecretBox } from "./secrets";

const key = randomBytes(32).toString("base64");

describe("room secrets", () => {
  it("round-trips, and never stores the value in clear", () => {
    const box = new SecretBox(key);
    const sealed = box.encrypt("sk_live_abc123");
    expect(sealed).not.toContain("sk_live");
    expect(box.decrypt(sealed)).toBe("sk_live_abc123");
    // Same value, different ciphertext every time.
    expect(box.encrypt("sk_live_abc123")).not.toBe(sealed);
  });

  it("refuses a tampered value or the wrong key", () => {
    const sealed = new SecretBox(key).encrypt("secret");
    const [iv, tag, data] = sealed.split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 1;
    expect(() => new SecretBox(key).decrypt([iv, tag, flipped.toString("base64url")].join("."))).toThrow();
    expect(() => new SecretBox(randomBytes(32).toString("base64")).decrypt(sealed)).toThrow();
  });

  it("needs a 32-byte key", () => {
    expect(() => new SecretBox(randomBytes(16).toString("base64"))).toThrow();
  });

  it("checks names and sizes", () => {
    expect(checkSecret("STRIPE_KEY", "x")).toBeNull();
    expect(checkSecret("stripe_key", "x")).toMatch(/capitals/);
    expect(checkSecret("PORT", "80")).toMatch(/set by La Coloc/);
    expect(checkSecret("BIG", "x".repeat(5000))).toMatch(/under/);
  });
});
