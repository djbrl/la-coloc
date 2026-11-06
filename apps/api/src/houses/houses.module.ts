import { Module, forwardRef } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { CityController, HousesController } from "./houses.controller";
import { HousesService } from "./houses.service";
import { Landlord } from "./landlord";
import { LeasesController } from "./leases.controller";
import { LeasesService } from "./leases.service";

@Module({
  imports: [forwardRef(() => AgentsModule)],
  controllers: [HousesController, CityController, LeasesController],
  providers: [HousesService, LeasesService, { provide: Landlord, inject: [HousesService], useFactory: (houses: HousesService) => new Landlord(houses) }],
  exports: [HousesService, LeasesService, Landlord],
})
export class HousesModule {}
