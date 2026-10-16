import { Module } from "@nestjs/common";
import { HousesModule } from "../houses/houses.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { BoardService } from "./board.service";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  imports: [HousesModule, NotificationsModule],
  controllers: [ChatController],
  providers: [ChatService, BoardService],
  exports: [ChatService],
})
export class ChatModule {}
