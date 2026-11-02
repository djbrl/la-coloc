import { Module } from "@nestjs/common";
import { HousesModule } from "../houses/houses.module";
import { RoomsModule } from "../rooms/rooms.module";
import { GithubReposController } from "./repos.controller";
import { GithubRepos } from "./repos.service";

// A person's GitHub repos, for the rooms and the quest alike.
@Module({
  imports: [HousesModule, RoomsModule],
  controllers: [GithubReposController],
  providers: [GithubRepos],
  exports: [GithubRepos],
})
export class GithubReposModule {}
