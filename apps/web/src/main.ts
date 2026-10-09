import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import ApplicationPage from "./pages/ApplicationPage.vue";
import CityPage from "./pages/CityPage.vue";
import HousePage from "./pages/HousePage.vue";
import LoginPage from "./pages/LoginPage.vue";
import RoomPage from "./pages/RoomPage.vue";
import { loadMe } from "./session";
import "./style.css";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: CityPage },
    { path: "/houses/:id", component: HousePage, props: true },
    { path: "/houses/:id/rooms/:room", component: RoomPage, props: true },
    { path: "/applications/:id", component: ApplicationPage, props: true },
    { path: "/login", component: LoginPage },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

loadMe();
createApp(App).use(router).mount("#app");
