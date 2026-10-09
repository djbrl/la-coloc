import { Global, Logger, Module } from "@nestjs/common";
import { loadAuthConfig } from "./auth.config";
import { AuthController } from "./auth.controller";
import { AUTH_CONFIG, AuthService } from "./auth.service";
import { MembershipsService } from "./memberships.service";

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_CONFIG,
      useFactory: () => {
        const cfg = loadAuthConfig();
        const log = new Logger("auth");
        if (cfg.devLogin) log.warn("COLOC_DEV_LOGIN=1: anyone can log in as anyone. Development only.");
        if (!cfg.github) log.log("GitHub login not configured (COLOC_GITHUB_CLIENT_ID / COLOC_GITHUB_CLIENT_SECRET)");
        return cfg;
      },
    },
    AuthService,
    MembershipsService,
  ],
  exports: [AuthService, MembershipsService],
})
export class AuthModule {}
