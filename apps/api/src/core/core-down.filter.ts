import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Inject, Logger } from "@nestjs/common";
import { BaseExceptionFilter, HttpAdapterHost } from "@nestjs/core";
import { Core, CORE_DOWN_BODY, isCoreDown } from "./core";

/**
 * Catches every error that escapes a route. If it means "the database can't be reached", the answer is the calm
 * 503 `core_down` (and Core is told, so it logs the outage once). Anything else is handled exactly as Nest
 * always did: validation errors keep their 400, a missing thing its 404, a real bug its 500 and stack trace.
 */
@Catch()
export class CoreDownFilter implements ExceptionFilter {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Inject(Core) private readonly core: Core,
  ) {}

  catch(error: unknown, host: ArgumentsHost) {
    // Errors that already carry a status (400, 404, ...) are deliberate: leave them alone.
    if (error instanceof HttpException || !isCoreDown(error)) {
      new BaseExceptionFilter(this.adapterHost.httpAdapter).catch(error, host);
      return;
    }
    if (host.getType() !== "http") {
      new Logger("core").warn("the database isn't answering");
      return;
    }

    this.core.reportDown(error);
    const http = this.adapterHost.httpAdapter;
    const response = host.switchToHttp().getResponse();
    // "Retry-After" tells well-behaved clients when to ask again; "no-store" keeps a cache from remembering the outage.
    http.setHeader(response, "Retry-After", "2");
    http.setHeader(response, "Cache-Control", "no-store");
    http.reply(response, CORE_DOWN_BODY, 503);
  }
}
