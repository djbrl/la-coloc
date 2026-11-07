<script setup lang="ts">
// A few seconds of the live city, filmed with the name tags on and the windows off, playing on a loop with no sound.
// The camera drifts out and comes back, and the last second dissolves into the first, so the seam doesn't show. It
// only loads and plays while it's on screen. With calm motion asked for, it stays a still: the loop's first frame.
// The films are in public/landing/story as <name>.mp4 (H.264: four VP9 films side by side wouldn't all play in
// Chrome), with <name>.webp, their first frame, as the still.
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{ name: string; alt: string; width: number; height: number }>();

const PICTURES = "/landing/story";
const calm = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const film = ref<HTMLVideoElement | null>(null);
let watch: IntersectionObserver | null = null;

onMounted(() => {
  const v = film.value;
  if (!v || typeof IntersectionObserver === "undefined") return;
  watch = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) v.play().catch(() => {});
    else v.pause();
  });
  watch.observe(v);
});
onBeforeUnmount(() => watch?.disconnect());
</script>

<template>
  <img v-if="calm" :src="`${PICTURES}/${props.name}.webp`" :alt="props.alt" loading="lazy" :width="props.width" :height="props.height" />
  <video
    v-else
    ref="film"
    role="img"
    :aria-label="props.alt"
    :poster="`${PICTURES}/${props.name}.webp`"
    :width="props.width"
    :height="props.height"
    muted
    loop
    playsinline
    disablepictureinpicture
    preload="none"
    :src="`${PICTURES}/${props.name}.mp4`"
  />
</template>
