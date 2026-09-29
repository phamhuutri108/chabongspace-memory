# Performance Baseline

## Environment
Project: `chabongspace-memory`

Build: `npm run build`
Worker syntax check: `npm run verify`

## Current automated baseline
- Vite production build: passed
- Worker syntax check: passed
- Production JS bundle: 254.42 kB
- Gzipped JS bundle: 79.78 kB
- Production CSS: 9.97 kB
- Gzipped CSS: 2.73 kB
- Build duration in current environment: ~85 ms

These numbers measure build output, not browser runtime performance.

## Runtime benchmark matrix

| Dataset | Initial render | Pan FPS | Zoom FPS | Mounted photos | Memory |
|---:|---:|---:|---:|---:|---:|
| 50 | pending | pending | pending | pending | pending |
| 250 | pending | pending | pending | pending | pending |
| 500 | pending | pending | pending | pending | pending |
| 1000 | pending | pending | pending | pending | pending |

The Phase 1 browser lab is available at `/?perf=1`. It generates synthetic 50 / 250 / 500 / 1000-photo datasets inside the real gallery renderer and exposes repeatable measurements for initial render, 5-second pan/zoom animation FPS, mounted photo nodes, image loading and JS heap when the browser exposes `performance.memory`.

### Measurement procedure
1. Open the production or local gallery with `?perf=1` on the target browser/device.
2. Select 50, 250, 500 and 1000 photos one at a time and wait for the initial-render value to settle.
3. Run `Measure pan · 5s` and `Measure zoom · 5s` for each dataset. Keep the device otherwise idle.
4. Run `Measure image load` after each dataset to capture image-resource loading cost. Resource timing may omit transfer sizes on cross-origin images without timing permission.
5. Record mounted photo count from the panel. This is the number of `.perf-photo` nodes actually mounted after viewport culling.
6. On Chromium, record JS heap from the panel. Safari does not expose `performance.memory`, so use Safari Web Inspector's Timelines/Memory tools for the memory column.
7. Repeat the full matrix at least once after a cold page load and once after a warm reload; use the warm/cold distinction in notes rather than averaging them together.

The lab's pan/zoom FPS is a controlled `requestAnimationFrame` stress animation, not a claim about every possible user gesture. For final Phase 1 sign-off, the measured values must be collected on the actual target browser/device.

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