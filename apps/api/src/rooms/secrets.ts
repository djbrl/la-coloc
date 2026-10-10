// A room's secrets are encrypted with AES-256-GCM before they touch the database: a stolen database (or backup)
// doesn't leak anyone's API keys. The key comes from COLOC_SECRETS_KEY and lives only in the API's environment.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Shell-style names. PORT is ours: the room's port comes from its settings. So are the COLOC_ ones: they tell the
// app where it lives (see RoomDeployer.context).
export const SECRET_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;
export const RESERVED = new Set(["PORT", "COLOC_ROOM", "COLOC_HOUSE", "COLOC_CITY", "COLOC_COUNTRY", "COLOC_LOGIN", "COLOC_NAME"]);
export const MAX_SECRET_BYTES = 4096;
export const MAX_SECRETS = 50;

export class SecretBox {
  private key: Buffer;

  constructor(keyBase64: string) {
    this.key = Buffer.from(keyBase64, "base64");
    if (this.key.length !== 32) throw new Error("COLOC_SECRETS_KEY must be 32 bytes, base64-encoded");
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
  }

  decrypt(sealed: string): string {
    const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }
}

export function checkSecret(name: string, value: string): string | null {
  if (!SECRET_NAME.test(name)) return "Names are capitals, digits and underscores, like STRIPE_KEY.";
  if (RESERVED.has(name)) return `${name} is set by La Coloc from the room's settings.`;
  if (Buffer.byteLength(value, "utf8") > MAX_SECRET_BYTES) return `Keep it under ${MAX_SECRET_BYTES} bytes.`;
  return null;
}
