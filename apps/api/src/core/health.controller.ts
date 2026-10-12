import { Controller, Get, Inject } from "@nestjs/common";
import { Core, CoreDownError } from "./core";
import { AnyTime } from "./core.guard";

// "Is the city's core alive?" The website asks this while it waits for the core to come back. No login, and it
// answers even while the database is down or still migrating (that's the whole point).
@Controller("health")
@AnyTime()
export class HealthController {
  constructor(@Inject(Core) private readonly core: Core) {}

  @Get()
  async health() {
    // Throwing the "core down" error gives the same 503 body as every other route.
    if (!(await this.core.check())) throw new CoreDownError();
    return { ok: true };
  }
}
