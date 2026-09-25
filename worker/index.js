import { AwsClient } from "aws4fetch";

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {})
    }
  });

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-allow-credentials": "true"
};

function getCors(request, extra = {}) {
  const origin = request.headers.get("origin") || "*";
  return {
    ...corsHeaders,
    "access-control-allow-origin": origin,
    ...extra
  };
}

let dbInitialized = false;
async function ensureDb(env) {
  if (!env.DB || dbInitialized) return;
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        r2_key TEXT NOT NULL,
        preview_key TEXT,
        created_at TEXT NOT NULL,
        captured_at TEXT,
        caption TEXT,
        location TEXT,
        event TEXT,
        person TEXT,
        pet TEXT,
        ai_labels TEXT,
        tags TEXT,
        width INTEGER,
        height INTEGER,
        size_bytes INTEGER,
        mime_type TEXT,
        status TEXT NOT NULL DEFAULT 'ready'
      );
    `).run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at);").run().catch(() => {});
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_photos_captured_at ON photos(captured_at);").run().catch(() => {});
    dbInitialized = true;
  } catch (e) {
    console.error("DB initialization error:", e);
  }
}

async function getHmacKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signToken(secret, timestamp) {
  const enc = new TextEncoder();
  const key = await getHmacKey(secret);
  const data = enc.encode(String(timestamp));
  const signature = await crypto.subtle.sign("HMAC", key, data);
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${timestamp}.${hex}`;
}

async function verifyToken(secret, token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [timestampStr] = parts;
  const ts = Number(timestampStr);
  if (!ts || isNaN(ts)) return false;
  // 30 days max age
  if (Date.now() - ts > 30 * 24 * 60 * 60 * 1000) return false;
  const expected = await signToken(secret, ts);
  return token === expected;
}

function parseCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
}

async function isAuthorized(request, env) {
  const secret = env.SESSION_SECRET || env.AUTH_PASSWORD || "04112003";
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const cookie = parseCookie(request, "memory_session");
  const token = bearer || cookie;
  return verifyToken(secret, token);
}

export default {
  async fetch(request, env) {
    const cors = getCors(request);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    try {
      // 1. Health check
      if (url.pathname === "/api/health") {
        return json(
          { ok: true, service: "chabongspace-memory", timestamp: new Date().toISOString() },
          { headers: cors }
        );
      }

      // 2. Direct R2 media stream (Cached)
      if (url.pathname.startsWith("/media/") && request.method === "GET") {
        const key = decodeURIComponent(url.pathname.slice("/media/".length));
        if (!key) return new Response("Not found", { status: 404 });
        if (env.MEDIA) {
          const object = await env.MEDIA.get(key);
          if (!object) return new Response("Media not found", { status: 404 });
          const headers = new Headers();
          object.writeHttpMetadata(headers);
          headers.set("etag", object.httpEtag);
          headers.set("cache-control", "public, max-age=31536000, immutable");
          headers.set("access-control-allow-origin", "*");
          return new Response(object.body, { headers });
        }
        return new Response("Storage not configured", { status: 503 });
      }

      // 3. Auth endpoints
      if (url.pathname === "/api/auth/verify" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const masterPassword = env.AUTH_PASSWORD || "04112003";
        if (body.password === masterPassword) {
          const secret = env.SESSION_SECRET || env.AUTH_PASSWORD || "04112003";
          const token = await signToken(secret, Date.now());
          const cookieHeader = `memory_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}; Secure`;
          return json(
            { ok: true, token },
            {
              headers: {
                ...cors,
                "set-cookie": cookieHeader
              }
            }
          );
        }
        return json({ error: "Mật khẩu không chính xác" }, { status: 401, headers: cors });
      }

      if (url.pathname === "/api/auth/me" && request.method === "GET") {
        const authed = await isAuthorized(request, env);
        return json({ authed }, { headers: cors });
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        const cookieHeader = `memory_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
        return json(
          { ok: true },
          {
            headers: {
              ...cors,
              "set-cookie": cookieHeader
            }
          }
        );
      }

      // Check auth for all remaining /api/* endpoints
      const authed = await isAuthorized(request, env);
      if (!authed) {
        return json({ error: "Unauthorized" }, { status: 401, headers: cors });
      }

      // Auto ensure DB schema
      await ensureDb(env);

      // 4. Tags list
      if (url.pathname === "/api/tags" && request.method === "GET") {
        if (!env.DB) return json([], { headers: cors });
        const rows = await env.DB.prepare(
          "SELECT tags FROM photos WHERE status='ready' AND tags IS NOT NULL AND tags != ''"
        ).all();
        const set = new Set();
        (rows.results || []).forEach((r) => {
          String(r.tags)
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
            .forEach((t) => set.add(t));
        });
        return json(Array.from(set).sort(), { headers: cors });
      }

      // 5. Photos query with full filtering & pagination
      if (url.pathname === "/api/photos" && request.method === "GET") {
        if (!env.DB) return json({ photos: [], nextCursor: null }, { headers: cors });
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 500);
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        const tag = (url.searchParams.get("tag") || "").trim().toLowerCase();
        const from = (url.searchParams.get("from") || "").trim();
        const to = (url.searchParams.get("to") || "").trim();
        const cursor = (url.searchParams.get("cursor") || "").trim();

        const conditions = ["status = 'ready'"];
        const params = [];

        if (cursor) {
          conditions.push("COALESCE(captured_at, created_at) < ?");
          params.push(cursor);
        }

        if (q) {
          conditions.push(
            "(LOWER(caption) LIKE ? OR LOWER(tags) LIKE ? OR LOWER(location) LIKE ? OR LOWER(event) LIKE ?)"
          );
          const wildcard = `%${q}%`;
          params.push(wildcard, wildcard, wildcard, wildcard);
        }

        if (tag) {
          conditions.push("(LOWER(tags) LIKE ? OR LOWER(tags) = ?)");
          params.push(`%${tag}%`, tag);
        }

        if (from) {
          conditions.push("COALESCE(captured_at, created_at) >= ?");
          params.push(from);
        }

        if (to) {
          conditions.push("COALESCE(captured_at, created_at) <= ?");
          params.push(to.length === 10 ? `${to}T23:59:59.999Z` : to);
        }

        const sql = `
          SELECT id, r2_key, preview_key, created_at, captured_at, caption,
                 location, event, person, pet, ai_labels, tags, width, height,
                 size_bytes, mime_type, status
          FROM photos
          WHERE ${conditions.join(" AND ")}
          ORDER BY COALESCE(captured_at, created_at) DESC
          LIMIT ?
        `;
        params.push(limit);

        const rows = await env.DB.prepare(sql).bind(...params).all();
        const results = rows.results || [];
        const nextCursor =
          results.length === limit
            ? results[results.length - 1].captured_at || results[results.length - 1].created_at
            : null;

        return json({ photos: results, nextCursor }, { headers: cors });
      }

      // 6. Direct Upload via R2 binding (Fast, No S3 token required!)
      if (url.pathname === "/api/upload" && request.method === "POST") {
        if (!env.MEDIA) {
          return json({ error: "Cloudflare R2 MEDIA binding not found" }, { status: 500, headers: cors });
        }
        const formData = await request.formData();
        const file = formData.get("file");
        const preview = formData.get("preview");
        const id = formData.get("id") || crypto.randomUUID();
        const caption = formData.get("caption") || "";
        const tags = formData.get("tags") || "";
        const capturedAt = formData.get("capturedAt") || new Date().toISOString();
        const width = Number(formData.get("width")) || null;
        const height = Number(formData.get("height")) || null;
        const mimeType = file?.type || formData.get("mimeType") || "image/jpeg";
        const sizeBytes = file?.size || Number(formData.get("sizeBytes")) || null;

        if (!file) {
          return json({ error: "File data is required" }, { status: 400, headers: cors });
        }

        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, "0");
        const key = `photos/${year}/${month}/${id}/original`;
        const previewKey = `photos/${year}/${month}/${id}/preview.webp`;

        // Upload directly into R2
        await env.MEDIA.put(key, file.stream(), {
          httpMetadata: { contentType: mimeType }
        });

        if (preview && typeof preview.stream === "function") {
          await env.MEDIA.put(previewKey, preview.stream(), {
            httpMetadata: { contentType: "image/webp" }
          });
        }

        // Save metadata into D1
        if (env.DB) {
          await env.DB.prepare(
            `INSERT INTO photos (
              id, r2_key, preview_key, created_at, captured_at, caption,
              tags, width, height, size_bytes, mime_type, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready')
            ON CONFLICT(id) DO UPDATE SET
              r2_key = excluded.r2_key,
              preview_key = excluded.preview_key,
              status = 'ready',
              width = COALESCE(excluded.width, photos.width),
              height = COALESCE(excluded.height, photos.height),
              caption = COALESCE(excluded.caption, photos.caption)`
          )
            .bind(
              id,
              key,
              previewKey,
              now.toISOString(),
              capturedAt,
              caption || null,
              tags || null,
              width,
              height,
              sizeBytes,
              mimeType
            )
            .run();
        }

        return json(
          {
            ok: true,
            id,
            key,
            previewKey,
            caption,
            capturedAt,
            width,
            height
          },
          { headers: cors }
        );
      }

      // 7. Photo update
      if (url.pathname === "/api/photos/update" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        if (!body.id) return json({ error: "id is required" }, { status: 400, headers: cors });
        if (env.DB) {
          await env.DB.prepare(
            `UPDATE photos
             SET caption = COALESCE(?, caption),
                 tags = COALESCE(?, tags),
                 captured_at = COALESCE(?, captured_at),
                 location = COALESCE(?, location),
                 event = COALESCE(?, event)
             WHERE id = ?`
          )
            .bind(
              body.caption !== undefined ? body.caption : null,
              body.tags !== undefined ? body.tags : null,
              body.capturedAt !== undefined ? body.capturedAt : null,
              body.location !== undefined ? body.location : null,
              body.event !== undefined ? body.event : null,
              body.id
            )
            .run();
        }
        return json({ ok: true, id: body.id }, { headers: cors });
      }

      // 8. Delete photo
      if (url.pathname === "/api/photos/delete" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const id = body.id || url.searchParams.get("id");
        if (!id) return json({ error: "id is required" }, { status: 400, headers: cors });

        if (env.DB) {
          const row = await env.DB.prepare("SELECT r2_key, preview_key FROM photos WHERE id = ?")
            .bind(id)
            .first();

          if (row) {
            if (env.MEDIA) {
              if (row.r2_key) await env.MEDIA.delete(row.r2_key).catch(() => {});
              if (row.preview_key) await env.MEDIA.delete(row.preview_key).catch(() => {});
            }
            await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(id).run();
          }
        }
        return json({ ok: true, id }, { headers: cors });
      }

      // 9. Download original high-res photo stream
      if (url.pathname === "/api/download" && request.method === "GET") {
        const id = url.searchParams.get("id");
        if (!id) return json({ error: "id is required" }, { status: 400, headers: cors });
        if (!env.DB) return json({ error: "Database not available" }, { status: 500, headers: cors });

        const row = await env.DB.prepare("SELECT r2_key, caption, mime_type FROM photos WHERE id = ?")
          .bind(id)
          .first();

        if (!row || !row.r2_key) return json({ error: "not found" }, { status: 404, headers: cors });

        if (env.MEDIA) {
          const object = await env.MEDIA.get(row.r2_key);
          if (!object) return json({ error: "Media file not found in storage" }, { status: 404, headers: cors });
          const headers = new Headers();
          object.writeHttpMetadata(headers);
          const ext = row.mime_type === "image/png" ? ".png" : ".jpg";
          const filename = (row.caption || `photo-${id}`).replace(/[^a-zA-Z0-9_-]/g, "_") + ext;
          headers.set("content-disposition", `attachment; filename="${filename}"`);
          headers.set("access-control-allow-origin", "*");
          return new Response(object.body, { headers });
        }
        return json({ error: "Storage binding not available" }, { status: 500, headers: cors });
      }

      return new Response("Not found", { status: 404, headers: cors });
    } catch (e) {
      return json({ error: e.message || "server error" }, { status: 500, headers: cors });
    }
  }
};
