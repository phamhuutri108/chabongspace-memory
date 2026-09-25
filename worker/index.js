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

async function signR2(env, key, method, contentType) {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 S3 API credentials not configured in environment");
  }
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY
  });
  const url = new URL(
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME || "chabongspace-memory-media"}/${key}`
  );
  url.searchParams.set("X-Amz-Expires", "900");
  const signed = await client.sign(
    new Request(url, {
      method,
      headers: contentType ? { "content-type": contentType } : {}
    }),
    { aws: { signQuery: true } }
  );
  return signed.url;
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
        // Fallback to S3 presigned redirect if MEDIA binding is missing
        const signedUrl = await signR2(env, key, "GET");
        return Response.redirect(signedUrl, 302);
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
        if (!env.DB) return json([], { headers: cors });
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
          // Include the entire end day
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

      // 6. Photo details / update
      if (url.pathname === "/api/photos/update" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        if (!body.id) return json({ error: "id is required" }, { status: 400, headers: cors });
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
        return json({ ok: true, id: body.id }, { headers: cors });
      }

      // 7. Delete photo
      if (url.pathname === "/api/photos/delete" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const id = body.id || url.searchParams.get("id");
        if (!id) return json({ error: "id is required" }, { status: 400, headers: cors });

        const row = await env.DB.prepare("SELECT r2_key, preview_key FROM photos WHERE id = ?")
          .bind(id)
          .first();

        if (row) {
          if (env.MEDIA) {
            if (row.r2_key) await env.MEDIA.delete(row.r2_key).catch(() => {});
            if (row.preview_key) await env.MEDIA.delete(row.preview_key).catch(() => {});
          }
          await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(id).run();
          await env.DB.prepare("DELETE FROM photo_tags WHERE photo_id = ?").bind(id).run().catch(() => {});
        }
        return json({ ok: true, id }, { headers: cors });
      }

      // 8. Uploads initialization (Dual-Key for Original & Preview WebP)
      if (url.pathname === "/api/uploads" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        if (!body.id || !body.mimeType) {
          return json({ error: "id and mimeType are required" }, { status: 400, headers: cors });
        }
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, "0");
        const key = `photos/${year}/${month}/${body.id}/original`;
        const previewKey = `photos/${year}/${month}/${body.id}/preview.webp`;

        const uploadUrl = await signR2(env, key, "PUT", body.mimeType);
        const previewUrl = await signR2(env, previewKey, "PUT", "image/webp");

        await env.DB.prepare(
          `INSERT INTO photos (
            id, r2_key, preview_key, created_at, captured_at, caption,
            tags, width, height, size_bytes, mime_type, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading')
          ON CONFLICT(id) DO UPDATE SET status = 'uploading'`
        )
          .bind(
            body.id,
            key,
            previewKey,
            now.toISOString(),
            body.capturedAt || null,
            body.caption || null,
            body.tags || null,
            body.width || null,
            body.height || null,
            body.sizeBytes || null,
            body.mimeType
          )
          .run();

        return json({ id: body.id, key, previewKey, uploadUrl, previewUrl }, { headers: cors });
      }

      // 9. Upload complete
      if (url.pathname === "/api/uploads/complete" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        if (!body.id) return json({ error: "id is required" }, { status: 400, headers: cors });

        await env.DB.prepare(
          `UPDATE photos
           SET status = 'ready',
               size_bytes = COALESCE(?, size_bytes),
               caption = COALESCE(?, caption),
               tags = COALESCE(?, tags),
               width = COALESCE(?, width),
               height = COALESCE(?, height),
               captured_at = COALESCE(?, captured_at)
           WHERE id = ?`
        )
          .bind(
            body.sizeBytes || null,
            body.caption || null,
            body.tags || null,
            body.width || null,
            body.height || null,
            body.capturedAt || null,
            body.id
          )
          .run();

        return json({ ok: true, id: body.id }, { headers: cors });
      }

      // 10. Download Original High-Res Photo URL
      if (url.pathname === "/api/download" && request.method === "GET") {
        const id = url.searchParams.get("id");
        if (!id) return json({ error: "id is required" }, { status: 400, headers: cors });
        const row = await env.DB.prepare("SELECT r2_key FROM photos WHERE id = ?").bind(id).first();
        if (!row || !row.r2_key) return json({ error: "not found" }, { status: 404, headers: cors });
        const signedUrl = await signR2(env, row.r2_key, "GET");
        return json({ url: signedUrl }, { headers: cors });
      }

      return new Response("Not found", { status: 404, headers: cors });
    } catch (e) {
      return json({ error: e.message || "server error" }, { status: 500, headers: cors });
    }
  }
};
