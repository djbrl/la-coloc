// The landlord stands in for a hosting provider. Once a house has paid for its server, it starts that house's caretaker
// on this machine, so nobody has to find a server or paste a command. A real provider later replaces start(): buy a
// machine, and have it run install.sh with the same key.
//
// It's off unless the launcher turns it on (scripts/up.mjs), and it takes few houses: this is one laptop.
import { type ChildProcess, spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { hashSecret, HousesService } from "./houses.service";

export interface LandlordConfig {
  // The built caretaker, where to phone in, what keys are made from, how many houses this machine takes, and the
  // domain its rooms can be reached under.
  agent: string;
  apiUrl: string;
  key: string;
  max: number;
  domain: string;
}

export function loadLandlordConfig(env = process.env): LandlordConfig | null {
  const { COLOC_LANDLORD_AGENT: agent, COLOC_LANDLORD_API_URL: apiUrl, COLOC_LANDLORD_KEY: key } = env;
  if (!agent || !apiUrl || !key) return null;
  return { agent, apiUrl, key, max: Number(env.COLOC_LANDLORD_MAX ?? 3), domain: env.COLOC_LANDLORD_DOMAIN ?? "coloc.localhost" };
}

const RESTART_MS = 5_000;
// How this machine serves rooms: a caretaker needs the same answers as the launcher's own. Nothing secret.
const MACHINE_SETTINGS = ["DOCKER_HOST", "COLOC_PUBLIC_SCHEME", "COLOC_PUBLIC_PORT", "COLOC_WORKDIR", "COLOC_PROXY_CONFIG_DIR"];
const RETRY_DB_MS = 10_000;
const RETIRE_MS = 30_000;

@Injectable()
export class Landlord implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("Landlord");
  private readonly running = new Map<string, ChildProcess>();
  private stopping = false;
  private retry?: NodeJS.Timeout;

  constructor(
    private readonly houses: HousesService,
    readonly config: LandlordConfig | null = loadLandlordConfig(),
    private readonly launch: typeof spawn = spawn,
  ) {}

  /** Is there a machine for this house? Asked before any money moves. */
  hasRoom(houseId: string): boolean {
    return !!this.config && (this.running.has(houseId) || this.running.size < this.config.max);
  }

  /** The house's key, worked out from its id and never stored, so the landlord can restart it after a reboot. */
  secretFor(houseId: string): string {
    return createHmac("sha256", this.config!.key).update(houseId).digest("base64url");
  }

  domainFor(houseId: string): string {
    return `${houseId}.${this.config!.domain}`;
  }

  start(houseId: string, domain: string): void {
    if (!this.config || this.stopping || this.running.has(houseId)) return;
    // Only what a caretaker needs: not the API's own database password or GitHub keys.
    const child = this.launch(process.execPath, [this.config.agent], {
      stdio: "inherit",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...Object.fromEntries(MACHINE_SETTINGS.filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
        COLOC_HOUSE_ID: houseId,
        COLOC_AGENT_SECRET: this.secretFor(houseId),
        COLOC_API_URL: this.config.apiUrl,
        COLOC_HOUSE_DOMAIN: domain,
      },
    });
    this.running.set(houseId, child);
    child.on("exit", () => {
      // Stopped on purpose: it stays stopped.
      if (this.running.get(houseId) !== child) return;
      this.running.delete(houseId);
      if (!this.stopping) setTimeout(() => this.start(houseId, domain), RESTART_MS).unref();
    });
  }

  /**
   * The house is gone: its caretaker goes too, or it would keep phoning in with a key nobody knows and hold a place on
   * this machine forever. Not at once: it's still emptying the house's rooms. If a house of that name is back by then,
   * it's the same key, so the caretaker stays.
   */
  retire(houseId: string, afterMs = RETIRE_MS): void {
    setTimeout(async () => {
      if (!(await this.houses.exists(houseId).catch(() => true))) this.stop(houseId);
    }, afterMs).unref();
  }

  stop(houseId: string): void {
    const child = this.running.get(houseId);
    this.running.delete(houseId);
    child?.kill();
  }

  /** Back after a restart: every house whose key is one of ours gets its caretaker again. The database may not be up yet. */
  async onModuleInit(): Promise<void> {
    if (!this.config) return;
    try {
      for (const h of await this.houses.keyedHouses()) {
        if (h.agentSecretHash === hashSecret(this.secretFor(h.id))) this.start(h.id, h.domain);
      }
    } catch {
      this.retry = setTimeout(() => void this.onModuleInit(), RETRY_DB_MS);
      this.retry.unref();
    }
  }

  onModuleDestroy(): void {
    this.stopping = true;
    clearTimeout(this.retry);
    for (const child of this.running.values()) child.kill();
  }
}
