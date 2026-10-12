import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Core, CoreDownError } from "./core";

const ANY_TIME = "coloc:answers-even-when-the-core-is-down";
/** Marks a route that must answer even before the database is ready (only /api/health). */
export const AnyTime = () => SetMetadata(ANY_TIME, true);

/**
 * The gate at the door of every route. Until the database has answered and the schema is up to date, nobody gets
 * in (they get the calm 503 instead): our code assumes the schema is there. After that it always lets people
 * through, even during a later outage: those requests just try the database and fail into the same 503.
 */
@Injectable()
export class CoreGate implements CanActivate {
  constructor(
    @Inject(Core) private readonly core: Core,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.core.ready) return true;
    if (this.reflector.getAllAndOverride<boolean>(ANY_TIME, [context.getHandler(), context.getClass()])) return true;
    throw new CoreDownError();
  }
}
