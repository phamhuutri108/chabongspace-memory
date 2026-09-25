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

Next layers: secure HttpOnly session auth, direct R2 uploads, D1 filters/pagination, cross-device sync, EXIF handling, Workers AI labels, spatial canvas virtualization, favorites/archive and offline queue.
