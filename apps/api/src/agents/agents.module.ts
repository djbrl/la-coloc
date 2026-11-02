import { Module, forwardRef } from "@nestjs/common";
import { HousesModule } from "../houses/houses.module";
import { AgentRegistry } from "./agent.registry";
import { AgentsGateway } from "./agents.gateway";
import { LogsBroker } from "./logs.broker";
import { ShellBroker } from "./shell.broker";

@Module({
  imports: [forwardRef(() => HousesModule)],
  providers: [AgentRegistry, AgentsGateway, LogsBroker, ShellBroker],
  exports: [AgentRegistry, LogsBroker, ShellBroker],
})
export class AgentsModule {}
