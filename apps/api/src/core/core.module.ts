import { Global, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Core } from "./core";
import { CoreDownFilter } from "./core-down.filter";
import { CoreGate } from "./core.guard";
import { HealthController } from "./health.controller";

// Everything about "the database is down": the gate, the 503 answer, the health route, and the background
// retrying. Importing this module once (in AppModule) switches it all on.
@Global()
@Module({
  controllers: [HealthController],
  providers: [Core, { provide: APP_GUARD, useClass: CoreGate }, { provide: APP_FILTER, useClass: CoreDownFilter }],
  exports: [Core],
})
export class CoreModule {}
