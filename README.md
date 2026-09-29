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

### Required production secrets
Authentication is intentionally fail-closed. Production requires both secrets below; there is no built-in/default password.

```sh
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put AUTH_SECRET
```

`AUTH_SECRET` should be a long random value and must not be committed to git. R2 direct uploads additionally require `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` as Worker secrets.

R2 bucket CORS is intentionally limited to the production gallery and local development origins in `r2-cors.json`. Quick Tunnel origins are no longer allowed by default; if temporary tunnel testing is required, add that exact origin temporarily and reset the CORS policy afterward.

## iOS native wrapper
Open `ios/ChabongMemory.xcodeproj` in Xcode 27+, select the `ChabongMemory` target and a development team, then run on an iPhone. The wrapper loads the production web app in `WKWebView` and replaces the web camera button with an `AVFoundation` native camera. Captured JPEGs are passed back through a JavaScript bridge and use the same IndexedDB/upload queue as browser captures. The web `getUserMedia()` camera remains the fallback outside the native wrapper.

## Upgrade status
Phases 1–10 are implemented. Phase 10 adds fail-closed authentication, origin allowlisting, stronger HMAC verification, upload MIME/key validation, partial-upload cleanup, legacy preview compatibility, and the synthetic 500/1000/2000 renderer benchmark (`npm run benchmark`). Browser FPS/memory still requires a real-device trace.
