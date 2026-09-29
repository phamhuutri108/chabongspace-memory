# Performance Baseline

## Environment
Project: `chabongspace-memory`

Build: `npm run build`
Worker syntax check: `npm run verify`

## Current automated baseline
- Vite production build: passed
- Worker syntax check: passed
- Production JS bundle: 240.86 kB
- Gzipped JS bundle: 76.09 kB
- Production CSS: 8.10 kB
- Gzipped CSS: 2.37 kB
- Build duration in current environment: ~75 ms

These numbers measure build output, not browser runtime performance.

## Runtime benchmark matrix

| Dataset | Initial render | Pan FPS | Zoom FPS | Mounted photos | Memory |
|---:|---:|---:|---:|---:|---:|
| 50 | pending | pending | pending | pending | pending |
| 250 | pending | pending | pending | pending | pending |
| 500 | pending | pending | pending | pending | pending |
| 1000 | pending | pending | pending | pending | pending |
| 2000 | pending | pending | pending | pending | pending |

## Phase 10 synthetic benchmark

Run `npm run benchmark` to reproduce a Node-only benchmark of the current collage layout and viewport-culling algorithms. This uses synthetic metadata and no real photos, network, or browser rendering. The command reports CPU milliseconds and the number of records mounted by the culling calculation for 500 / 1000 / 2000 photos. These values are useful for regression detection, not as a substitute for Safari FPS or memory profiling.

## What changed in Phase 1–3

### 1. Removed O(n²) collage collision pass
The old collage builder ran a multi-pass pairwise collision algorithm: 18 passes × n² photo comparisons. The row layout already keeps rows vertically separated, so this pass was removed.

### 2. Gesture rendering is now ref-driven
During pan/pinch/zoom: pointer event → transformRef → DOM translate3d / scale. React state is committed when the gesture ends rather than on every pointer movement.

### 3. Viewport culling
Only photos intersecting the viewport + 700px prefetch margin are mounted.

## Important limitation
The current environment does not provide a real browser performance trace for iPhone Safari, so FPS and memory figures must be collected manually on the actual target device/browser before declaring the performance target achieved.

## Phase 5 local-first pipeline
- IndexedDB stores the original file blob, thumb/canvas blobs, metadata, and sync state for local uploads.
- Upload UI is optimistic: a selected/captured image is visible before the network request completes.
- Failed uploads stay in the queue and retry after 5 seconds or on `online`.
- Successful uploads reconcile local object URLs with server R2 media URLs.
- Deleting a photo also removes its local IndexedDB record and queued job.

## Phase 4 image pipeline
- `original`: uploaded without resize/re-encode, preserving the source MIME/type.
- `canvas`: generated at a maximum dimension of 1000px for the collage/lightweight zoom path.
- `thumb`: generated at a maximum dimension of 240px and loaded first for visible photo nodes.
- Encoding is adaptive: WebP and JPEG candidates are compared, and a generated candidate is only kept when it is smaller than the source.
- Existing records remain compatible through `preview_key` fallback; new records also expose `thumb_key` and `canvas_key`.