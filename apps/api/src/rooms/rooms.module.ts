import { Logger, Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { HousesModule } from "../houses/houses.module";
import { RoomDeployer, SECRETS } from "./room-deployer";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";
import { SecretBox } from "./secrets";

@Module({
  imports: [HousesModule, AgentsModule],
  controllers: [RoomsController],
  providers: [
    {
      provide: SECRETS,
      useFactory: () => {
        const key = process.env.COLOC_SECRETS_KEY;
        if (!key) {
          new Logger("rooms").warn("COLOC_SECRETS_KEY not set: rooms can't store secrets");
          return null;
        }
        return new SecretBox(key);
      },
    },
    RoomDeployer,
    RoomsService,
  ],
  exports: [RoomDeployer, RoomsService],
})
export class RoomsModule {}
