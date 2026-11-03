import { Module } from "@nestjs/common";
import { CreditController, PAYDUNYA } from "./credit.controller";
import { CreditService } from "./credit.service";
import { loadPaydunyaConfig, Paydunya } from "./paydunya";

@Module({
  controllers: [CreditController],
  providers: [
    CreditService,
    // PayDunya when its keys are set (credit/paydunya.ts), nothing otherwise.
    { provide: PAYDUNYA, useFactory: () => { const config = loadPaydunyaConfig(); return config ? new Paydunya(config) : null; } },
  ],
})
export class CreditModule {}
