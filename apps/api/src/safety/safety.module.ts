import { Module } from "@nestjs/common";
import { HousesModule } from "../houses/houses.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SafetyController } from "./safety.controller";
import { SafetyService } from "./safety.service";

@Module({ imports: [HousesModule, NotificationsModule], controllers: [SafetyController], providers: [SafetyService], exports: [SafetyService] })
export class SafetyModule {}
