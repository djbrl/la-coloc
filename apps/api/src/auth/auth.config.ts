// Login settings, all from the environment.
export interface AuthConfig {
  // Where the website lives, as the browser sees it. GitHub sends people back here after login.
  publicUrl: string;
  github: { clientId: string; clientSecret: string } | null;
  // Development only: log in as anyone, no GitHub needed.
  devLogin: boolean;
  secureCookies: boolean;
}

export function loadAuthConfig(env = process.env): AuthConfig {
  const publicUrl = (env.COLOC_PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const id = env.COLOC_GITHUB_CLIENT_ID;
  const secret = env.COLOC_GITHUB_CLIENT_SECRET;
  return {
    publicUrl,
    github: id && secret ? { clientId: id, clientSecret: secret } : null,
    devLogin: env.COLOC_DEV_LOGIN === "1",
    secureCookies: publicUrl.startsWith("https://"),
  };
}
