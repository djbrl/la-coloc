import { Module } from "@nestjs/common";
import { HousesModule } from "../houses/houses.module";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";

// Deleting your account, and removing the GitHub App from your repos.
@Module({
  imports: [HousesModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
