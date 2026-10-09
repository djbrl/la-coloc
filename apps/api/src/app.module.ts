import { Module } from "@nestjs/common";
import { AgentsModule } from "./agents/agents.module";
import { AuthModule } from "./auth/auth.module";
import { DbModule } from "./db/db.module";
import { DemoModule } from "./demo/demo.module";
import { DoorbellModule } from "./doorbell/doorbell.module";
import { GithubClientModule } from "./github/github-client.module";
import { GithubModule } from "./github/github.module";
import { RoomsModule } from "./rooms/rooms.module";
import { HousesModule } from "./houses/houses.module";
import { LobbyModule } from "./lobby/lobby.module";
import { TutorialModule } from "./tutorial/tutorial.module";

@Module({ imports: [DbModule, AuthModule, HousesModule, AgentsModule, DoorbellModule, GithubClientModule, RoomsModule, GithubModule, LobbyModule, TutorialModule, DemoModule] })
export class AppModule {}
