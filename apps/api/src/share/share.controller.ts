// GET /api/share/house/:id: the link people share for a house (share.ts draws the page). Public, no login, and
// cacheable for a few minutes, since WhatsApp and the others fetch it again for every chat it's pasted in. On the
// shared site, Vercel forwards /api to the laptop's tunnel, so a crawler reaches it while the laptop is up.
import { Controller, Get, Header, Inject, Param, Query } from "@nestjs/common";
import { type Db, houses, rooms } from "@coloc/db";
import { asc, eq } from "drizzle-orm";
import type { AuthConfig } from "../auth/auth.config";
import { AUTH_CONFIG } from "../auth/auth.service";
import { DB } from "../db/db.module";
import { type SharedHouse, sharePage } from "./share";

@Controller("share")
export class ShareController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AUTH_CONFIG) private readonly config: Pick<AuthConfig, "publicUrl">,
  ) {}

  @Get("house/:id")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "public, max-age=300")
  async house(@Param("id") id: string, @Query("lang") lang?: string): Promise<string> {
    return sharePage(await this.find(id), this.config.publicUrl, lang === "fr" ? "fr" : "en");
  }

  // The house, if it's one the city shows (the workshop isn't drawn on it, so there'd be nothing to land on).
  private async find(id: string): Promise<SharedHouse | null> {
    if (id.length > 60) return null;
    const [h] = await this.db.select().from(houses).where(eq(houses.id, id));
    if (!h || h.tutorial) return null;
    const rs = await this.db.select().from(rooms).where(eq(rooms.houseId, id)).orderBy(asc(rooms.name));
    return { id: h.id, name: h.name, city: h.city, rooms: rs.map((r) => ({ occupied: !!r.occupantId, project: r.occupantId ? r.project : null })) };
  }
}
