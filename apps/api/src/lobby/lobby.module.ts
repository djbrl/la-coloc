import { Module } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { LobbyController } from "./lobby.controller";
import { LobbyGateway } from "./lobby.gateway";

@Module({ imports: [NotificationsModule, ChatModule], controllers: [LobbyController], providers: [LobbyGateway] })
export class LobbyModule {}
