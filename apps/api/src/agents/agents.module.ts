import { Module, forwardRef } from "@nestjs/common";
import { HousesModule } from "../houses/houses.module";
import { AgentRegistry } from "./agent.registry";
import { AgentsGateway } from "./agents.gateway";
import { LogsBroker } from "./logs.broker";

@Module({
  imports: [forwardRef(() => HousesModule)],
  providers: [AgentRegistry, AgentsGateway, LogsBroker],
  exports: [AgentRegistry, LogsBroker],
})
export class AgentsModule {}
