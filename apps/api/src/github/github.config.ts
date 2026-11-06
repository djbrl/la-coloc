// The coloc GitHub App's keys, all from the environment. Without them the GitHub side stays switched off.
import { readFileSync } from "node:fs";

export interface GithubAppConfig {
  appId: string;
  // PEM. Environments often store it with literal "\n": those are turned back into newlines.
  privateKey: string;
  webhookSecret: string;
  // The App's name in its GitHub address (github.com/apps/<slug>), for the "install it on your repo" link.
  slug?: string;
}

/** Where someone installs the App on their repos (or reinstalls it), when this server has one. */
export function appInstallUrl(cfg: Pick<GithubAppConfig, "slug"> | null | undefined): string | null {
  return cfg?.slug ? `https://github.com/apps/${cfg.slug}/installations/new` : null;
}

/** The same, from the environment, for parts of the API that don't hold the App's keys. */
export const envInstallUrl = (env = process.env) => (env.COLOC_GITHUB_APP_ID ? appInstallUrl({ slug: env.COLOC_GITHUB_APP_SLUG || undefined }) : null);

export function loadGithubAppConfig(env = process.env): GithubAppConfig | null {
  const appId = env.COLOC_GITHUB_APP_ID;
  // The key itself, or (development) the path of the .pem file scripts/github-app.mjs wrote.
  const privateKey =
    env.COLOC_GITHUB_PRIVATE_KEY?.replace(/\\n/g, "\n") ??
    (env.COLOC_GITHUB_PRIVATE_KEY_FILE ? readFileSync(env.COLOC_GITHUB_PRIVATE_KEY_FILE, "utf8") : undefined);
  const webhookSecret = env.COLOC_GITHUB_WEBHOOK_SECRET;
  const slug = env.COLOC_GITHUB_APP_SLUG || undefined;
  return appId && privateKey && webhookSecret ? { appId, privateKey, webhookSecret, slug } : null;
}
