import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import HousePage from "./pages/HousePage.vue";
import "./style.css";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/houses/sacre-coeur" },
    { path: "/houses/:id", component: HousePage, props: true },
  ],
});

createApp(App).use(router).mount("#app");
