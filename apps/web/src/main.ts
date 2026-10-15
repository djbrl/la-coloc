import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import ApplicationPage from "./pages/ApplicationPage.vue";
import CityPage from "./pages/CityPage.vue";
import HousePage from "./pages/HousePage.vue";
import LoginPage from "./pages/LoginPage.vue";
import RoomPage from "./pages/RoomPage.vue";
import { listWords } from "./components/list/words";
import { installCoreFetch, onRecovered } from "./core";
// The language (English or French) is chosen before anything draws, and <html lang> follows it (i18n.ts).
import "./i18n";
import { loadMe } from "./session";
// The display face and the monospace, self-hosted (fonts.css says which files and why), then the tokens.
import "./fonts.css";
import "./style.css";

// Every same-origin /api request now tells the core store whether the API answered (core.ts), and the card on top of
// the page (CoreStatus.vue) says so when it didn't. Installed before anything fetches.
installCoreFetch();

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: CityPage, meta: { fullscreen: true } },
    { path: "/houses/:id", component: HousePage, props: true },
    { path: "/houses/:id/rooms/:room", component: RoomPage, props: true },
    { path: "/applications/:id", component: ApplicationPage, props: true },
    { path: "/login", component: LoginPage },
    // The style guide (every shared piece in day and night, made-up data, no API), in development builds only:
    // the bundler drops this branch, and the page with it, from a production build.
    ...(import.meta.env.DEV ? [{ path: "/styleguide", component: () => import("./pages/StyleGuide.vue") }] : []),
  ],
  scrollBehavior: () => ({ top: 0 }),
});

// The tab's title says where you are: "Log in · La Coloc", "Sacré-Cœur, Dakar · La Coloc". The lobby keeps its own
// up to date while it's open (LobbyView.vue); a house or room page gets its house's name once it has been fetched.
router.afterEach(async (to, from) => {
  // A change of query alone (the lobby noting its city or the place open in it) keeps the lobby's own title.
  if (to.path === from.path && from.matched.length) return;
  const title = (where: string) => (document.title = `${where} · La Coloc`);
  if (to.path === "/") document.title = "La Coloc";
  else if (to.path === "/login") title(listWords.titles.login);
  else if (to.path.startsWith("/applications/")) title(listWords.titles.knock);
  else if (to.path.startsWith("/houses/")) {
    const { id, room } = to.params as { id?: string; room?: string };
    title(room ?? listWords.titles.house);
    const res = await fetch(`/api/houses/${encodeURIComponent(id ?? "")}`).catch(() => null);
    const house: { name: string; city: string } | null = res?.ok ? await res.json() : null;
    // Only if we're still there: a quick click elsewhere wins.
    if (house && router.currentRoute.value.fullPath === to.fullPath) title(room ? `${room}, ${house.name}` : `${house.name}, ${house.city}`);
  }
});

loadMe();
// Whoever you are is asked again the moment the core is back, whether the page opened on an outage or it fell later.
onRecovered(() => void loadMe());
createApp(App).use(router).mount("#app");
