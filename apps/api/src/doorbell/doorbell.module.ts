import { Module } from "@nestjs/common";
import { HousesModule } from "../houses/houses.module";
import { DoorbellController } from "./doorbell.controller";
import { DoorbellService } from "./doorbell.service";

@Module({
  imports: [HousesModule],
  controllers: [DoorbellController],
  providers: [DoorbellService],
  exports: [DoorbellService],
})
export class DoorbellModule {}
