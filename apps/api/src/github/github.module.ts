import { Logger, Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { HousesModule } from "../houses/houses.module";
import { ChoresService, GITHUB_CLIENT } from "./chores.service";
import { DeploysService } from "./deploys.service";
import { GithubAppClient } from "./github.client";
import { loadGithubAppConfig } from "./github.config";
import { GITHUB_CONFIG, GithubController } from "./github.controller";

@Module({
  imports: [HousesModule, AgentsModule],
  controllers: [GithubController],
  providers: [
    {
      provide: GITHUB_CONFIG,
      useFactory: () => {
        const cfg = loadGithubAppConfig();
        if (!cfg) new Logger("github").log("GitHub App not configured (COLOC_GITHUB_APP_ID / _PRIVATE_KEY / _WEBHOOK_SECRET): chores stay off");
        return cfg;
      },
    },
    { provide: GITHUB_CLIENT, useFactory: (cfg) => (cfg ? new GithubAppClient(cfg) : null), inject: [GITHUB_CONFIG] },
    ChoresService,
    DeploysService,
  ],
})
export class GithubModule {}
