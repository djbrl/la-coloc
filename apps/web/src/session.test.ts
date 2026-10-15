import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downWords } from "./core";
import { loadMe, logout, me, meLoaded, postJSON, sendJSON } from "./session";
import type { Me } from "./types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const user = { login: "awa", name: "Awa", houses: [], knocks: [] } as unknown as Me;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  me.value = null;
  meLoaded.value = false;
});
afterEach(() => vi.unstubAllGlobals());

describe("writes when the core is down", () => {
  const cases: [string, () => void][] = [
    ["no answer at all", () => fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))],
    ["a proxy's 502", () => fetchMock.mockResolvedValue(new Response("Bad gateway", { status: 502 }))],
    ["a proxy's 503", () => fetchMock.mockResolvedValue(new Response("", { status: 503 }))],
    ["a proxy's 504", () => fetchMock.mockResolvedValue(new Response("", { status: 504 }))],
    ["the API's core_down", () => fetchMock.mockResolvedValue(json({ code: "core_down", message: "The core is down." }, 503))],
    ["the dev proxy's empty 500", () => fetchMock.mockResolvedValue(new Response("", { status: 500, headers: { "Content-Type": "text/plain" } }))],
  ];

  for (const [name, arrange] of cases) {
    it(`postJSON says so in plain words, and doesn't throw: ${name}`, async () => {
      arrange();
      const res = await postJSON("/api/houses/x/messages", { body: "hello" });
      expect(res).toEqual({ ok: false, message: downWords.write, down: true });
    });
    it(`sendJSON says the same: ${name}`, async () => {
      arrange();
      const res = await sendJSON("PATCH", "/api/me", { avatar: "a" });
      expect(res).toEqual({ ok: false, message: downWords.write, down: true });
    });
  }

  it("sends once: nothing is retried behind the caller's back", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await postJSON("/api/x", {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("writes when the API answers", () => {
  it("returns the data on success, and sends the JSON", async () => {
    fetchMock.mockResolvedValue(json({ id: "k1" }, 201));
    const res = await postJSON<{ id: string }>("/api/city/houses", { name: "Ndaje" });
    expect(res).toEqual({ ok: true, data: { id: "k1" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/city/houses");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "Ndaje" }));
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("treats an empty success as an empty object", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));
    expect(await sendJSON("DELETE", "/api/x")).toEqual({ ok: true, data: {} });
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it("passes the API's own message through, and it isn't an outage", async () => {
    fetchMock.mockResolvedValue(json({ message: "You already knocked." }, 409));
    expect(await postJSON("/api/x", {})).toEqual({ ok: false, message: "You already knocked." });
    fetchMock.mockResolvedValue(json({ statusCode: 500, message: "Internal server error" }, 500));
    const res = await postJSON("/api/x", {});
    expect(res).toEqual({ ok: false, message: "Internal server error" });
    expect("down" in res).toBe(false);
  });

  it("says 'Log in first.' for a 401 without a message, and 'That didn't work.' otherwise", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    expect(await postJSON("/api/x", {})).toEqual({ ok: false, message: "Log in first." });
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    expect(await postJSON("/api/x", {})).toEqual({ ok: false, message: "That didn't work." });
  });
});

describe("who you are, while the core is down", () => {
  it("is unknown, not 'logged out': nothing about me changes, and it isn't marked loaded", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await loadMe();
    expect(me.value).toBeNull();
    expect(meLoaded.value).toBe(false);
    fetchMock.mockResolvedValue(json({ code: "core_down", message: "down" }, 503));
    await loadMe();
    expect(meLoaded.value).toBe(false);
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    await loadMe();
    expect(meLoaded.value).toBe(false);
  });

  it("keeps the last known me when a refresh fails", async () => {
    fetchMock.mockResolvedValue(json({ user }));
    await loadMe();
    expect(me.value?.login).toBe("awa");
    expect(meLoaded.value).toBe(true);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await loadMe();
    expect(me.value?.login).toBe("awa");
    expect(meLoaded.value).toBe(true);
    fetchMock.mockResolvedValue(new Response("", { status: 502 }));
    await loadMe();
    expect(me.value?.login).toBe("awa");
  });

  it("knows a visitor when the API says nobody", async () => {
    fetchMock.mockResolvedValue(json({ user: null }));
    await loadMe();
    expect(me.value).toBeNull();
    expect(meLoaded.value).toBe(true);
  });

  it("a real refusal (401) means logged out", async () => {
    me.value = user;
    fetchMock.mockResolvedValue(json({ message: "no" }, 401));
    await loadMe();
    expect(me.value).toBeNull();
    expect(meLoaded.value).toBe(true);
  });

  it("logging out needs the core: while it's down you stay logged in", async () => {
    me.value = user;
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await logout()).toBe(false);
    expect(me.value?.login).toBe("awa");
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    expect(await logout()).toBe(false);
    expect(me.value?.login).toBe("awa");
    fetchMock.mockResolvedValue(json({ ok: true }));
    expect(await logout()).toBe(true);
    expect(me.value).toBeNull();
  });
});
