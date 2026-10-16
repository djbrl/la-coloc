import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { LobbyController } from "./lobby.controller";
import { LobbyGateway } from "./lobby.gateway";

@Module({ imports: [NotificationsModule], controllers: [LobbyController], providers: [LobbyGateway] })
export class LobbyModule {}
