import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { ArenaModule } from "../arena/arena.module";
import { HousesModule } from "../houses/houses.module";
import { RoomsModule } from "../rooms/rooms.module";
import { ChoresService } from "./chores.service";
import { DeploysService } from "./deploys.service";
import { GithubController } from "./github.controller";

@Module({
  imports: [HousesModule, AgentsModule, RoomsModule, ArenaModule],
  controllers: [GithubController],
  providers: [
    ChoresService,
    DeploysService,
  ],
})
export class GithubModule {}
