import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { HousesModule } from "../houses/houses.module";
import { devSeedOptions } from "../seed/city";
import { DemoController } from "./demo.controller";
import { DemoService, SEED_OPTIONS } from "./demo.service";

@Module({
  imports: [HousesModule, AgentsModule],
  controllers: [DemoController],
  // The same options `npm run dev:seed` reads, so the reset city is the seeded city.
  providers: [{ provide: SEED_OPTIONS, useFactory: () => devSeedOptions() }, DemoService],
})
export class DemoModule {}
