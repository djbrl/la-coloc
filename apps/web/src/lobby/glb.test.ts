// Every model in public/lobby still loads after packing (meshopt compression, quantized vertices: see
// public/lobby/README.md): three.js's own GLTF loader, with the meshopt decoder wired as in assets.ts, reads each file
// and finds its meshes, its texture link and (for people) the animations the lobby plays.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ROOT = join(__dirname, "../../public/lobby");

function glbs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? glbs(p) : name.endsWith(".glb") ? [p] : [];
  });
}

// The JSON part of a GLB: after the 12-byte header, a chunk length, a chunk type, then the text.
function json(bytes: Buffer): { images?: { uri?: string }[]; extensionsUsed?: string[] } {
  const length = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + length).toString("utf8"));
}

const files = glbs(ROOT);

describe("the lobby's models", () => {
  // The loader looks up `self.URL` before it asks for a texture; tests have no browser, and no pictures: each texture
  // link is answered with an empty texture.
  beforeAll(() => vi.stubGlobal("self", globalThis));
  afterAll(() => vi.unstubAllGlobals());
  const manager = new THREE.LoadingManager();
  manager.addHandler(/\.png$/, { load: (_url: string, onLoad: (t: THREE.Texture) => void) => onLoad(new THREE.Texture()) } as unknown as THREE.Loader);
  const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);

  it("are all there", () => {
    expect(files.length).toBe(78);
  });

  it("are packed, and share their folder's texture instead of carrying a copy", () => {
    for (const file of files) {
      const j = json(readFileSync(file));
      expect(j.extensionsUsed, relative(ROOT, file)).toContain("EXT_meshopt_compression");
      for (const image of j.images ?? []) expect(image.uri, relative(ROOT, file)).toBe("Textures/colormap.png");
    }
  });

  it.each(files.map((f) => [relative(ROOT, f), f]))("%s loads, with a mesh of a real size", async (name, file) => {
    const bytes = readFileSync(file);
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "");
    let meshes = 0;
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBeGreaterThan(0);
    const size = new THREE.Box3().setFromObject(gltf.scene, true).getSize(new THREE.Vector3());
    expect(Math.min(size.x, size.y, size.z)).toBeGreaterThan(0.01);
    if (name.startsWith("people/")) {
      const clips = gltf.animations.map((c) => c.name);
      for (const clip of ["idle", "walk", "emote-yes", "emote-no"]) expect(clips).toContain(clip);
    }
  });
});
