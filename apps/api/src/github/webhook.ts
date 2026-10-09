// GitHub signs every webhook with the secret we gave it. Anything unsigned or wrongly signed is not from GitHub.
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(secret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "hex");
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
