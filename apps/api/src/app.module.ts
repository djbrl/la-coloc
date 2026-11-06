import { Module } from "@nestjs/common";
import { AccountModule } from "./account/account.module";
import { AgentsModule } from "./agents/agents.module";
import { ArenaModule } from "./arena/arena.module";
import { ChatModule } from "./chat/chat.module";
import { AuthModule } from "./auth/auth.module";
import { CoreModule } from "./core/core.module";
import { CreditModule } from "./credit/credit.module";
import { DbModule } from "./db/db.module";
import { DemoModule } from "./demo/demo.module";
import { DoorbellModule } from "./doorbell/doorbell.module";
import { FriendsModule } from "./friends/friends.module";
import { GithubClientModule } from "./github/github-client.module";
import { GithubModule } from "./github/github.module";
import { GithubReposModule } from "./github/repos.module";
import { RoomsModule } from "./rooms/rooms.module";
import { HousesModule } from "./houses/houses.module";
import { LobbyModule } from "./lobby/lobby.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ShareModule } from "./share/share.module";
import { SshModule } from "./ssh/ssh.module";
import { TutorialModule } from "./tutorial/tutorial.module";

@Module({ imports: [DbModule, CoreModule, AuthModule, HousesModule, AgentsModule, DoorbellModule, GithubClientModule, RoomsModule, GithubModule, GithubReposModule, NotificationsModule, ChatModule, ArenaModule, LobbyModule, FriendsModule, TutorialModule, DemoModule, ShareModule, SshModule, CreditModule, AccountModule] })
export class AppModule {}
