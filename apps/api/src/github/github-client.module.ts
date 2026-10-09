import { Global, Logger, Module } from "@nestjs/common";
import { GITHUB_CLIENT } from "./chores.service";
import { GithubAppClient } from "./github.client";
import { loadGithubAppConfig } from "./github.config";
import { GITHUB_CONFIG } from "./github.controller";

// The GitHub App's keys and client, for anyone who needs to talk to GitHub (chores, deploys, rooms).
// Both are null when the App isn't configured.
@Global()
@Module({
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
  ],
  exports: [GITHUB_CONFIG, GITHUB_CLIENT],
})
export class GithubClientModule {}
