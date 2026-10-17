<script setup lang="ts">
// The Board tab: the city's small forum. The list shows each post as a dense row (its tag, its title, who and when,
// how many replies), the most recently active first; a post opens with its body and its replies under it. Logged-in
// people post (a tag, a title, a few lines) and reply; the author deletes their own. "Message" writes to the author.
// Live through the city's stream (a "board" ping, then a fetch).
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useWhenBack } from "../../core";
import { chatSheet, openChat, report } from "../../conversations";
import { me, postJSON, sendJSON } from "../../session";
import { openStream, type Stream } from "../../stream";
import type { BoardPost, Message } from "../../types";
import Avatar from "../Avatar.vue";
import ChatPanel from "../ChatPanel.vue";
import Icon from "../lobby/house/Icon.vue";
import { noteWhen } from "../lobby/house/notes";
import ListRow from "../lobby/panel/ListRow.vue";
import { BOARD_TAGS, type BoardTag, linkParts, MAX_MESSAGE, MAX_POST, MAX_TITLE, stripBidi } from "./chat";
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

const cityUrl = (city: string) => `/api/cities/${encodeURIComponent(city)}`;

async function fetchBoard() {
  const city = chatSheet.city;
  try {
    const res = await fetch(`${cityUrl(city)}/board`);
    if (!res.ok || city !== chatSheet.city) return;
    posts.value = ((await res.json()) as { posts: BoardPost[] }).posts;
  } catch {
    // Keep what we had.
  }
}

async function fetchPost() {
  const id = chatSheet.post;
  if (!id) {
    open.value = null;
    return;
  }
  try {
    const res = await fetch(`/api/board/${encodeURIComponent(id)}`);
    if (id !== chatSheet.post) return;
    // Gone (deleted, or its author blocked): back to the list.
    if (res.status === 404) {
      chatSheet.post = null;
      return;
    }
    if (res.ok) open.value = await res.json();
  } catch {
    // Keep what we had.
  }
}

function refresh() {
  void fetchBoard();
  if (chatSheet.post) void fetchPost();
}

watch(
  () => chatSheet.city,
  (city) => {
    stream?.close();
    posts.value = [];
    void fetchBoard();
    stream = openStream(`${cityUrl(city)}/stream`, { board: refresh });
  },
  { immediate: true },
);
watch(
  () => chatSheet.post,
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
  chatSheet.post = null;
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
  chatSheet.post = sent.data.id;
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
    chatSheet.post = null;
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
      <div class="tags" role="radiogroup" :aria-label="w.tagName">
        <button v-for="t in BOARD_TAGS" :key="t" type="button" role="radio" class="tag-pick" :aria-checked="tag === t" @click="tag = t">
          <Icon :name="tagIcon[t]" :size="15" />{{ w.tags[t] }}
        </button>
      </div>
      <input ref="titleEl" v-model="title" :placeholder="w.title" :aria-label="w.title" :maxlength="MAX_TITLE" />
      <textarea v-model="body" :placeholder="w.body" :aria-label="w.body" :maxlength="MAX_POST" rows="5" @keydown="bodyKey" />
      <p v-if="error" class="error small" role="alert">{{ error }}</p>
      <button class="primary" :disabled="busy">{{ w.post }}</button>
    </form>

    <!-- One post and its replies. -->
    <template v-else-if="chatSheet.post && open">
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
        <p class="by soft small"><Avatar :person="open.post.author" :size="20" decorative />{{ w.by(nameOf(open.post), noteWhen(open.post.createdAt)) }}</p>
        <p class="text"><template v-for="(part, i) in linkParts(open.post.body)" :key="i"><a v-if="part.href" :href="part.href" target="_blank" rel="noopener noreferrer nofollow ugc">{{ part.text }}</a><template v-else>{{ part.text }}</template></template></p>
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
      <div class="head">
        <h3 class="sr-only">{{ w.boardTitle(chatSheet.city) }}</h3>
        <span class="grow" />
        <button v-if="me" type="button" class="new primary" @click="startPost"><Icon name="plus" :size="16" />{{ w.newPost }}</button>
      </div>
      <p v-if="!posts.length" class="soft empty">{{ w.noPosts(chatSheet.city) }}</p>
      <ul v-else ref="listEl" class="lines">
        <ListRow v-for="p in posts" :key="p.id" :title="stripBidi(p.title)" class="entry">
          <template #lead><span class="lead-tag" :title="w.tags[p.tag]"><Icon :name="tagIcon[p.tag]" :size="18" /></span></template>
          <span class="sub"><span class="sr-only">{{ w.tags[p.tag] }}. </span>{{ w.by(nameOf(p), noteWhen(p.activeAt)) }}</span>
          <template #end>
            <span class="replies-count" role="img" :aria-label="w.replies(p.replies)"><Icon name="chat" :size="14" />{{ p.replies }}</span>
            <button type="button" class="open" :aria-label="stripBidi(p.title)" @click="chatSheet.post = p.id"><Icon name="next" :size="16" /></button>
          </template>
        </ListRow>
      </ul>
      <p v-if="!me" class="soft small visitor">{{ w.logInToPost }} <RouterLink to="/login" @click="chatSheet.open = false">{{ w.logIn }}</RouterLink></p>
    </template>
  </div>
</template>

<style scoped>
.board { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.head { flex: none; display: flex; align-items: center; gap: 8px; min-height: 34px; }
.head h3 { flex: 1; min-width: 0; margin: 0; font-size: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grow { flex: 1; }
.icon-key { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 34px; height: 34px; min-height: 0; padding: 0 8px; border-radius: var(--r-sm); background: none; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); font-size: 13px; font-weight: 600; }
.icon-key:hover:not(:disabled) { background: var(--fill); color: var(--text); }
.icon-key.sure { background: var(--danger-soft); color: var(--danger); box-shadow: none; }
.new { flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; font-size: 14px; --lip: 2px; }
.tag { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: var(--r-pill); background: var(--accent-soft); color: var(--accent); font-size: 12.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.empty { margin: 0; padding: 8px 2px; }
.visitor { flex: none; margin: 0; text-align: center; }
.lines { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; list-style: none; margin: 0; padding: 2px; display: grid; gap: 6px; align-content: start; }
.lines :deep(.list-row) { min-height: 54px; padding: 8px 10px; gap: 10px; }
.lead-tag { width: 34px; height: 34px; display: grid; place-items: center; border-radius: var(--r-sm); background: var(--tile); color: var(--accent); }
.replies-count { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font: 500 12.5px/1 var(--mono); }
.open { width: 32px; padding: 0 !important; justify-content: center; background: none; box-shadow: none; color: var(--muted); }
.entry { position: relative; cursor: pointer; }
.entry .open::after { content: ""; position: absolute; inset: 0; }
/* The post itself: its title, who and when, and its words as written. */
.post { flex: none; display: grid; gap: 6px; padding: 12px 14px; border-radius: var(--r-md); background: var(--tile); max-height: 40%; overflow-y: auto; }
.post h3 { margin: 0; font-size: 18px; line-height: 1.25; overflow-wrap: anywhere; }
.by { margin: 0; display: flex; align-items: center; gap: 6px; }
.text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.45; }
.text a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
/* Writing a post: the tags as a wrap of small radio keys, then the two fields and the button. */
.compose { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tag-pick { display: inline-flex; align-items: center; gap: 5px; min-height: 32px; padding: 0 10px; border-radius: var(--r-pill); background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); color: var(--text); font-size: 13px; font-weight: 600; }
.tag-pick[aria-checked="true"] { background: var(--accent-soft); color: var(--accent); box-shadow: none; }
.compose input, .compose textarea { width: 100%; border-radius: var(--r-md); }
.compose textarea { resize: vertical; min-height: 96px; font: inherit; }
.compose > .primary { align-self: flex-end; }
</style>
