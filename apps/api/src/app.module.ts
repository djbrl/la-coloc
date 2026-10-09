import { Module } from "@nestjs/common";
import { AgentsModule } from "./agents/agents.module";
import { AuthModule } from "./auth/auth.module";
import { DbModule } from "./db/db.module";
import { DoorbellModule } from "./doorbell/doorbell.module";
import { GithubClientModule } from "./github/github-client.module";
import { GithubModule } from "./github/github.module";
import { RoomsModule } from "./rooms/rooms.module";
import { HousesModule } from "./houses/houses.module";

@Module({ imports: [DbModule, AuthModule, HousesModule, AgentsModule, DoorbellModule, GithubClientModule, RoomsModule, GithubModule] })
export class AppModule {}
