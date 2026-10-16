declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  // Where the lobby's WebSocket lives when the site and the API are on different hosts (the site on Vercel, the API
  // behind a tunnel), e.g. "wss://abc.trycloudflare.com/lobby-ws". Unset: the same host as the page.
  readonly VITE_LOBBY_WS?: string;
}
