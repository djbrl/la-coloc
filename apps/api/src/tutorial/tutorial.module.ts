import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { GithubModule } from "../github/github.module";
import { HousesModule } from "../houses/houses.module";
import { RoomsModule } from "../rooms/rooms.module";
import { TutorialController } from "./tutorial.controller";
import { loadTutorialSample, TUTORIAL_SAMPLE, TutorialService } from "./tutorial.service";

@Module({
  imports: [HousesModule, AgentsModule, RoomsModule, GithubModule],
  controllers: [TutorialController],
  providers: [{ provide: TUTORIAL_SAMPLE, useFactory: () => loadTutorialSample() }, TutorialService],
})
export class TutorialModule {}
