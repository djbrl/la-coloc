// Loads the lobby's models (CC0 Kenney placeholders, see public/lobby/README.md), one file at a time and only
// when something needs it. Everything is cached; people are cloned with their skeletons so each can animate.
// The files are packed small (meshopt compression, quantized vertices: about a quarter of their old size), so the
// loader needs meshopt's decoder to unpack them (a tiny WebAssembly module that ships with three.js, MIT).
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

const HOUSES = "abcdefghijklmnopqrstu".split("").map((l) => `/lobby/houses/building-type-${l}.glb`);
const PEOPLE = ["female", "male"].flatMap((s) => "abcdef".split("").map((l) => `/lobby/people/character-${s}-${l}.glb`));

// Counts every model loading, for the loading screen.
export const loading = new THREE.LoadingManager();
const loader = new GLTFLoader(loading).setMeshoptDecoder(MeshoptDecoder);

// Everyone's lobby character, by name ("female-a" … "male-f"). Matches AVATARS on the API.
export const CHARACTERS = ["female", "male"].flatMap((s) => "abcdef".split("").map((l) => `${s}-${l}`));
const cache = new Map<string, Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>>();

function load(url: string) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url).then((g) => ({ scene: g.scene, animations: g.animations })));
  return cache.get(url)!;
}

// The same id always gets the same model.
function pick<T>(list: T[], key: string): T {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

function shadows(root: THREE.Object3D) {
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

export const SHOPS = "abcdefghijklmn".split("").map((l) => `/lobby/city/building-${l}.glb`);
export const TOWERS = "abcde".split("").map((l) => `/lobby/city/building-skyscraper-${l}.glb`);
export const SKYLINE = [..."abcdefghijklmn".split("").map((l) => `/lobby/city/low-detail-building-${l}.glb`), "/lobby/city/low-detail-building-wide-a.glb", "/lobby/city/low-detail-building-wide-b.glb"];
export const TREES = ["/lobby/houses/tree-large.glb", "/lobby/houses/tree-small.glb"];
export const PARASOLS = ["/lobby/city/detail-parasol-a.glb", "/lobby/city/detail-parasol-b.glb"];
export const STREET = {
  trafficLight: "/lobby/street/traffic-light.glb",
  cone: "/lobby/street/construction-cone.glb",
  fence: "/lobby/street/construction-fence.glb",
  barrier: "/lobby/street/construction-barrier.glb",
};

/**
 * Any model, scaled so its bigger side is `size` units (or its height, with `by: "height"`), standing on y = 0,
 * centred on its footprint, front facing +z. Copies share geometry and materials, so a hundred trees cost little.
 */
export async function loadModel(url: string, size: number, by: "footprint" | "height" = "footprint"): Promise<THREE.Group> {
  const { scene } = await load(url);
  const model = scene.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const dims = box.getSize(new THREE.Vector3());
  model.scale.setScalar(size / (by === "height" ? dims.y : Math.max(dims.x, dims.z)));
  const fitted = new THREE.Box3().setFromObject(model);
  model.position.set(-(fitted.min.x + fitted.max.x) / 2, -fitted.min.y, -(fitted.min.z + fitted.max.z) / 2);
  shadows(model);
  const wrap = new THREE.Group();
  wrap.add(model);
  return wrap;
}

/** A house model about `width` units wide, standing on y = 0, centred, front facing +z. */
export async function loadHouse(houseId: string, width: number): Promise<THREE.Object3D> {
  const { scene } = await load(pick(HOUSES, houseId));
  const model = scene.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(width / size.x);
  const fitted = new THREE.Box3().setFromObject(model);
  model.position.set(-(fitted.min.x + fitted.max.x) / 2, -fitted.min.y, -(fitted.min.z + fitted.max.z) / 2);
  shadows(model);
  const wrap = new THREE.Group();
  wrap.add(model);
  return wrap;
}

export interface Person {
  object: THREE.Group;
  mixer: THREE.AnimationMixer;
  // Switches animation with a short blend: "idle", "walk", "emote-yes", "emote-no", …
  play(name: string, once?: boolean): void;
}

/**
 * A person about `height` units tall, feet on y = 0, facing +z, with their animations ready.
 * `character` picks the model ("male-c"); without one, the same key always gets the same model.
 */
export async function loadPerson(key: string, character?: string | null, height = 1.35): Promise<Person> {
  const url = character && CHARACTERS.includes(character) ? `/lobby/people/character-${character}.glb` : pick(PEOPLE, key);
  const { scene, animations } = await load(url);
  const model = cloneSkinned(scene) as THREE.Group;
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  model.scale.setScalar(height / size.y);
  shadows(model);
  const object = new THREE.Group();
  object.add(model);
  const mixer = new THREE.AnimationMixer(model);
  let current: THREE.AnimationAction | null = null;
  let currentName = "";
  const play = (name: string, once = false) => {
    if (name === currentName) return;
    const clip = animations.find((a) => a.name === name);
    if (!clip) return;
    const next = mixer.clipAction(clip);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (current) current.crossFadeTo(next, 0.2, false);
    current = next;
    currentName = name;
    if (once) {
      // Back to idle when a one-off (an emote) is done.
      const done = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== next) return;
        mixer.removeEventListener("finished", done);
        currentName = "";
        play("idle");
      };
      mixer.addEventListener("finished", done);
    }
  };
  play("idle");
  return { object, mixer, play };
}
