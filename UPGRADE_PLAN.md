# CHÀ BÔNG MEMORY — Upgrade Plan

## Strategy
Nâng cấp theo từng checkpoint, không rewrite toàn bộ app cùng lúc.

1. Performance baseline
2. Renderer isolation
3. Viewport culling
4. Image tiers / decode optimization
5. IndexedDB + optimistic UI
6. Upload queue + direct R2
7. Pagination + prefetch
8. Offline support
9. iOS native wrapper + AVFoundation camera
10. Security / migration / final benchmark

## Phase 1 — Performance baseline
**Status: 🟨 Browser performance lab implemented; real-device measurements pending**

Measure on 50 / 250 / 500 / 1000 photos using the browser lab at `/?perf=1`: initial render, pan responsiveness, zoom/pinch responsiveness, mounted photo nodes, image decode/network load, and memory usage.
See `docs/performance-baseline.md`.

## Phase 2 — Renderer isolation
**Status: 🟩 Implemented**
Pan/zoom updates the compositor directly; React state is not updated for every pointer movement. Implemented `transformRef`, direct `translate3d(...) scale(...)`, and RAF-coalesced viewport recalculation.

## Phase 3 — Viewport culling
**Status: 🟩 Implemented**
Only photos intersecting the viewport plus a prefetch margin are mounted. Implemented viewport bounds calculation, 700px world-space prefetch margin, `culledIds`, RAF-coalesced culling, and lazy/async image decoding.

Additional performance fix: removed the old O(n²) multi-pass `pushApart()` collision loop from collage generation. The row layout already guarantees row separation.

## Phase 4 — Image tiers / decode optimization
**Status: 🟩 Implemented**
Target: `thumb` ~160–240px, `canvas` ~600–1000px, `original` in native source format. Canvas should never depend on original resolution. Do not force WebP when it is larger than the source.

Implemented: upload now keeps the original file untouched, generates separate `thumb` (240px) and `canvas` (1000px) tiers, chooses the smaller WebP/JPEG encoder result, and falls back to the source when an encoded tier would be larger. D1 now stores `thumb_key` and `canvas_key`; legacy `preview_key` remains readable. The collage loads thumb first and promotes to canvas, while lightbox uses original.

## Phase 5 — Local-first
**Status: 🟩 Implemented**
Added an IndexedDB layer for local photo records and upload jobs. File/camera uploads are processed locally first, written to IndexedDB, rendered immediately with `pending` sync state, then uploaded asynchronously. Failed jobs remain queued and retry after 5 seconds or when the browser comes back online; successful jobs reconcile to server R2 URLs. Local pending/uploading records are restored on reload.

## Phase 6 — Upload architecture
**Status: 🟩 Implemented**
Browser upload jobs now request a signed upload plan from the Worker, PUT original/thumb/canvas directly to R2, then commit metadata to D1. The upload plan is HMAC-bound to the session secret and expires after 1 hour, so retries can safely reuse the same deterministic object keys. The existing `/api/upload` Worker proxy remains as a temporary fallback while `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are not configured. R2 bucket CORS is configured for `memory.chabongspace.com`, local development, and Quick Tunnel testing via `r2-cors.json`.

## Phase 7 — API / prefetch
**Status: 🟩 Implemented**
The photo API now uses stable cursor pagination with a `(captured_at/created_at, id)` tie-breaker. The gallery loads 100 records initially and appends the next page when the viewport reaches the loaded tail. Nearby canvas tiers are prefetched around mounted photos, and the lightbox preloads previous/current/next originals. Existing filters are preserved across pages.

## Phase 8 — Offline
**Status: 🟩 Implemented**
The gallery caches server photo metadata in IndexedDB and falls back to the cached gallery when the API is unavailable. The existing local-first upload queue now explicitly pauses while offline and resumes on reconnect. A Service Worker uses a cache-first strategy for `/media/` responses so previously viewed thumbnails/canvas/original assets can remain available offline. The UI exposes the current online/offline state while preserving optimistic local uploads.

## Phase 9 — Native iOS camera
**Status: 🟩 Implemented**
Added `ios/ChabongMemory.xcodeproj`: a small Swift/UIKit wrapper that loads `https://memory.chabongspace.com` in `WKWebView`, exposes a `chabongCamera` message handler, and presents an `AVCaptureSession` + `AVCapturePhotoOutput` native camera. Captured JPEG data is returned to the web UI through a `chabong-native-photo` DOM event, then enters the same IndexedDB/local-first upload queue as normal web uploads. The browser/PWA path keeps `getUserMedia()` as the fallback. Open `ios/ChabongMemory.xcodeproj` in Xcode, select a signing team, and run on an iPhone; camera permission is declared in `Info.plist`.

## Phase 10 — Production hardening
**Status: 🟩 Implemented**
Authentication now fails closed unless `ADMIN_PASSWORD` and `AUTH_SECRET` are configured; the old `04112003` fallback is removed. Session and upload-plan HMAC signatures are verified with Web Crypto instead of string comparison, with timestamp bounds and strict token shape checks. Worker CORS now allowlists the production gallery plus localhost development origins, and R2 bucket CORS no longer permits arbitrary Quick Tunnel origins by default. Direct upload planning validates supported image MIME types and deterministic object keys; legacy Worker-proxied uploads validate IDs and clean up partial R2 writes if either storage or D1 persistence fails. Existing `preview_key` remains supported, so older photo rows continue to render without a forced migration.

Added `npm run benchmark`, a reproducible synthetic renderer/culling benchmark for 500 / 1000 / 2000 metadata records. It measures layout and viewport-culling CPU time only; it deliberately does not claim browser FPS, network throughput, or device memory. Real-device performance remains the final manual measurement.

## Checkpoint rule
After every phase: 1) build, 2) test, 3) benchmark, 4) inspect diff, 5) commit checkpoint, 6) only then continue. If performance or stability gets worse, rollback the current phase before adding another layer.