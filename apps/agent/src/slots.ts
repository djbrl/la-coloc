// A few build slots for the whole house: a build takes up to 2 GB and a CPU, so ten of them at once (one push in
// each room, or someone pressing "update" in a loop) would starve the rooms that are serving. Builds past the
// slots wait their turn, in the order they came.
export class Slots {
  private busy = 0;
  private waiting: Array<() => void> = [];

  constructor(readonly size: number) {}

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.busy >= this.size) await new Promise<void>((resolve) => this.waiting.push(resolve));
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

  get queued(): number {
    return this.waiting.length;
  }
}
