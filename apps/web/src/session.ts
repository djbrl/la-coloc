// Who's logged in, shared by every page. The session itself is an HttpOnly cookie the page never sees.
import { ref } from "vue";
import type { Me } from "./types";

export const me = ref<Me | null>(null);
export const meLoaded = ref(false);

export async function loadMe(): Promise<void> {
  try {
    const res = await fetch("/api/me");
    me.value = res.ok ? (await res.json()).user : null;
  } catch {
    me.value = null;
  } finally {
    meLoaded.value = true;
  }
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  me.value = null;
}

// POSTs JSON. The API only accepts JSON bodies, which other sites can't send with your cookies.
export async function postJSON<T = unknown>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data: data as T };
  const message = typeof data.message === "string" ? data.message : res.status === 401 ? "Log in first." : "That didn't work.";
  return { ok: false, message };
}
