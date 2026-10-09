import { Module } from "@nestjs/common";
import { AgentsModule } from "./agents/agents.module";
import { AuthModule } from "./auth/auth.module";
import { DbModule } from "./db/db.module";
import { DoorbellModule } from "./doorbell/doorbell.module";
import { HousesModule } from "./houses/houses.module";

@Module({ imports: [DbModule, AuthModule, HousesModule, AgentsModule, DoorbellModule] })
export class AppModule {}
