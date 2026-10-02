import { Injectable } from "@nestjs/common";
import type { DeployKind, DeployStatus, RoomEvent, Usage } from "@coloc/protocol";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { Subject } from "rxjs";
import { noteForDeploy, noteForRoomEvent } from "./fridge";
import type { Deployment, FridgeNote, House, Room } from "./house.types";

// In-memory for the week-1 slice. The Postgres version keeps the same method signatures.
@Injectable()
export class HousesService {
  private houses = new Map<string, House>();
  // Pings the house page whenever something changes (server-sent events).
  readonly changes = new Subject<string>();

  constructor() {
    this.seedDevHouse();
  }

  private seedDevHouse() {
    const id = process.env.COLOC_DEV_HOUSE_ID ?? "sacre-coeur";
    const rooms: Room[] = [
      { name: "jib", flatmate: "Jib", limits: { memoryMb: 256, cpus: 0.5 }, status: "empty" },
      { name: "awa", flatmate: "Awa", limits: { memoryMb: 256, cpus: 0.5 }, status: "empty" },
      { name: "moussa", flatmate: "Moussa", limits: { memoryMb: 128, cpus: 0.5 }, status: "empty" },
    ];
    this.houses.set(id, {
      id,
      name: "Coloc Sacré-Cœur",
      domain: process.env.COLOC_DEV_HOUSE_DOMAIN ?? "coloc.localhost",
      agentSecret: process.env.COLOC_DEV_AGENT_SECRET ?? "dev-secret-change-me",
      rooms: new Map(rooms.map((r) => [r.name, r])),
      deployments: [],
      notes: [],
      agentOnline: false,
    });
  }

  get(id: string): House | undefined {
    return this.houses.get(id);
  }

  // Constant-time comparison, so the secret can't be guessed byte by byte from response times.
  verifyAgentSecret(houseId: string, secret: string): boolean {
    const house = this.houses.get(houseId);
    if (!house) return false;
    const a = createHash("sha256").update(secret).digest();
    const b = createHash("sha256").update(house.agentSecret).digest();
    return timingSafeEqual(a, b);
  }

  setAgentOnline(houseId: string, online: boolean) {
    const house = this.houses.get(houseId);
    if (!house) return;
    house.agentOnline = online;
    this.changes.next(houseId);
  }

  createDeployment(houseId: string, room: string, kind: DeployKind, repo: string, ref: string): Deployment {
    const house = this.mustGet(houseId);
    const now = new Date().toISOString();
    const d: Deployment = { id: randomUUID().slice(0, 8), room, kind, repo: redactToken(repo), ref, status: "queued", createdAt: now, updatedAt: now };
    house.deployments.unshift(d);
    house.deployments.length = Math.min(house.deployments.length, 50);
    const r = house.rooms.get(room);
    if (r && kind === "prod") {
      r.status = r.status === "live" ? "live" : "deploying";
      r.lastDeployId = d.id;
    }
    this.changes.next(houseId);
    return d;
  }

  recordDeployStatus(houseId: string, s: DeployStatus) {
    const house = this.mustGet(houseId);
    const d = house.deployments.find((x) => x.id === s.deployId);
    if (d) {
      d.status = s.status;
      d.detail = s.detail;
      d.updatedAt = new Date().toISOString();
    }
    const room = house.rooms.get(s.room);
    if (room && d?.kind === "prod") {
      if (s.status === "live") {
        room.status = "live";
        room.url = s.url;
      } else if (s.status === "failed" && room.status !== "live") {
        room.status = "failed";
      }
    }
    const note = room ? noteForDeploy(s, room.flatmate) : null;
    if (note) this.addNote(house, note);
    this.changes.next(houseId);
  }

  recordUsage(houseId: string, u: Usage) {
    const house = this.mustGet(houseId);
    for (const s of u.samples) {
      const room = house.rooms.get(s.room);
      if (room) room.usage = { cpuPercent: s.cpuPercent, memoryBytes: s.memoryBytes, memoryLimitBytes: s.memoryLimitBytes, at: u.at };
    }
    this.changes.next(houseId);
  }

  recordRoomEvent(houseId: string, e: RoomEvent) {
    const house = this.mustGet(houseId);
    const room = house.rooms.get(e.room);
    if (!room) return;
    if (e.event === "crashed") room.status = "down";
    if (e.event === "restarted" && room.url) room.status = "live";
    this.addNote(house, noteForRoomEvent(e, room.flatmate));
    this.changes.next(houseId);
  }

  // What the house page shows. Never includes the agent secret.
  view(houseId: string) {
    const h = this.mustGet(houseId);
    return {
      id: h.id,
      name: h.name,
      domain: h.domain,
      agentOnline: h.agentOnline,
      rooms: [...h.rooms.values()],
      deployments: h.deployments.slice(0, 20),
      notes: h.notes.slice(0, 20),
    };
  }

  private addNote(house: House, draft: Omit<FridgeNote, "id" | "at">) {
    house.notes.unshift({ ...draft, id: randomUUID().slice(0, 8), at: new Date().toISOString() });
    house.notes.length = Math.min(house.notes.length, 100);
  }

  private mustGet(id: string): House {
    const h = this.houses.get(id);
    if (!h) throw new Error(`unknown house ${id}`);
    return h;
  }
}

// Repo URLs may carry a GitHub token; never store or show it.
export function redactToken(url: string): string {
  return url.replace(/(https:\/\/)[^@\/\s]+@/, "$1***@");
}
