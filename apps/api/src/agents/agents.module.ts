import { Module, forwardRef } from "@nestjs/common";
import { HousesModule } from "../houses/houses.module";
import { AgentRegistry } from "./agent.registry";
import { AgentsGateway } from "./agents.gateway";

@Module({
  imports: [forwardRef(() => HousesModule)],
  providers: [AgentRegistry, AgentsGateway],
  exports: [AgentRegistry],
})
export class AgentsModule {}
