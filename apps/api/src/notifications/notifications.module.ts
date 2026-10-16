import { Module } from "@nestjs/common";
import { DoorbellModule } from "../doorbell/doorbell.module";
import { HousesModule } from "../houses/houses.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [HousesModule, DoorbellModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
