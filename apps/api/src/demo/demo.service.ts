// The demo reset: one button that puts the whole city back to the seed, so every jury member or visitor starts
// from the same city. People and their logins stay; everything about houses goes and is planted again.
import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { type Db, houses, messages, rooms, users } from "@coloc/db";
import { and, eq, like, or } from "drizzle-orm";
import { AgentRegistry } from "../agents/agent.registry";
import { DB } from "../db/db.module";
import { HousesService } from "../houses/houses.service";
import { CITY, plantCity, type SeedOptions } from "../seed/city";

export const SEED_OPTIONS = Symbol("SEED_OPTIONS");

// Two resets at least this far apart.
export const RESET_COOLDOWN_MS = 10 * 60 * 1000;

@Injectable()
export class DemoService {
  // When the city was last reset (ms), kept in memory: a restart of the API allows one more.
  private lastReset: number | null = null;
  // Tests shorten it.
  cooldownMs = RESET_COOLDOWN_MS;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    private readonly agents: AgentRegistry,
    @Inject(SEED_OPTIONS) private readonly seed: SeedOptions,
  ) {}

  async reset(): Promise<{ ok: true }> {
    const now = Date.now();
    if (this.lastReset !== null && now - this.lastReset < this.cooldownMs) {
      const minutes = Math.ceil((this.cooldownMs - (now - this.lastReset)) / 60_000);
      throw new HttpException(`The city was just reset. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    // Taken before the reset runs, so two clicks at once can't both go through; given back if it fails.
    const previous = this.lastReset;
    this.lastReset = now;
    try {
      return await this.replant();
    } catch (e) {
      this.lastReset = previous;
      throw e;
    }
  }

  private async replant(): Promise<{ ok: true }> {
    // The rooms the seed plants with someone in them: those keep running. Every other room is about to disappear,
    // or to be free (a free room is empty after the reset, whatever ran there).
    const lived = new Set(CITY.flatMap((h) => h.rooms.filter((r) => r.who).map((r) => `${h.id}/${r.name}`)));
    const seededHouses = new Set(CITY.map((h) => h.id));
    // Demo houses have no server: nothing ever runs in their rooms.
    const demoHouses = new Set(CITY.filter((h) => h.demo).map((h) => h.id));
    const before = await this.db.select().from(rooms);
    const oldHouses = (await this.db.select({ id: houses.id }).from(houses)).map((h) => h.id);

    // First the agents: each online one removes the containers of its rooms that won't exist after the reset
    // (tutorial rooms, rooms of houses people started), and of the seeded rooms that are free after it (someone
    // may have moved into one and put a project online): an empty room serves nothing.
    for (const r of before) {
      if (!r.demo && !demoHouses.has(r.houseId) && !lived.has(`${r.houseId}/${r.name}`) && this.agents.isOnline(r.houseId)) this.agents.send(r.houseId, { type: "remove_room", room: r.name });
    }
    // A house the seed doesn't have loses its key with it: its agent is hung up.
    for (const id of oldHouses) if (!seededHouses.has(id)) this.agents.hangUp(id, "the city was reset");

    await this.db.transaction(async (tx) => {
      // Deleting the houses takes their rooms, flatmates, knocks and votes, chores, notes, deployments, secrets,
      // linked repos and usage with them (all cascade). Chat isn't tied to a house in the schema, so a house's channel
      // (`house:<id>`) and a knock's (`application:<id>`) go by hand. People's direct messages, the cities' rooms and
      // their boards belong to people, not houses: they stay. So do real people's Arena entries, pull requests and
      // titles; the seeded people's are planted again with the city (seed/arena.ts).
      await tx.delete(messages).where(or(like(messages.channel, "house:%"), like(messages.channel, "application:%")));
      await tx.delete(houses);
      await tx.update(users).set({ tutorialDoneAt: null });
      await plantCity(tx, this.seed);

      // A seeded room an agent is still running keeps what the agent last said about it: it's still online.
      for (const r of before) {
        if (lived.has(`${r.houseId}/${r.name}`) && this.agents.isOnline(r.houseId) && r.url) {
          await tx
            .update(rooms)
            .set({ status: r.status, url: r.url })
            .where(and(eq(rooms.houseId, r.houseId), eq(rooms.name, r.name)));
        }
      }
    });

    for (const id of new Set([...oldHouses, ...seededHouses])) this.houses.changes.next(id);
    return { ok: true };
  }
}
