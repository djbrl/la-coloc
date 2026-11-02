import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { AuthModule } from "../auth/auth.module";
import { SshController } from "./ssh.controller";
import { SshGateway } from "./ssh.gateway";
import { SshService } from "./ssh.service";

@Module({
  imports: [AgentsModule, AuthModule],
  controllers: [SshController],
  providers: [SshService, SshGateway],
  exports: [SshService],
})
export class SshModule {}
