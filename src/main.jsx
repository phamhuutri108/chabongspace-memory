import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { readImageMetadata, createImageTiers, optimizeUploadFile } from './utils/media.js';
import {
  getLocalPhotos,
  getUploadJobs,
  putLocalPhoto,
  putUploadJob,
  deleteUploadJob,
  deleteLocalPhoto,
  isLocalStoreAvailable
} from './utils/localStore.js';

const API = '/api';

const Icon = ({ name }) => {
  const d = {
    search: [<circle key="c" cx="11" cy="11" r="6.5" />, <path key="p" d="m16 16 4.2 4.2" />],
    filter: [<path key="1" d="M4 5h16" />, <path key="2" d="M7 12h10" />, <path key="3" d="M10 19h4" />],
    plus: [<path key="1" d="M12 5v14" />, <path key="2" d="M5 12h14" />],
    camera: [<path key="1" d="M4 8.5h3l1.5-2h7L17 8.5h3v9H4z" />, <circle key="2" cx="12" cy="13" r="3" />],
    fit: [<path key="1" d="M8 3H3v5" />, <path key="2" d="M16 3h5v5" />, <path key="3" d="M8 21H3v-5" />, <path key="4" d="M16 21h5v-5" />],
    close: [<path key="1" d="m6 6 12 12" />, <path key="2" d="m18 6-12 12" />],
    capture: [<circle key="1" cx="12" cy="12" r="6.5" />],
    enter: [<path key="1" d="M4 12h11" />, <path key="2" d="m11 7 5 5-5 5" />, <path key="3" d="M20 5v14" />],
    download: [<path key="1" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />, <polyline key="2" points="7 10 12 15 17 10" />, <line key="3" x1="12" y1="15" x2="12" y2="3" />],
    trash: [<polyline key="1" points="3 6 5 6 21 6" />, <path key="2" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />],
    edit: [<path key="1" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />, <path key="2" d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />],
    prev: [<polyline key="1" points="15 18 9 12 15 6" />],
    next: [<polyline key="1" points="9 18 15 12 9 6" />]
  }[name];
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d}
    </svg>
  );
};

const demo = Array.from({ length: 50 }, (_, i) => {
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const day = String(((i * 7) % 27) + 1).padStart(2, '0');
  const month = months[i % 12];
  const captions = [
    'một ngày rất bình thường',
    'ăn cùng nhau',
    'đi đâu đó',
    'những buổi chiều',
    'ở nhà',
    'một chuyến đi',
    'cà phê sáng',
    'sunset',
    'tiny moments',
    'just us'
  ];
  const h = i % 3 === 0 ? 1100 : i % 3 === 1 ? 750 : 900;
  return {
    id: 'demo-' + (i + 1),
    src: `https://picsum.photos/seed/chabong-memory-${i + 1}/900/${h}`,
    ratio: 900 / h,
    date: `2026-${month}-${day}`,
    tag: ['us', 'food', 'trip', 'home', 'travel'][i % 5],
    caption: captions[i % captions.length]
  };
});

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function getViewportPhotoIds(items, zoom, offset, viewportWidth, viewportHeight, margin = 700) {
  if (!items.length || !viewportWidth || !viewportHeight) return new Set(items.map((item) => item.id));
  const safeZoom = Math.max(zoom, 0.0001);
  const left = (-offset.x - margin) / safeZoom;
  const top = (-offset.y - margin) / safeZoom;
  const right = (viewportWidth - offset.x + margin) / safeZoom;
  const bottom = (viewportHeight - offset.y + margin) / safeZoom;
  const ids = new Set();
  for (const item of items) {
    if (item.x < right && item.x + item.w > left && item.y < bottom && item.y + item.h > top) ids.add(item.id);
  }
  return ids;
}

function sameIdSet(a, b) {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

function buildCollage(items) {
  if (!items.length) return { items: [], bounds: { x: 0, y: 0, w: 1, h: 1 } };
  const gap = 34;
  const maxRowWidth = 2500;
  const baseHeights = [300, 215, 235, 200, 285, 220, 245];
  const ordered = [...items].map((item, i) => ({ ...item, __index: i }));
  const rows = [];
  let row = [];
  let estimated = 0;
  ordered.forEach((item, i) => {
    const h = baseHeights[i % baseHeights.length];
    const w = clamp((item.ratio || 1) * h, 120, 430);
    if (row.length && estimated + w + gap > maxRowWidth) {
      rows.push(row);
      row = [];
      estimated = 0;
    }
    row.push({ item, h, w });
    estimated += w + gap;
  });
  if (row.length) rows.push(row);

  const rects = [];
  let y = 0;
  rows.forEach((r, rowIndex) => {
    const rowGap = 42;
    const natural = r.reduce((s, x) => s + x.w, 0) + gap * (r.length - 1);
    const scale = natural > maxRowWidth ? maxRowWidth / natural : 1;
    const heights = r.map((x) => x.h * scale);
    const widths = r.map((x) => x.w * scale);
    const used = widths.reduce((s, w) => s + w, 0) + gap * (r.length - 1);
    const stagger = ((rowIndex % 3) - 1) * 105;
    let x = (maxRowWidth - used) / 2 + stagger;
    r.forEach((xItem, i) => {
      const h = heights[i],
        w = widths[i];
      rects.push({ id: xItem.item.id, x, y, w, h });
      x += w + gap;
    });
    y += Math.max(...heights) + rowGap;
  });

  const minX = Math.min(...rects.map((r) => r.x)),
    minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w)),
    maxY = Math.max(...rects.map((r) => r.y + r.h));
  const pad = 70;
  const shifted = rects.map((r) => ({ ...r, x: r.x - minX + pad, y: r.y - minY + pad }));
  const bounds = { x: 0, y: 0, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  const map = new Map(shifted.map((r) => [r.id, r]));
  return { items: items.map((item) => map.get(item.id)), bounds };
}

function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('memory-auth') === '1');
  const [password, setPassword] = useState('');
  const [photos, setPhotos] = useState(demo);
  const [availableTags, setAvailableTags] = useState(['us', 'trip', 'home', 'food']);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [editTags, setEditTags] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [zoom, setZoom] = useState(0.2);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [culledIds, setCulledIds] = useState(null);

  const fileRef = useRef(),
    videoRef = useRef(),
    streamRef = useRef(),
    viewportRef = useRef(null),
    worldRef = useRef(null),
    transformRef = useRef({ zoom: 0.2, offset: { x: 0, y: 0 } }),
    cullFrameRef = useRef(null);
  const pointers = useRef(new Map()),
    panRef = useRef(null),
    pinchRef = useRef(null),
    lightboxTouchRef = useRef(null);
  const userInteracted = useRef(false);
  const queueRunningRef = useRef(false);
  const retryTimerRef = useRef(null);

  // Check auth session
  useEffect(() => {
    fetch(API + '/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { authed: false }))
      .then((res) => {
        if (res.authed) {
          setAuthed(true);
          sessionStorage.setItem('memory-auth', '1');
        }
      })
      .catch(() => {});
  }, []);

  function localRecordToPhoto(record) {
    const canvasSrc = record.canvasBlob ? URL.createObjectURL(record.canvasBlob) : null;
    const thumbSrc = record.thumbBlob ? URL.createObjectURL(record.thumbBlob) : canvasSrc;
    const originalSrc = record.fileBlob ? URL.createObjectURL(record.fileBlob) : null;
    return {
      id: record.id,
      src: canvasSrc,
      thumbSrc,
      originalSrc,
      ratio: record.ratio || 1,
      date: (record.capturedAt || record.createdAt || new Date().toISOString()).slice(0, 10),
      tag: record.tags || 'upload',
      caption: record.caption || '',
      syncState: record.state || 'ready',
      syncError: record.error || ''
    };
  }

  async function hydrateLocalPhotos() {
    if (!isLocalStoreAvailable()) return;
    try {
      const records = await getLocalPhotos();
      const local = records
        .filter((record) => record.state === 'pending' || record.state === 'uploading')
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map(localRecordToPhoto);
      if (local.length) setPhotos((current) => [...local, ...current.filter((p) => !local.some((x) => x.id === p.id))]);
    } catch {}
  }

  // Fetch photos from D1 database
  const loadPhotos = () => {
    if (!authed) return;
    const params = new URLSearchParams();
    params.set('limit', '250');
    if (query) params.set('q', query);
    if (activeFilter) params.set('tag', activeFilter);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);

    fetch(API + '/photos?' + params.toString(), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { photos: [] }))
      .then((res) => {
        const rows = res.photos || (Array.isArray(res) ? res : []);
        if (rows.length) {
          const serverPhotos = rows.map((p) => ({
              ...p,
              src: (p.canvas_key || p.preview_key) ? '/media/' + (p.canvas_key || p.preview_key) : null,
              thumbSrc: p.thumb_key ? '/media/' + p.thumb_key : (p.canvas_key || p.preview_key) ? '/media/' + (p.canvas_key || p.preview_key) : null,
              originalSrc: p.r2_key ? '/media/' + p.r2_key : null,
              date: (p.captured_at || p.created_at || '').slice(0, 10),
              tag: p.tags || '',
              caption: p.caption || '',
              ratio: p.width && p.height ? p.width / p.height : 1,
              syncState: 'ready'
            }));
          getLocalPhotos()
            .then((records) => {
              const pending = records
                .filter((record) => record.state === 'pending' || record.state === 'uploading')
                .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
                .map(localRecordToPhoto);
              setPhotos([...pending, ...serverPhotos.filter((p) => !pending.some((x) => x.id === p.id))]);
            })
            .catch(() => setPhotos(serverPhotos));
        } else {
          hydrateLocalPhotos();
        }
      })
      .catch(() => {});

    // Fetch dynamic tags list
    fetch(API + '/tags', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((tags) => {
        if (Array.isArray(tags) && tags.length) {
          const merged = Array.from(new Set([...tags, 'us', 'trip', 'home']));
          setAvailableTags(merged);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadPhotos();
    if (authed) hydrateLocalPhotos();
  }, [authed, query, activeFilter, dateFrom, dateTo]);

  // Client-side filtering fallback for demo mode
  const visible = useMemo(() => {
    return photos.filter((p) => {
      const titleMatch = !query || String(p.caption || '').toLowerCase().includes(query.toLowerCase());
      const f = String(activeFilter || '').toLowerCase();
      let filterMatch = true;
      if (dateFrom || dateTo) {
        const d = String(p.date || '');
        filterMatch = (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
      } else if (f) {
        filterMatch = String(p.tag || '').toLowerCase().includes(f);
      }
      return titleMatch && filterMatch;
    });
  }, [photos, query, activeFilter, dateFrom, dateTo]);

  const layout = useMemo(() => buildCollage(visible), [visible]);

  function applyTransform(nextZoom, nextOffset) {
    const next = {
      zoom: clamp(nextZoom, 0.035, 4),
      offset: { x: nextOffset.x, y: nextOffset.y }
    };
    transformRef.current = next;
    if (worldRef.current) {
      worldRef.current.style.transform =
        `translate3d(${next.offset.x}px,${next.offset.y}px,0) scale(${next.zoom})`;
    }
    return next;
  }

  function scheduleViewportCull(items = layout.items) {
    if (cullFrameRef.current) return;
    cullFrameRef.current = requestAnimationFrame(() => {
      cullFrameRef.current = null;
      const viewport = viewportRef.current;
      if (!viewport) return;
      const current = transformRef.current;
      const nextIds = getViewportPhotoIds(
        items,
        current.zoom,
        current.offset,
        viewport.clientWidth,
        viewport.clientHeight
      );
      setCulledIds((previous) => (sameIdSet(previous, nextIds) ? previous : nextIds));
    });
  }

  useEffect(() => {
    setCulledIds(null);
    scheduleViewportCull(layout.items);
    return () => {
      if (cullFrameRef.current) {
        cancelAnimationFrame(cullFrameRef.current);
        cullFrameRef.current = null;
      }
    };
  }, [layout]);

  function fitLayout(nextLayout = layout) {
    if (!nextLayout.items.length) return;
    const vw = window.innerWidth,
      vh = window.innerHeight;
    const marginX = 48,
      marginY = 150;
    const z = clamp(Math.min((vw - marginX * 2) / nextLayout.bounds.w, (vh - marginY * 2) / nextLayout.bounds.h), 0.035, 1.25);
    const nextOffset = { x: (vw - nextLayout.bounds.w * z) / 2, y: (vh - nextLayout.bounds.h * z) / 2 + 45 };
    applyTransform(z, nextOffset);
    setZoom(z);
    setOffset(nextOffset);
    scheduleViewportCull(nextLayout.items);
  }

  useEffect(() => {
    if (!authed || !layout.items.length || userInteracted.current) return;
    const t = setTimeout(() => fitLayout(layout), 90);
    return () => clearTimeout(t);
  }, [authed, photos.length, layout.bounds.w, layout.bounds.h]);

  useEffect(() => {
    const onResize = () => {
      if (!userInteracted.current) fitLayout(layout);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [layout]);

  // Close overlays on ESC
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (selected) {
          setSelected(null);
          setEditing(false);
        } else {
          setSearchOpen(false);
          setFilterOpen(false);
        }
      } else if (selected && !editing) {
        if (e.key === 'ArrowRight') navigateLightbox(1);
        if (e.key === 'ArrowLeft') navigateLightbox(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, editing, visible]);

  async function login(e) {
    e.preventDefault();
    try {
      const res = await fetch(API + '/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        sessionStorage.setItem('memory-auth', '1');
        setAuthed(true);
      } else {
        alert(data.error || 'Password không đúng');
      }
    } catch {
      if (password === '04112003') {
        sessionStorage.setItem('memory-auth', '1');
        setAuthed(true);
      } else {
        alert('Password không đúng');
      }
    }
  }

  function clampZoom(v) {
    return clamp(v, 0.035, 4);
  }

  function zoomAt(next, clientX, clientY) {
    const z = clampZoom(next),
      rect = document.querySelector('.viewport')?.getBoundingClientRect();
    if (!rect) return;
    const current = transformRef.current;
    const px = clientX - rect.left,
      py = clientY - rect.top;
    const nextOffset = {
      x: px - (px - current.offset.x) * (z / current.zoom),
      y: py - (py - current.offset.y) * (z / current.zoom)
    };
    applyTransform(z, nextOffset);
    scheduleViewportCull();
  }

  function onWheel(e) {
    e.preventDefault();
    userInteracted.current = true;
    zoomAt(zoom * Math.exp(-e.deltaY * 0.001), e.clientX, e.clientY);
  }

  function onPointerDown(e) {
    userInteracted.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      panRef.current = {
        x: e.clientX,
        y: e.clientY,
        startX: transformRef.current.offset.x,
        startY: transformRef.current.offset.y
      };
    } else if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      pinchRef.current = {
        distance: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
        zoom: transformRef.current.zoom,
        midpoint: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        startOffset: { ...transformRef.current.offset }
      };
      panRef.current = null;
    }
  }

  function onPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchRef.current) {
      const pts = [...pointers.current.values()];
      const midpoint = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const distance = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      const scale = clamp(distance / pinchRef.current.distance, 0.1, 10);
      const nextZoom = clampZoom(pinchRef.current.zoom * scale);

      const start = { ...pinchRef.current };
      const worldX = (start.midpoint.x - start.startOffset.x) / start.zoom;
      const worldY = (start.midpoint.y - start.startOffset.y) / start.zoom;
      const nextOffset = {
        x: midpoint.x - worldX * nextZoom,
        y: midpoint.y - worldY * nextZoom
      };
      applyTransform(nextZoom, nextOffset);
      scheduleViewportCull();
      return;
    }

    if (panRef.current && pointers.current.size === 1) {
      const nextOffset = {
        x: panRef.current.startX + (e.clientX - panRef.current.x),
        y: panRef.current.startY + (e.clientY - panRef.current.y)
      };
      applyTransform(transformRef.current.zoom, nextOffset);
      scheduleViewportCull();
    }
  }

  function onPointerUp(e) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      panRef.current = null;
      pinchRef.current = null;
      const current = transformRef.current;
      setZoom(current.zoom);
      setOffset(current.offset);
      scheduleViewportCull();
    }
  }

  // Phase 5: local-first upload pipeline.
  async function prepareUpload(rawFile) {
    const file = await optimizeUploadFile(rawFile);
    const id = crypto.randomUUID();
    const meta = await readImageMetadata(file);
    const { thumb, canvas } = await createImageTiers(file);
    const canvasBlob = canvas?.blob || null;
    const thumbBlob = thumb?.blob || null;
    const caption = file.name.replace(/\.[^/.]+$/, '');
    const createdAt = new Date().toISOString();

    const record = {
      id,
      fileBlob: file,
      thumbBlob,
      canvasBlob,
      width: meta.width,
      height: meta.height,
      ratio: meta.ratio || 1,
      sizeBytes: file.size,
      mimeType: file.type || 'image/jpeg',
      caption,
      tags: 'upload',
      capturedAt: meta.capturedAt || createdAt,
      createdAt,
      state: 'pending',
      attempt: 0,
      error: ''
    };

    await putLocalPhoto(record);
    await putUploadJob({
      ...record,
      updatedAt: createdAt
    });
    return localRecordToPhoto(record);
  }

  async function sendUploadJob(job) {
    const uploadName = (blob, fallback) => {
      if (!blob) return fallback;
      const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'bin';
      return `${fallback}.${ext}`;
    };
    const formData = new FormData();
    formData.append('file', job.fileBlob, job.fileBlob.name || 'memory');
    if (job.thumbBlob) formData.append('thumb', job.thumbBlob, uploadName(job.thumbBlob, 'thumb'));
    if (job.canvasBlob) formData.append('canvas', job.canvasBlob, uploadName(job.canvasBlob, 'canvas'));
    formData.append('id', job.id);
    formData.append('caption', job.caption || '');
    formData.append('tags', job.tags || '');
    formData.append('capturedAt', job.capturedAt);
    formData.append('width', String(job.width || ''));
    formData.append('height', String(job.height || ''));
    formData.append('sizeBytes', String(job.sizeBytes || job.fileBlob.size));
    formData.append('mimeType', job.mimeType || job.fileBlob.type || 'image/jpeg');

    const res = await fetch(API + '/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Lỗi server (' + res.status + ')');
    }
    return res.json();
  }

  async function processUploadQueue() {
    if (!isLocalStoreAvailable() || queueRunningRef.current || !authed) return;
    queueRunningRef.current = true;
    setSyncing(true);
    try {
      const jobs = await getUploadJobs();
      for (const job of jobs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
        const attempt = Number(job.attempt || 0) + 1;
        const uploading = { ...job, state: 'uploading', attempt, error: '', updatedAt: new Date().toISOString() };
        await putUploadJob(uploading);
        await putLocalPhoto(uploading);
        setPhotos((current) => current.map((p) => p.id === job.id ? { ...p, syncState: 'uploading', syncError: '' } : p));

        try {
          const result = await sendUploadJob(uploading);
          await deleteUploadJob(job.id);
          const ready = { ...uploading, state: 'ready', error: '', serverKey: result.key, canvasKey: result.canvasKey, thumbKey: result.thumbKey };
          await putLocalPhoto(ready);
          setPhotos((current) => current.map((p) => p.id === job.id ? {
            ...p,
            syncState: 'ready',
            syncError: '',
            src: result.canvasKey ? '/media/' + result.canvasKey : p.src,
            thumbSrc: result.thumbKey ? '/media/' + result.thumbKey : p.thumbSrc,
            originalSrc: result.key ? '/media/' + result.key : p.originalSrc
          } : p));
        } catch (error) {
          const failed = { ...uploading, state: 'pending', error: error.message || 'Upload failed', updatedAt: new Date().toISOString() };
          await putUploadJob(failed);
          await putLocalPhoto(failed);
          setPhotos((current) => current.map((p) => p.id === job.id ? { ...p, syncState: 'pending', syncError: failed.error } : p));
          if (!retryTimerRef.current) {
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              processUploadQueue();
            }, 5000);
          }
        }
      }
    } catch {} finally {
      queueRunningRef.current = false;
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!authed) return;
    processUploadQueue();
    const onOnline = () => processUploadQueue();
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [authed]);

  async function queueUpload(rawFile) {
    const item = await prepareUpload(rawFile);
    setPhotos((current) => [item, ...current.filter((p) => p.id !== item.id)]);
    processUploadQueue();
    return item;
  }

  async function upload(e) {
    if (!e.target.files?.length) return;
    setBusy(true);
    try {
      for (const file of [...e.target.files]) {
        await queueUpload(file);
      }
    } catch (err) {
      alert('Không thể lưu ảnh cục bộ: ' + (err.message || 'IndexedDB error'));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      streamRef.current = s;
      setCamera(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play();
        }
      });
    } catch {
      alert('Không thể mở camera. Hãy cấp quyền camera.');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera(false);
  }

  function capture() {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement('canvas');
    const maxW = 1920;
    let cw = v.videoWidth || 1920;
    let ch = v.videoHeight || 1080;
    if (cw > maxW) {
      ch = Math.round((ch * maxW) / cw);
      cw = maxW;
    }
    c.width = cw;
    c.height = ch;
    c.getContext('2d').drawImage(v, 0, 0, cw, ch);
    c.toBlob(
      async (b) => {
        if (!b) {
          alert('Không thể tạo file từ camera');
          return;
        }
        const file = new File([b], 'memory-' + Date.now() + '.jpg', { type: 'image/jpeg' });
        try {
          await queueUpload(file);
          stopCamera();
        } catch (err) {
          alert('Không thể lưu ảnh: ' + (err.message || 'Lỗi không xác định'));
        }
      },
      'image/jpeg',
      0.82
    );
  }

  // Lightbox Actions
  function navigateLightbox(dir) {
    if (!selected) return;
    const currentIndex = visible.findIndex((p) => p.id === selected.id);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + dir + visible.length) % visible.length;
    setSelected(visible[nextIndex]);
    setEditing(false);
  }

  async function handleDeletePhoto(id) {
    if (!window.confirm('Bạn có chắc chắn muốn xóa kỷ niệm này?')) return;
    try {
      await fetch(API + '/photos/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id })
      });
    } catch {}
    if (isLocalStoreAvailable()) {
      deleteUploadJob(id).catch(() => {});
      deleteLocalPhoto(id).catch(() => {});
    }
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setSelected(null);
    setEditing(false);
  }

  async function handleSaveEdit() {
    if (!selected) return;
    try {
      await fetch(API + '/photos/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: selected.id, caption: editCaption, tags: editTags })
      });
    } catch {}
    setPhotos((prev) =>
      prev.map((p) => (p.id === selected.id ? { ...p, caption: editCaption, tag: editTags } : p))
    );
    setSelected((prev) => (prev ? { ...prev, caption: editCaption, tag: editTags } : null));
    setEditing(false);
  }

  function handleDownloadOriginal(photo) {
    if (!photo) return;
    const downloadUrl = API + '/download?id=' + photo.id;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = (photo.caption || 'memory') + '.jpg';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  if (!authed) {
    return (
      <main className="gate">
        <div className="gate-card">
          <div className="mark">♡</div>
          <p className="eyebrow">CHÀ BÔNG SPACE</p>
          <h1>
            our little
            <br />
            <i>memory</i>
          </h1>
          <p className="muted">một nơi chỉ dành cho những điều mình muốn giữ lại.</p>
          <form onSubmit={login}>
            <input
              autoFocus
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="icon-button" aria-label="Enter" title="Enter">
              <Icon name="enter" />
            </button>
          </form>
          <small className="scaffold">protected memory gallery</small>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <header>
        <div className="count">{visible.length} memories</div>
      </header>

      <div className="canvas-controls">
        <button
          className="icon-button"
          onClick={() => fitLayout()}
          aria-label="Fit canvas"
          title="Fit canvas"
        >
          <Icon name="fit" />
        </button>
      </div>

      <div className="actions">
        <button
          className="icon-button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          aria-label="Add photos"
          title="Add photos"
        >
          <Icon name="plus" />
        </button>
        <button className="icon-button" onClick={startCamera} aria-label="Camera" title="Camera">
          <Icon name="camera" />
        </button>
        <input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={upload} />
      </div>

      <section className="toolbar">
        <div className="tool-row">
          <button
            className="icon-button"
            onClick={() => {
              setSearchOpen((v) => !v);
              setFilterOpen(false);
            }}
            aria-label="Search"
            title="Search"
          >
            <Icon name="search" />
          </button>
          <div className="filter-wrap">
            <button
              className="icon-button"
              onClick={() => {
                setFilterOpen((v) => !v);
                setSearchOpen(false);
              }}
              aria-label="Filter"
              title="Filter"
            >
              <Icon name="filter" />
            </button>
            {filterOpen && (
              <div className="filters">
                <button
                  className="clear-filter"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setActiveFilter('');
                  }}
                >
                  Clear filter
                </button>
                <div className="filter-section date-filter">
                  <span>Khoảng ngày</span>
                  <div className="range-calendar">
                    <label>
                      <small>From</small>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      <small>To</small>
                      <input
                        type="date"
                        value={dateTo}
                        min={dateFrom || undefined}
                        onChange={(e) => setDateTo(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
                <div className="filter-section">
                  <span>Albums & tags</span>
                  <div className="tag-list">
                    {availableTags.map((tag) => (
                      <button
                        key={tag}
                        className={activeFilter === tag ? 'active' : ''}
                        onClick={() => {
                          setActiveFilter(activeFilter === tag ? '' : tag);
                          setFilterOpen(false);
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        {searchOpen && (
          <div className="search-row">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, tag, caption…"
            />
          </div>
        )}
      </section>

      <section
        ref={viewportRef}
        className="viewport"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          ref={worldRef}
          className="world"
          style={{ transform: `translate3d(${transformRef.current.offset.x}px,${transformRef.current.offset.y}px,0) scale(${transformRef.current.zoom})` }}
        >
          {visible.map((p, i) => {
            const pos = layout.items[i];
            if (!pos) return null;
            if (culledIds && !culledIds.has(p.id)) return null;
            return (
              <article
                key={p.id}
                className="photo"
                style={{ left: pos.x, top: pos.y, width: pos.w }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(p);
                  setEditing(false);
                  setEditCaption(p.caption || '');
                  setEditTags(p.tag || '');
                }}
              >
                <img
                  src={p.thumbSrc || p.src}
                  data-canvas-src={p.src || ''}
                  loading="lazy"
                  decoding="async"
                  draggable="false"
                  alt={p.caption || 'memory'}
                  onLoad={(e) => {
                    const canvasSrc = e.currentTarget.dataset.canvasSrc;
                    if (canvasSrc && e.currentTarget.src !== new URL(canvasSrc, window.location.href).href) {
                      e.currentTarget.src = canvasSrc;
                    }
                    const r = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight;
                    if (Number.isFinite(r) && Math.abs((p.ratio || 1) - r) > 0.01) {
                      setPhotos((xs) => xs.map((x) => (x.id === p.id ? { ...x, ratio: r } : x)));
                    }
                  }}
                />
              </article>
            );
          })}
        </div>
      </section>

      {/* Lightbox Modal */}
      {selected && (
        <div
          className="lightbox"
          onClick={() => {
            setSelected(null);
            setEditing(false);
          }}
          onTouchStart={(e) => {
            const touch = e.touches[0];
            lightboxTouchRef.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(e) => {
            const start = lightboxTouchRef.current;
            if (!start) return;
            const touch = e.changedTouches[0];
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            lightboxTouchRef.current = null;
            if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
            navigateLightbox(dx < 0 ? 1 : -1);
          }}
        >
          <div className="lightbox-nav" onClick={(e) => e.stopPropagation()}>
            <button
              className="icon-button"
              onClick={() => navigateLightbox(-1)}
              aria-label="Previous"
              title="Previous"
            >
              <Icon name="prev" />
            </button>
            <button
              className="icon-button"
              onClick={() => navigateLightbox(1)}
              aria-label="Next"
              title="Next"
            >
              <Icon name="next" />
            </button>
          </div>

          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={selected.originalSrc || selected.src} alt={selected.caption} />
          </div>

          <div className="lightbox-info" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-details">
              {editing ? (
                <div className="lightbox-edit-form">
                  <input
                    type="text"
                    value={editCaption}
                    placeholder="Caption..."
                    onChange={(e) => setEditCaption(e.target.value)}
                  />
                  <input
                    type="text"
                    value={editTags}
                    placeholder="Tags (phân cách bởi dấu phẩy)..."
                    onChange={(e) => setEditTags(e.target.value)}
                  />
                  <div className="edit-buttons">
                    <button onClick={handleSaveEdit}>Lưu</button>
                    <button className="cancel" onClick={() => setEditing(false)}>
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <b>{selected.caption || 'Không có tiêu đề'}</b>
                  <small>
                    {selected.date} {selected.tag ? `· #${selected.tag}` : ''}
                  </small>
                </>
              )}
            </div>

            <div className="lightbox-actions">
              <button
                className="icon-button"
                onClick={() => {
                  setEditing((v) => !v);
                  setEditCaption(selected.caption || '');
                  setEditTags(selected.tag || '');
                }}
                aria-label="Edit"
                title="Chỉnh sửa caption/tags"
              >
                <Icon name="edit" />
              </button>
              <button
                className="icon-button"
                onClick={() => handleDownloadOriginal(selected)}
                aria-label="Download original"
                title="Tải ảnh gốc"
              >
                <Icon name="download" />
              </button>
              <button
                className="icon-button"
                onClick={() => handleDeletePhoto(selected.id)}
                aria-label="Delete"
                title="Xóa ảnh"
              >
                <Icon name="trash" />
              </button>
              <button
                className="icon-button"
                onClick={() => {
                  setSelected(null);
                  setEditing(false);
                }}
                aria-label="Close"
                title="Đóng"
              >
                <Icon name="close" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Capture Modal */}
      {camera && (
        <div className="camera">
          <video ref={videoRef} playsInline muted />
          <div>
            <button
              className="icon-button"
              onClick={capture}
              aria-label="Capture"
              title="Capture"
            >
              <Icon name="capture" />
            </button>
            <button
              className="icon-button"
              onClick={stopCamera}
              aria-label="Close camera"
              title="Close"
            >
              <Icon name="close" />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('app')).render(<App />);
