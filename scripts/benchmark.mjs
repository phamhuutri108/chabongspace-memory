import { performance } from 'node:perf_hooks';

function makePhotos(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `bench-${i}`,
    ratio: [0.75, 1, 1.33, 1.78][i % 4]
  }));
}

function buildCollage(items) {
  const gap = 34;
  const maxRowWidth = 2500;
  const baseHeights = [300, 215, 235, 200, 285, 220, 245];
  const rows = [];
  let row = [];
  let estimated = 0;
  items.forEach((item, i) => {
    const h = baseHeights[i % baseHeights.length];
    const w = Math.min(430, Math.max(120, item.ratio * h));
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
  rows.forEach((r) => {
    const natural = r.reduce((s, x) => s + x.w, 0) + gap * (r.length - 1);
    const scale = natural > maxRowWidth ? maxRowWidth / natural : 1;
    const heights = r.map((x) => x.h * scale);
    const widths = r.map((x) => x.w * scale);
    let x = (maxRowWidth - (widths.reduce((s, w) => s + w, 0) + gap * (r.length - 1))) / 2;
    r.forEach((xItem, i) => {
      rects.push({ id: xItem.item.id, x, y, w: widths[i], h: heights[i] });
      x += widths[i] + gap;
    });
    y += Math.max(...heights) + 42;
  });
  return rects;
}

function cull(rects, viewport = { width: 1179, height: 800 }, zoom = 0.2, offset = { x: 0, y: 0 }) {
  const margin = 700;
  const left = (-offset.x - margin) / zoom;
  const top = (-offset.y - margin) / zoom;
  const right = (viewport.width - offset.x + margin) / zoom;
  const bottom = (viewport.height - offset.y + margin) / zoom;
  return rects.filter((r) => r.x < right && r.x + r.w > left && r.y < bottom && r.y + r.h > top).length;
}

const counts = [500, 1000, 2000];
console.log('Phase 10 synthetic renderer benchmark (Node, no browser/network)');
console.log('Dataset | Layout ms | Culling ms | Mounted');
for (const count of counts) {
  const photos = makePhotos(count);
  const t0 = performance.now();
  const rects = buildCollage(photos);
  const layoutMs = performance.now() - t0;
  const t1 = performance.now();
  const mounted = cull(rects);
  const cullMs = performance.now() - t1;
  console.log(`${count} | ${layoutMs.toFixed(2)} | ${cullMs.toFixed(2)} | ${mounted}`);
}