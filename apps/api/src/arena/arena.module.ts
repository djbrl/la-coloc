import { Module } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { ArenaController } from "./arena.controller";
import { ArenaService } from "./arena.service";

// The Arena. Its chat room and live updates go through the chat's service; GitHub's webhooks reach it through the
// GitHub module, which imports this one.
@Module({
  imports: [ChatModule],
  controllers: [ArenaController],
  providers: [ArenaService],
  exports: [ArenaService],
})
export class ArenaModule {}
