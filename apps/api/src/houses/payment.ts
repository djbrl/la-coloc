// The one door money goes through. A simulation for now: it always succeeds and moves nothing, and the screens say so.
// A real provider (Wave, Orange Money...) replaces the inside of this function; nothing around it has to change.
export interface Payment {
  amount: number;
  operator: string;
  // What the payment is for, as it would show on a statement.
  reference: string;
}

export async function takePayment(payment: Payment): Promise<{ reference: string; simulated: true }> {
  return { reference: payment.reference, simulated: true };
}
