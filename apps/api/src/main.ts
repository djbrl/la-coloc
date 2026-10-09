import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";
import { AppModule } from "./app.module";

async function bootstrap() {
  // rawBody: GitHub webhooks are signed over the exact bytes sent, so we keep them.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // Agents connect over plain WebSockets (the `ws` library), not socket.io.
  app.useWebSocketAdapter(new WsAdapter(app));
  app.setGlobalPrefix("api");
  app.enableCors({ origin: process.env.COLOC_WEB_ORIGIN ?? "http://localhost:5173" });
  const port = Number(process.env.PORT ?? 4100);
  // No login yet (GitHub OAuth lands in week 2), so only listen locally by default.
  const host = process.env.HOST ?? "127.0.0.1";
  await app.listen(port, host);
  console.log(`[api] http://${host}:${port}/api · agents on ws://${host}:${port}/agent`);
}

bootstrap();
