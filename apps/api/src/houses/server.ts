// Renting a house's server: the sizes on offer, and the one command the chef pastes on it.
import type { HousePlan } from "@coloc/db";

// What each size costs per month, in whole FCFA. Split between the flatmates at month end.
export const PLAN_COST_FCFA: Record<HousePlan, number> = {
  small: 7_000,
  medium: 12_000,
  large: 22_000,
};

// "https://coloc.dev" → "wss://coloc.dev/agent": where the house's agent phones in.
// http becomes ws and https becomes wss; the agent only accepts plain ws:// to localhost.
export function agentUrl(publicUrl: string): string {
  const url = new URL(publicUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/agent";
  url.search = "";
  url.hash = "";
  return url.toString();
}

/**
 * The one line the chef runs as root on a fresh server. It fetches install.sh from the website and
 * hands it the house's id, its agent secret, where to phone in, and the domain its rooms live under.
 * The web page can call this with a placeholder ("<your key>") in place of the secret.
 */
export function installCommand(houseId: string, secret: string, publicUrl: string, houseDomain: string): string {
  const site = publicUrl.replace(/\/$/, "");
  return (
    `curl -fsSL ${site}/install.sh | sudo ` +
    `COLOC_HOUSE_ID=${houseId} COLOC_AGENT_SECRET=${secret} COLOC_API_URL=${agentUrl(site)} COLOC_HOUSE_DOMAIN=${houseDomain} sh`
  );
}
