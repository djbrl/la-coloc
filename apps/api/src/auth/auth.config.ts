// Login settings, all from the environment.
export interface AuthConfig {
  // Where the website lives, as the browser sees it. GitHub sends people back here after login.
  publicUrl: string;
  // Pages allowed to open the lobby's WebSocket: the public URL's origin, plus any in COLOC_WEB_ORIGIN (a comma
  // list), so the site on Vercel and a laptop's own dev server can both connect.
  origins: string[];
  // Development (COLOC_DEV_ORIGINS=1, set by scripts/up.mjs): any page on this machine, whatever its port.
  devOrigins: boolean;
  github: { clientId: string; clientSecret: string } | null;
  // Development only: log in as anyone, no GitHub needed. Never on a site served over https (a shared or real one),
  // whatever the environment says: there, it would let anyone on the internet be anyone.
  devLogin: boolean;
  secureCookies: boolean;
  // Demo servers only: a button puts the whole city back to the seed (COLOC_DEMO_RESET=1).
  demoReset: boolean;
  // Who may press it: GitHub logins, from COLOC_ADMINS (a comma list). With the dev login on and no list given,
  // the seeded "jib" and Jib's GitHub login "Djbrl"; otherwise nobody.
  admins: string[];
}

// Is this login one of the admins? Logins are compared without case, as GitHub does.
export function isAdmin(config: AuthConfig, login: string | null | undefined): boolean {
  return !!login && config.admins.some((a) => a.toLowerCase() === login.toLowerCase());
}

export function loadAuthConfig(env = process.env): AuthConfig {
  const publicUrl = (env.COLOC_PUBLIC_URL ?? "http://localhost:5175").replace(/\/$/, "");
  const id = env.COLOC_GITHUB_CLIENT_ID;
  const secret = env.COLOC_GITHUB_CLIENT_SECRET;
  const devLogin = env.COLOC_DEV_LOGIN === "1" && !publicUrl.startsWith("https://");
  const extra = (env.COLOC_WEB_ORIGIN ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  return {
    publicUrl,
    origins: [...new Set([new URL(publicUrl).origin, ...extra])],
    devOrigins: env.COLOC_DEV_ORIGINS === "1" && !publicUrl.startsWith("https://"),
    github: id && secret ? { clientId: id, clientSecret: secret } : null,
    devLogin,
    secureCookies: publicUrl.startsWith("https://"),
    demoReset: env.COLOC_DEMO_RESET === "1",
    admins: (env.COLOC_ADMINS ?? (devLogin ? "jib,Djbrl" : ""))
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
  };
}
