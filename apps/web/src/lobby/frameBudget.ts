// Watches how long frames take, and says when the city has been too slow for a while, so Lobby.ts can draw less. It
// only ever steps down: going back up would make the picture flicker between two qualities. Pure, and tested.

// Under this many frames a second, for a whole window, it's too slow. Below 30 on purpose: a browser saving battery
// caps at a flat 30, and that's smooth enough.
const SLOW_FPS = 27;
const WINDOW_MS = 3000;
// A frame this long isn't the city being slow: the tab was in the background, or the town was being rebuilt.
const NOT_A_FRAME_MS = 250;
// Arriving somewhere is slow by nature (models loading, shaders compiling): it says nothing about the machine.
const SETTLING_MS = 6000;

export class FrameBudget {
  private spent = 0;
  private frames = 0;
  private settling = SETTLING_MS;

  /** The town is being built: this doesn't count for a moment. */
  settle() {
    this.settling = SETTLING_MS;
    this.spent = 0;
    this.frames = 0;
  }

  /** One frame's duration. True when the last few seconds were too slow; the count then starts over. */
  add(ms: number): boolean {
    if (this.settling > 0) {
      this.settling -= ms;
      return false;
    }
    if (ms >= NOT_A_FRAME_MS) return false;
    this.spent += ms;
    this.frames++;
    if (this.spent < WINDOW_MS) return false;
    const slow = (this.frames * 1000) / this.spent < SLOW_FPS;
    this.spent = 0;
    this.frames = 0;
    return slow;
  }
}
