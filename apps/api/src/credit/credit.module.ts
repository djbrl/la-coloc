import { Module } from "@nestjs/common";
import { HousesModule } from "../houses/houses.module";
import { CreditController, PAYDUNYA } from "./credit.controller";
import { CreditService } from "./credit.service";
import { loadPaydunyaConfig, Paydunya } from "./paydunya";

@Module({
  // A top-up pays any rent someone was short of (HousesService.rentCollector).
  imports: [HousesModule],
  controllers: [CreditController],
  providers: [
    CreditService,
    // PayDunya when its keys are set (credit/paydunya.ts), nothing otherwise.
    { provide: PAYDUNYA, useFactory: () => { const config = loadPaydunyaConfig(); return config ? new Paydunya(config) : null; } },
  ],
})
export class CreditModule {}
