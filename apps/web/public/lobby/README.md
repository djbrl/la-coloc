# Lobby models (placeholders)

CC0 (public domain) models by Kenney, www.kenney.nl. Downloaded 09 10 2026 (houses, people) and 10 10 2026 (city, street). No attribution required; we credit anyway.

| Folder | Pack | Source | Licence |
|---|---|---|---|
| `houses/` | City Kit (Suburban) 2.0: 21 houses, 2 trees, a planter | https://kenney.nl/assets/city-kit-suburban | CC0, see `houses/LICENSE.txt` |
| `city/` | City Kit (Commercial) 2.1: 14 shops, 5 skyscrapers, 16 low-detail skyline buildings, market parasols | https://kenney.nl/assets/city-kit-commercial | CC0, see `city/LICENSE.txt` |
| `street/` | City Kit (Roads): traffic light, street sign, construction cone, barrier and fence | https://kenney.nl/assets/city-kit-roads | CC0, see `street/LICENSE.txt` |
| `people/` | Mini Characters 1.0: 12 characters with animations (idle, walk, emote-yes, emote-no, …) | https://kenney.nl/assets/mini-characters | CC0, see `people/LICENSE.txt` |

**Packed smaller (19 10 2026).** Every `.glb` here went through `gltf-transform meshopt` (glTF Transform 4.5.1, MIT,
run with `npx @gltf-transform/cli`): meshopt compression and quantized vertices, the same shapes to within 0.01 %.
Each model's texture was then pointed back at its folder's shared `Textures/colormap.png` (gltf-transform would
otherwise embed a copy in every file). The 78 models went from 9 190 072 to 2 078 904 bytes. The loader decodes them
with three.js's `MeshoptDecoder` (MIT); `src/lobby/glb.test.ts` checks every file still loads. The art and its
licence are unchanged: only how the numbers are stored.

Placeholders until Jib's art. Loaded by `src/lobby/assets.ts`; the lobby falls back to code-built shapes if they fail to load.
