# Chà Bông Space — Memory

Private memory gallery for `memory.chabongspace.com`.

## Foundation
- Vite + React frontend.
- Cloudflare Worker API entry point.
- D1 migration for photo metadata and tags.
- R2 binding configuration for media.
- Password-gate UI scaffold.
- Responsive collage canvas, search, lightbox and camera capture.

## Cloudflare setup
This project does not automatically create production resources. Create a dedicated D1 database named `chabongspace-memory` and a dedicated R2 bucket named `chabongspace-memory-media`, then put the D1 database ID in `wrangler.toml`. Do not reuse Sound or another project's resources.

## iOS native wrapper
Open `ios/ChabongMemory.xcodeproj` in Xcode 27+, select the `ChabongMemory` target and a development team, then run on an iPhone. The wrapper loads the production web app in `WKWebView` and replaces the web camera button with an `AVFoundation` native camera. Captured JPEGs are passed back through a JavaScript bridge and use the same IndexedDB/upload queue as browser captures. The web `getUserMedia()` camera remains the fallback outside the native wrapper.

## Upgrade status
Phases 1–9 are implemented. Phase 10 remains for production hardening: remove the hardcoded password fallback, review CORS/session handling, secure R2 writes, preserve legacy photo compatibility, migrate old preview assets gradually, and run the final 500/1000/2000-photo benchmark.
