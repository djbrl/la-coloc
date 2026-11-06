import { Module } from "@nestjs/common";
import { LobbyModule } from "../lobby/lobby.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { FriendsController } from "./friends.controller";
import { FriendsService } from "./friends.service";

@Module({ imports: [LobbyModule, NotificationsModule], controllers: [FriendsController], providers: [FriendsService] })
export class FriendsModule {}
