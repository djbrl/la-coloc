import { Module } from "@nestjs/common";
import { HousesModule } from "../houses/houses.module";
import { CreditController, PAYMENTS } from "./credit.controller";
import { CreditService } from "./credit.service";
import { loadPayments } from "./payments";

@Module({
  // A top-up pays any rent someone was short of (HousesService.rentCollector).
  imports: [HousesModule],
  controllers: [CreditController],
  providers: [
    CreditService,
    // PayDunya or Paxity when their keys are set (credit/payments.ts), nothing otherwise.
    { provide: PAYMENTS, useFactory: () => loadPayments() },
  ],
})
export class CreditModule {}
