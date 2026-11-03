// The lobby's sheet has one back key, on its band (Inside.vue). A page with steps of its own (a room's part, opened from
// its menu) lends it a step back while it's on one: the band's key, and Esc, then go back a step before leaving the page.
import type { InjectionKey, ShallowRef } from "vue";

export const sheetStep: InjectionKey<ShallowRef<(() => void) | null>> = Symbol("sheetStep");
