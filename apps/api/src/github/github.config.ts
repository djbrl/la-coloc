// The coloc GitHub App's keys, all from the environment. Without them the GitHub side stays switched off.
export interface GithubAppConfig {
  appId: string;
  // PEM. Environments often store it with literal "\n": those are turned back into newlines.
  privateKey: string;
  webhookSecret: string;
}

export function loadGithubAppConfig(env = process.env): GithubAppConfig | null {
  const appId = env.COLOC_GITHUB_APP_ID;
  const privateKey = env.COLOC_GITHUB_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const webhookSecret = env.COLOC_GITHUB_WEBHOOK_SECRET;
  return appId && privateKey && webhookSecret ? { appId, privateKey, webhookSecret } : null;
}
