// A few build slots for the whole house: a build takes up to 2 GB and a CPU, so ten of them at once (one push in
// each room, or someone pressing "update" in a loop) would starve the rooms that are serving. Builds past the
// slots wait their turn, in the order they came.
export class Slots {
  private busy = 0;
  private waiting: Array<() => void> = [];

  constructor(readonly size: number) {}

  // With a signal, a build cancelled while it waits leaves the line at once, and never takes a slot.
  async run<T>(job: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (this.busy >= this.size) await this.turn(signal);
    else this.busy++;
    try {
      return await job();
    } finally {
      // Hand the slot straight to the next in line, or free it.
      const next = this.waiting.shift();
      if (next) next();
      else this.busy--;
    }
  }

  private turn(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const go = () => {
        signal?.removeEventListener("abort", leave);
        resolve();
      };
      const leave = () => {
        this.waiting.splice(this.waiting.indexOf(go), 1);
        reject(signal!.reason);
      };
      this.waiting.push(go);
      signal?.addEventListener("abort", leave, { once: true });
    });
  }

  get queued(): number {
    return this.waiting.length;
  }
}
