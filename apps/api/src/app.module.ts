import { Module } from "@nestjs/common";
import { AgentsModule } from "./agents/agents.module";
import { HousesModule } from "./houses/houses.module";

@Module({ imports: [HousesModule, AgentsModule] })
export class AppModule {}
