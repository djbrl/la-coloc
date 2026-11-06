import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the browser's audio: it does nothing, but counts the oscillators and noise sources it was asked for.
function fakeAudio() {
  const made = { oscillators: 0, noises: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect: (next: unknown) => next });
  class FakeContext {
    state = "running";
    currentTime = 0;
    sampleRate = 100;
    destination = {};
    resume = async () => {};
    createGain = () => ({ ...node(), gain: param() });
    createBiquadFilter = () => ({ ...node(), frequency: param(), Q: param(), type: "" });
    createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
    createOscillator = () => {
      made.oscillators++;
      return { ...node(), type: "", frequency: param(), start() {}, stop() {} };
    };
    createBufferSource = () => {
      made.noises++;
      return { ...node(), buffer: null, start() {} };
    };
  }
  return { FakeContext, made };
}

// Each test gets a fresh copy of the module, because it keeps its audio context between calls.
async function load() {
  vi.resetModules();
  const sound = await import("./sound");
  const { settings } = await import("../settings");
  return { ...sound, settings };
}

describe("sounds", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stay silent, without an error, when the browser has no audio", async () => {
    const { play, unlock } = await load();
    expect(() => play("open")).not.toThrow();
    expect(() => unlock()).not.toThrow();
  });

  it("don't even try without a window (server or test runner)", async () => {
    vi.unstubAllGlobals();
    const { play } = await load();
    expect(() => play("arrive")).not.toThrow();
  });

  it("play when sounds are on", async () => {
    const { FakeContext, made } = fakeAudio();
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), AudioContext: FakeContext });
    const { play, settings } = await load();
    settings.sound = true;
    play("emote");
    expect(made.oscillators).toBe(2);
  });

  it("play the quest's sounds: a stamp, the keys and a stage tick", async () => {
    const { FakeContext, made } = fakeAudio();
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), AudioContext: FakeContext });
    const { play, settings } = await load();
    settings.sound = true;
    play("stamp");
    expect(made.oscillators).toBe(3);
    expect(made.noises).toBe(1);
    play("keys");
    expect(made.oscillators).toBe(9);
    expect(made.noises).toBe(7);
    play("tick");
    expect(made.oscillators).toBe(10);
  });

  it("play the city's happenings: a crash and a coin", async () => {
    const { FakeContext, made } = fakeAudio();
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), AudioContext: FakeContext });
    const { play, settings } = await load();
    settings.sound = true;
    play("crash");
    expect(made.oscillators).toBe(2);
    expect(made.noises).toBe(1);
    play("coin");
    expect(made.oscillators).toBe(4);
  });

  it("do nothing when sounds are off in settings", async () => {
    const { FakeContext, made } = fakeAudio();
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), AudioContext: FakeContext });
    const { play, settings } = await load();
    settings.sound = false;
    play("emote");
    play("knock");
    expect(made.oscillators + made.noises).toBe(0);
  });

  it("can't repeat the same sound faster than the throttle", async () => {
    const { FakeContext, made } = fakeAudio();
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }), AudioContext: FakeContext });
    const { play, settings } = await load();
    settings.sound = true;
    play("select");
    play("select");
    expect(made.oscillators).toBe(1);
  });
});
