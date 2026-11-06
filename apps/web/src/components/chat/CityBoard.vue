<script setup lang="ts">
// The Board tab of the city board's window: the city's small forum. The list shows each post as a dense row (its tag, its title, who and when,
// how many replies), the most recently active first; a post opens with its body and its replies under it. Logged-in
// people post (a tag, a title, a few lines) and reply; the author deletes their own. "Message" writes to the author.
// Live through the city's stream (a "board" ping, then a fetch).
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useWhenBack } from "../../core";
import { markCitySeen } from "../../cityNews";
import { boardSheet, chatSheet, openChat, report } from "../../conversations";
import { me, postJSON, sendJSON } from "../../session";
import { openStream, type Stream } from "../../stream";
import type { BoardPost, Message } from "../../types";
import Avatar from "../Avatar.vue";
import BadgeChip from "../arena/BadgeChip.vue";
import ChatPanel from "../ChatPanel.vue";
import Icon from "../lobby/house/Icon.vue";
import { noteWhen } from "../lobby/house/notes";
import ListRow from "../lobby/panel/ListRow.vue";
import { BOARD_TAGS, type BoardTag, MAX_MESSAGE, MAX_POST, MAX_TITLE, stripBidi } from "./chat";
import SaidText from "./SaidText.vue";
import { chatWords as w } from "./words";

const posts = ref<BoardPost[]>([]);
const open = ref<{ post: BoardPost; replies: Message[] } | null>(null);
const composing = ref(false);
const error = ref("");
const listEl = ref<HTMLElement | null>(null);
// The open post: "Delete it?" waiting for a second press, and a report sent.
const sure = ref(false);
const reported = ref(false);
let stream: Stream | null = null;
// The newest post already marked seen.
let seen: string | null = null;

const cityUrl = (city: string) => `/api/cities/${encodeURIComponent(city)}`;

async function fetchBoard() {
  const city = chatSheet.city;
  try {
    const res = await fetch(`${cityUrl(city)}/board`);
    if (!res.ok || city !== chatSheet.city) return;
    posts.value = ((await res.json()) as { posts: BoardPost[] }).posts;
    // On screen, so seen: the Board tab's dot goes. Once per newest post, not on every fetch.
    const newest = posts.value.reduce((at, p) => (p.createdAt > at ? p.createdAt : at), "");
    if (newest !== seen) {
      seen = newest;
      void markCitySeen(city, "board");
    }
  } catch {
    // Keep what we had.
  }
}

async function fetchPost() {
  const id = boardSheet.post;
  if (!id) {
    open.value = null;
    return;
  }
  try {
    const res = await fetch(`/api/board/${encodeURIComponent(id)}`);
    if (id !== boardSheet.post) return;
    // Gone (deleted, or its author blocked): back to the list.
    if (res.status === 404) {
      boardSheet.post = null;
      return;
    }
    if (res.ok) open.value = await res.json();
  } catch {
    // Keep what we had.
  }
}

function refresh() {
  void fetchBoard();
  if (boardSheet.post) void fetchPost();
}

watch(
  () => chatSheet.city,
  (city) => {
    stream?.close();
    posts.value = [];
    seen = null;
    void fetchBoard();
    stream = openStream(`${cityUrl(city)}/stream`, { board: refresh });
  },
  { immediate: true },
);
watch(
  () => boardSheet.post,
  () => {
    sure.value = false;
    reported.value = false;
    error.value = "";
    void fetchPost();
  },
  { immediate: true },
);
useWhenBack(refresh);
onBeforeUnmount(() => stream?.close());

async function back() {
  boardSheet.post = null;
  composing.value = false;
  await nextTick();
  listEl.value?.querySelector<HTMLElement>("button")?.focus();
}

// ---- A new post ----
const tag = ref<BoardTag>("flatmates");
const title = ref("");
const body = ref("");
const busy = ref(false);
const titleEl = ref<HTMLInputElement | null>(null);

async function startPost() {
  composing.value = true;
  error.value = "";
  await nextTick();
  titleEl.value?.focus();
}

async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  const sent = await postJSON<{ id: string }>(`${cityUrl(chatSheet.city)}/board`, { tag: tag.value, title: title.value, body: body.value });
  busy.value = false;
  if (!sent.ok) {
    error.value = sent.message;
    return;
  }
  title.value = "";
  body.value = "";
  composing.value = false;
  await fetchBoard();
  boardSheet.post = sent.data.id;
}

// Left and right (or up and down) move the kind, and the focus with it, as in any radio group.
function kindKey(e: KeyboardEvent) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (step === undefined) return;
  e.preventDefault();
  const to = (BOARD_TAGS.indexOf(tag.value) + step + BOARD_TAGS.length) % BOARD_TAGS.length;
  tag.value = BOARD_TAGS[to];
  const group = e.currentTarget as HTMLElement;
  void nextTick(() => group.querySelectorAll<HTMLButtonElement>("[role=radio]")[to]?.focus());
}

// Ctrl or Cmd + Enter posts from the body; Enter alone is a new line there.
function bodyKey(e: KeyboardEvent) {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
}

// ---- An open post ----
const mine = computed(() => !!open.value && open.value.post.author.login === me.value?.login);

async function removePost() {
  if (!open.value) return;
  if (!sure.value) {
    sure.value = true;
    return;
  }
  const sent = await sendJSON("DELETE", `/api/board/${encodeURIComponent(open.value.post.id)}`);
  if (!sent.ok) error.value = sent.message;
  else {
    boardSheet.post = null;
    await fetchBoard();
  }
}

async function removeReply(id: string) {
  if (!open.value) return;
  const sent = await sendJSON("DELETE", `/api/board/${encodeURIComponent(open.value.post.id)}/replies/${encodeURIComponent(id)}`);
  if (!sent.ok) error.value = sent.message;
  await fetchPost();
}

async function reportPost() {
  if (!open.value) return;
  const sent = await report("post", open.value.post.id);
  if (sent.ok) reported.value = true;
  else error.value = sent.message;
}

const tagIcon: Record<BoardTag, "house" | "people" | "rocket" | "info" | "pin"> = { house: "house", flatmates: "people", project: "rocket", help: "info", other: "pin" };
const nameOf = (p: BoardPost) => p.author.name ?? p.author.login;
</script>

<template>
  <div class="board">
    <!-- Writing a post. -->
    <form v-if="composing" class="compose" novalidate @submit.prevent="submit" @keydown.esc.stop="back">
      <div class="head">
        <button type="button" class="icon-key" :aria-label="w.back" @click="back"><Icon name="back" :size="18" /></button>
        <h3>{{ w.newPost }}</h3>
      </div>
      <!-- What it's about: one row of icons on a grey rail, the chosen one in white with its word. -->
      <div class="kinds" role="radiogroup" :aria-label="w.tagName" @keydown="kindKey">
        <button
          v-for="t in BOARD_TAGS"
          :key="t"
          type="button"
          role="radio"
          class="kind"
          :aria-checked="tag === t"
          :aria-label="w.tags[t]"
          :title="w.tags[t]"
          :tabindex="tag === t ? 0 : -1"
          @click="tag = t"
        >
          <Icon :name="tagIcon[t]" :size="18" /><span v-if="tag === t" class="kind-word" aria-hidden="true">{{ w.tags[t] }}</span>
        </button>
      </div>
      <input ref="titleEl" v-model="title" class="field" :placeholder="w.title" :aria-label="w.title" :maxlength="MAX_TITLE" />
      <textarea v-model="body" class="field grow-field" :placeholder="w.body" :aria-label="w.body" :maxlength="MAX_POST" rows="5" @keydown="bodyKey" />
      <div class="foot">
        <p v-if="error" class="error small" role="alert">{{ error }}</p>
        <button type="button" class="quiet" @click="back">{{ w.cancel }}</button>
        <button class="primary" :disabled="busy">{{ w.post }}</button>
      </div>
    </form>

    <!-- One post and its replies. -->
    <template v-else-if="boardSheet.post && open">
      <div class="head">
        <button type="button" class="icon-key" :aria-label="w.back" @click="back"><Icon name="back" :size="18" /></button>
        <span class="tag"><Icon :name="tagIcon[open.post.tag]" :size="14" />{{ w.tags[open.post.tag] }}</span>
        <span class="grow" />
        <template v-if="me && !mine">
          <button type="button" class="icon-key" :aria-label="w.messageName(nameOf(open.post))" :title="w.message" @click="openChat('dm', { with: open.post.author.login })"><Icon name="chat" :size="18" /></button>
          <span v-if="reported" class="soft small" role="status">{{ w.reported }}</span>
          <button v-else type="button" class="icon-key" :aria-label="w.report" :title="w.report" @click="reportPost"><Icon name="flag" :size="18" /></button>
        </template>
        <button v-if="mine" type="button" class="icon-key" :class="{ sure }" :aria-label="sure ? w.deleteSure : w.deletePost" :title="w.deletePost" @click="removePost">
          <Icon name="trash" :size="18" /><span v-if="sure" class="word">{{ w.deleteSure }}</span>
        </button>
      </div>
      <article class="post">
        <h3>{{ stripBidi(open.post.title) }}</h3>
        <p class="by soft small"><Avatar :person="open.post.author" :size="20" decorative />{{ w.by(nameOf(open.post), noteWhen(open.post.createdAt)) }}<BadgeChip v-if="open.post.author.badge" :badge="open.post.author.badge" /></p>
        <p class="text"><SaidText :text="open.post.body" :me="me?.login ?? null" /></p>
      </article>
      <p v-if="error" class="error small" role="alert">{{ error }}</p>
      <ChatPanel
        class="replies"
        :messages="open.replies"
        :post-url="me ? `/api/board/${encodeURIComponent(open.post.id)}/replies` : null"
        :me="me?.login ?? null"
        :placeholder="w.reply"
        :empty="w.noReplies"
        :max-length="MAX_MESSAGE"
        tools
        removable
        @sent="fetchPost"
        @changed="refresh"
        @remove="removeReply"
        @message="(login) => openChat('dm', { with: login })"
      />
    </template>

    <!-- The list. -->
    <template v-else>
      <h3 class="sr-only">{{ w.boardTitle(chatSheet.city) }}</h3>
      <!-- Nothing posted yet: one line on a soft tile, and the way to post the first one. -->
      <div v-if="!posts.length" class="empty">
        <p class="empty-line">{{ w.noPosts(chatSheet.city) }}</p>
        <button v-if="me" type="button" class="primary first" @click="startPost"><Icon name="plus" :size="18" />{{ w.newPost }}</button>
      </div>
      <div v-else-if="me" class="head">
        <span class="grow" />
        <button type="button" class="new primary" @click="startPost"><Icon name="plus" :size="16" />{{ w.newPost }}</button>
      </div>
      <ul v-if="posts.length" ref="listEl" class="lines">
        <ListRow v-for="p in posts" :key="p.id" :title="stripBidi(p.title)" class="entry">
          <template #lead><span class="lead-tag" :title="w.tags[p.tag]"><Icon :name="tagIcon[p.tag]" :size="18" /></span></template>
          <span class="sub"><span class="sr-only">{{ w.tags[p.tag] }}. </span>{{ w.by(nameOf(p), noteWhen(p.activeAt)) }}</span>
          <template #end>
            <span class="replies-count" role="img" :aria-label="w.replies(p.replies)"><Icon name="chat" :size="14" />{{ p.replies }}</span>
            <button type="button" class="open" :aria-label="stripBidi(p.title)" @click="boardSheet.post = p.id"><Icon name="next" :size="16" /></button>
          </template>
        </ListRow>
      </ul>
      <p v-if="!me" class="soft small visitor">{{ w.logInToPost }} <RouterLink to="/login" @click="boardSheet.open = false">{{ w.logIn }}</RouterLink></p>
    </template>
  </div>
</template>

<style scoped>
.board { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.head { flex: none; display: flex; align-items: center; gap: 8px; min-height: 40px; }
.head h3 { flex: 1; min-width: 0; margin: 0; font-size: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grow { flex: 1; }
/* The post's keys: small grey keys with their lip, an icon each (a word only while asking). */
.icon-key { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 40px; height: 40px; min-height: 0; padding: 0 9px 3px; border-radius: 10px; background: var(--sunken); color: var(--text); box-shadow: inset 0 -3px 0 var(--quiet-lip); font-size: 14px; font-weight: 800; }
.icon-key:hover:not(:disabled) { background: var(--fill); }
.icon-key.sure { background: var(--accent-soft); color: var(--accent); box-shadow: none; }
/* The main button, small at the list's top: 40px with a 3px lip. */
.new { flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px 3px; border-radius: 10px; font-size: 14px; --lip: 3px; }
/* What the post is about: a word on the soft grey, its icon before it. */
.tag { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: var(--r-pill); background: var(--sunken); color: var(--text); font-size: 14px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
/* Nothing posted yet: one line on a soft tile, and the first post's button. */
.empty { display: grid; justify-items: center; gap: 12px; padding: 28px 12px; border-radius: var(--tile-r); background: var(--tile); text-align: center; }
.empty-line { margin: 0; font-size: 15px; font-weight: 600; color: var(--muted); }
.first { display: inline-flex; align-items: center; gap: 8px; }
.visitor { flex: none; margin: 0; text-align: center; }
.lines { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; list-style: none; margin: 0; padding: 2px; display: grid; gap: 6px; align-content: start; }
.lines :deep(.list-row) { min-height: 50px; padding: 2px 10px; gap: 10px; }
.lines :deep(.list-row .title) { font-size: 15px; }
.lines :deep(.list-row .sub) { font-size: 13px; }
.lead-tag { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; background: var(--tile); color: var(--text); }
.replies-count { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font: 800 13px/1 var(--num); font-variant-numeric: tabular-nums; }
.open { width: 32px; padding: 0 !important; justify-content: center; background: none; box-shadow: none; color: var(--muted); }
.entry { position: relative; cursor: pointer; }
.entry .open::after { content: ""; position: absolute; inset: 0; }
/* The post itself: its title, who and when, and its words as written, on a soft tile. */
.post { flex: none; display: grid; gap: 6px; padding: 12px 14px; border-radius: var(--tile-r); background: var(--tile); max-height: 40%; overflow-y: auto; }
.post h3 { margin: 0; font-size: 18px; line-height: 1.25; overflow-wrap: anywhere; }
.by { margin: 0; display: flex; align-items: center; gap: 6px; }
.text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.45; }
/* Writing a post: the kind on one grey rail, the title, what to say (it takes the room left), then Cancel and Post on
   one line at the bottom. Padded inside its scroll, so a focused field's ring isn't cut. */
.compose { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding: 6px; margin: -6px; }
.kinds { flex: none; display: flex; gap: 4px; padding: 4px; min-width: 0; border-radius: var(--tile-r); background: var(--sunken); }
.kind { flex: 0 0 44px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 0; min-height: 40px; padding: 0 10px; border-radius: 10px; background: transparent; color: var(--muted); box-shadow: none; font: 800 14px/1.1 var(--font); }
.kind:hover:not(:disabled) { background: transparent; color: var(--text); }
.kind:focus-visible { outline-offset: -3px; }
/* The chosen kind takes the rest of the rail, with its word. */
.kind[aria-checked="true"], .kind[aria-checked="true"]:hover:not(:disabled) { flex: 1 1 auto; justify-content: flex-start; background: var(--surface); color: var(--text); box-shadow: 0 2px 0 rgba(23, 21, 26, 0.14); }
.kind-word { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.compose .field { flex: none; width: 100%; border-radius: 12px; }
.compose .grow-field { flex: 1 1 auto; min-height: 120px; resize: none; font: inherit; }
.foot { flex: none; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.foot .error { flex: 1 1 auto; min-width: 0; margin: 0; }
.foot button { flex: none; min-height: 44px; padding: 0 18px var(--lip); white-space: nowrap; }
.foot .quiet { background: var(--fill); color: var(--text); box-shadow: var(--quiet-edge); }
.foot .quiet:hover:not(:disabled) { background: var(--fill-hover); }
</style>
