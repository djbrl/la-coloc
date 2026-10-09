import { Module, forwardRef } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { CityController, HousesController } from "./houses.controller";
import { HousesService } from "./houses.service";

@Module({
  imports: [forwardRef(() => AgentsModule)],
  controllers: [HousesController, CityController],
  providers: [HousesService],
  exports: [HousesService],
})
export class HousesModule {}
