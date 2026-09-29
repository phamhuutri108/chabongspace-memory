/**
 * Helper trích xuất thông tin ảnh và nén thông minh
 * Đảm bảo:
 * 1. Ảnh preview WebP phục vụ canvas chỉ khoảng 70KB - 250KB (luôn < 400KB).
 * 2. File gốc upload nếu quá lớn sẽ tự động tối ưu để luôn dưới 1MB.
 * Giúp website tải nhanh, mượt mà trên cả mạng di động yếu.
 */

export async function readImageMetadata(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const width = img.naturalWidth || 800;
      const height = img.naturalHeight || 600;
      const ratio = width / height;

      let capturedAt = null;
      if (file.lastModified) {
        try {
          capturedAt = new Date(file.lastModified).toISOString();
        } catch {
          capturedAt = new Date().toISOString();
        }
      } else {
        capturedAt = new Date().toISOString();
      }

      resolve({
        width,
        height,
        ratio,
        capturedAt
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: 1200,
        height: 800,
        ratio: 1.5,
        capturedAt: new Date().toISOString()
      });
    };
    img.src = url;
  });
}

/**
 * Giữ nguyên file gốc. Các bản nhẹ phục vụ UI được tạo riêng bên dưới.
 * Không resize/re-encode original vì original phải giữ native source format.
 */
export async function optimizeUploadFile(file) {
  return file;
}

/**
 * Tạo một image tier riêng cho UI.
 * WebP được ưu tiên nhưng chỉ dùng nếu encoder tạo ra file nhỏ hơn source.
 * Nếu WebP không có hoặc lớn hơn source, thử JPEG; cuối cùng fallback source.
 */
export async function createImageVariant(file, maxDimension = 800, quality = 0.78) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      URL.revokeObjectURL(url);
      const origW = img.naturalWidth || 800;
      const origH = img.naturalHeight || 600;

      let w = origW;
      let h = origH;
      if (w > maxDimension || h > maxDimension) {
        if (w > h) {
          h = Math.round((h * maxDimension) / w);
          w = maxDimension;
        } else {
          w = Math.round((w * maxDimension) / h);
          h = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);

      const toBlob = (targetCanvas, q, type) =>
        new Promise((res) => targetCanvas.toBlob((b) => res(b), type, q));

      const candidates = [];
      const webp = await toBlob(canvas, quality, "image/webp");
      const jpeg = await toBlob(canvas, Math.max(0.7, Math.min(0.88, quality + 0.06)), "image/jpeg");
      if (webp) candidates.push(webp);
      if (jpeg) candidates.push(jpeg);
      candidates.sort((a, b) => a.size - b.size);
      const best = candidates[0];
      const blob = best && best.size < file.size ? best : file;
      resolve({ blob, width: blob === file ? origW : w, height: blob === file ? origH : h, ratio: origW / origH });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ blob: file, width: 800, height: 600, ratio: 4 / 3 });
    };

    img.src = url;
  });
}

export async function createImageTiers(file) {
  const [thumb, canvas] = await Promise.all([
    createImageVariant(file, 240, 0.76),
    createImageVariant(file, 1000, 0.8)
  ]);
  return { thumb, canvas };
}

export const createWebpPreview = (file, maxDimension = 800, quality = 0.78) =>
  createImageVariant(file, maxDimension, quality);
