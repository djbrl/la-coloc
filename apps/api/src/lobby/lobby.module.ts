import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { LobbyGateway } from "./lobby.gateway";

@Module({ imports: [NotificationsModule], providers: [LobbyGateway] })
export class LobbyModule {}
