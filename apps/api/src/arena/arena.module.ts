import { Module } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { HousesModule } from "../houses/houses.module";
import { ArenaController } from "./arena.controller";
import { ArenaService } from "./arena.service";

// The Arena. Its chat room, live updates and news under the bell go through the chat's service; the houses' stream
// redraws the Arena tag on a player's house. GitHub's webhooks reach it through the GitHub module, which imports this
// one.
@Module({
  imports: [ChatModule, HousesModule],
  controllers: [ArenaController],
  providers: [ArenaService],
  exports: [ArenaService],
})
export class ArenaModule {}
