// Packs the lobby's GLB models smaller: meshopt compression with quantization (gltf-transform's `meshopt` command,
// MIT), then puts each model's texture back outside it. gltf-transform always embeds textures in a .glb; the
// Kenney models all share their folder's Textures/colormap.png, so we point them back at that one file instead of
// carrying a copy each.
//
// Usage: node scripts/pack-glb.mjs apps/web/public/lobby
// Every .glb in it (recursively) is replaced in place. Run it once on the originals; running it again on packed
// files is harmless but gains nothing.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.argv[2];
if (!root) throw new Error("Usage: node pack-glb.mjs <folder>");

function glbs(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? glbs(p) : name.endsWith(".glb") ? [p] : [];
  });
}

// A GLB is a 12-byte header, a JSON chunk and an optional BIN chunk.
function readGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  let bin = new Uint8Array(0);
  const at = 20 + jsonLength;
  if (at < bytes.byteLength) bin = bytes.subarray(at + 8, at + 8 + view.getUint32(at, true));
  return { json, bin };
}

function writeGlb(json, bin) {
  const pad = (n) => (4 - (n % 4)) % 4;
  let text = new TextEncoder().encode(JSON.stringify(json));
  // The JSON chunk is padded with spaces, the BIN chunk with zeros.
  text = Uint8Array.from([...text, ...new Array(pad(text.length)).fill(0x20)]);
  const binPadded = new Uint8Array(bin.length + pad(bin.length));
  binPadded.set(bin);
  const total = 12 + 8 + text.length + (bin.length ? 8 + binPadded.length : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, text.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(text, 20);
  if (bin.length) {
    const at = 20 + text.length;
    view.setUint32(at, binPadded.length, true);
    view.setUint32(at + 4, 0x004e4942, true); // "BIN\0"
    out.set(binPadded, at + 8);
  }
  return out;
}

/**
 * Turns embedded images back into links (`uris`: each original image's name and link), and rebuilds the
 * BIN chunk without their bytes: every remaining byte range of buffer 0 (plain buffer views, and the compressed
 * data meshopt's buffer views point at) is copied in order, and buffer view indices are renumbered.
 */
function externalise(json, bin, uris) {
  const dropped = new Set();
  (json.images ?? []).forEach((image, i) => {
    // Matched by name (pruning may drop an unused image and shift the rest), else by position.
    const uri = uris.find((u) => u.name !== undefined && u.name === image.name)?.uri ?? uris[i]?.uri;
    if (!uri || image.bufferView === undefined) return;
    dropped.add(image.bufferView);
    delete image.bufferView;
    delete image.mimeType;
    image.uri = uri;
  });
  if (!dropped.size) return { json, bin };
  const views = json.bufferViews ?? [];
  // Byte ranges of buffer 0 still in use, each with a setter for its new offset.
  const ranges = [];
  views.forEach((v, i) => {
    if (dropped.has(i)) return;
    if (v.buffer === 0) ranges.push({ offset: v.byteOffset ?? 0, length: v.byteLength, set: (o) => (v.byteOffset = o) });
    const m = v.extensions?.EXT_meshopt_compression;
    if (m && m.buffer === 0) ranges.push({ offset: m.byteOffset ?? 0, length: m.byteLength, set: (o) => (m.byteOffset = o) });
  });
  ranges.sort((a, b) => a.offset - b.offset);
  const parts = [];
  let size = 0;
  for (const r of ranges) {
    size += (4 - (size % 4)) % 4;
    parts.push({ at: size, bytes: bin.subarray(r.offset, r.offset + r.length) });
    r.set(size);
    size += r.length;
  }
  const out = new Uint8Array(size);
  for (const p of parts) out.set(p.bytes, p.at);
  // Renumber: buffer view i becomes i minus the dropped ones before it.
  const keep = views.map((_, i) => i).filter((i) => !dropped.has(i));
  const index = new Map(keep.map((old, i) => [old, i]));
  json.bufferViews = keep.map((i) => views[i]);
  for (const a of json.accessors ?? []) {
    if (a.bufferView !== undefined) a.bufferView = index.get(a.bufferView);
    if (a.sparse) {
      a.sparse.indices.bufferView = index.get(a.sparse.indices.bufferView);
      a.sparse.values.bufferView = index.get(a.sparse.values.bufferView);
    }
  }
  for (const image of json.images ?? []) if (image.bufferView !== undefined) image.bufferView = index.get(image.bufferView);
  json.buffers[0].byteLength = size;
  return { json, bin: out };
}

const scratch = mkdtempSync(join(tmpdir(), "pack-glb-"));
let before = 0;
let after = 0;
for (const file of glbs(root)) {
  const original = readFileSync(file);
  before += original.byteLength;
  const { json: originalJson } = readGlb(original);
  const uris = (originalJson.images ?? []).map((image) => ({ name: image.name, uri: image.uri ?? null }));
  // gltf-transform reads the texture beside the model, so it runs on the file where it is, writing to a scratch file.
  const packed = join(scratch, "out.glb");
  execFileSync("npx", ["-y", "@gltf-transform/cli@4.5.1", "meshopt", file, packed], { stdio: "ignore" });
  const { json, bin } = readGlb(readFileSync(packed));
  const result = externalise(json, bin, uris);
  const bytes = writeGlb(result.json, result.bin);
  writeFileSync(file, bytes);
  after += bytes.byteLength;
  console.log(`${file}: ${original.byteLength} → ${bytes.byteLength}`);
}
console.log(`total: ${before} → ${after} bytes`);
