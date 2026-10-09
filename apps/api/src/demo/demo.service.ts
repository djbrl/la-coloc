// The demo reset: one button that puts the whole city back to the seed, so every jury member or visitor starts
// from the same city. People and their logins stay; everything about houses goes and is planted again.
import { Inject, Injectable } from "@nestjs/common";
import { type Db, houses, messages, rooms, users } from "@coloc/db";
import { and, eq } from "drizzle-orm";
import { AgentRegistry } from "../agents/agent.registry";
import { DB } from "../db/db.module";
import { HousesService } from "../houses/houses.service";
import { CITY, plantCity, type SeedOptions } from "../seed/city";

export const SEED_OPTIONS = Symbol("SEED_OPTIONS");

@Injectable()
export class DemoService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    private readonly agents: AgentRegistry,
    @Inject(SEED_OPTIONS) private readonly seed: SeedOptions,
  ) {}

  async reset(): Promise<{ ok: true }> {
    // The rooms the seed plants. Those keep running; every other room is about to disappear.
    const seeded = new Set(CITY.flatMap((h) => h.rooms.map((r) => `${h.id}/${r.name}`)));
    const seededHouses = new Set(CITY.map((h) => h.id));
    const before = await this.db.select().from(rooms);
    const oldHouses = (await this.db.select({ id: houses.id }).from(houses)).map((h) => h.id);

    // First the agents: each online one removes the containers of its rooms that won't exist after the reset
    // (tutorial rooms, rooms of houses people started).
    for (const r of before) {
      if (!seeded.has(`${r.houseId}/${r.name}`) && this.agents.isOnline(r.houseId)) this.agents.send(r.houseId, { type: "remove_room", room: r.name });
    }
    // A house the seed doesn't have loses its key with it: its agent is hung up.
    for (const id of oldHouses) if (!seededHouses.has(id)) this.agents.hangUp(id, "the city was reset");

    await this.db.transaction(async (tx) => {
      // Deleting the houses takes their rooms, flatmates, knocks and votes, chores, notes, deployments, secrets,
      // linked repos and usage with them (all cascade). Chat isn't tied to a house in the schema, so it goes by hand.
      await tx.delete(messages);
      await tx.delete(houses);
      await tx.update(users).set({ tutorialDoneAt: null });
      await plantCity(tx, this.seed);

      // A seeded room an agent is still running keeps what the agent last said about it: it's still online.
      for (const r of before) {
        if (seeded.has(`${r.houseId}/${r.name}`) && this.agents.isOnline(r.houseId) && r.url) {
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
