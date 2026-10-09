import { describe, expect, it } from "vitest";
import { assertSafeApiUrl } from "./config";

describe("agent → hub line", () => {
  it("only sends the house secret unencrypted to this machine", () => {
    expect(() => assertSafeApiUrl("wss://coloc.dev/agent")).not.toThrow();
    expect(() => assertSafeApiUrl("ws://localhost:4100/agent")).not.toThrow();
    expect(() => assertSafeApiUrl("ws://127.0.0.1:4100/agent")).not.toThrow();
    expect(() => assertSafeApiUrl("ws://coloc.dev/agent")).toThrow();
    expect(() => assertSafeApiUrl("http://coloc.dev/agent")).toThrow();
  });
});
