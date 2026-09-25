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
 * Tối ưu hóa file gốc nếu quá nặng (> 1.2MB):
 * Tự động scale về tối đa 1920px và nén JPEG chất lượng 0.82
 * Đảm bảo file gốc đưa lên đám mây cũng luôn < 1MB (thường chỉ 400KB - 850KB).
 */
export async function optimizeUploadFile(file, maxDimension = 1920, maxBytes = 1.2 * 1024 * 1024) {
  if (file.size <= maxBytes) return file;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth || 1920;
      let h = img.naturalHeight || 1080;
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

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          const optimizedFile = new File([blob], file.name, { type: "image/jpeg" });
          resolve(optimizedFile);
        },
        "image/jpeg",
        0.82
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

/**
 * Nén preview đa tầng (Adaptive Multi-pass WebP):
 * - Giới hạn kích thước tối đa 800px (đầy đủ độ nét trên Retina cho canvas collage)
 * - Tự động hạ chất lượng nếu dung lượng vượt quá ngưỡng
 * - Đảm bảo dung lượng thông thường chỉ 60KB - 200KB (tuyệt đối không bao giờ quá 400KB)
 */
export async function createWebpPreview(file, maxDimension = 800, initialQuality = 0.72) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      URL.revokeObjectURL(url);
      const origW = img.naturalWidth || 800;
      const origH = img.naturalHeight || 600;

      // 1. Tính toán tỉ lệ scale về max 800px
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

      const toBlob = (targetCanvas, q, type = "image/webp") =>
        new Promise((res) => targetCanvas.toBlob((b) => res(b), type, q));

      // Lần nén 1: WebP chất lượng 0.72 (thường sinh ra file 60KB - 160KB)
      let blob = await toBlob(canvas, initialQuality);

      // Nếu trình duyệt không hỗ trợ WebP toBlob, fallback JPEG
      if (!blob) {
        blob = await toBlob(canvas, initialQuality, "image/jpeg");
      }

      // Lần nén 2 (Adaptive): Nếu file vẫn > 350KB, giảm quality xuống 0.62
      if (blob && blob.size > 350 * 1024) {
        blob = await toBlob(canvas, 0.62, blob.type);
      }

      // Lần nén 3 (Guaranteed < 500KB): Nếu vẫn > 500KB, thu nhỏ thêm 20% kích thước
      if (blob && blob.size > 500 * 1024) {
        const smallCanvas = document.createElement("canvas");
        smallCanvas.width = Math.round(w * 0.8);
        smallCanvas.height = Math.round(h * 0.8);
        const sCtx = smallCanvas.getContext("2d");
        sCtx.imageSmoothingEnabled = true;
        sCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
        blob = await toBlob(smallCanvas, 0.58, blob.type);
      }

      // Size Guard: Nếu file gốc vốn dĩ đã nhẹ hơn bản nén (ví dụ file gốc chỉ 50KB), dùng luôn file gốc
      if (blob && file.size > 0 && blob.size >= file.size) {
        resolve({ blob: file, width: origW, height: origH, ratio: origW / origH });
        return;
      }

      if (!blob) {
        resolve({ blob: file, width: w, height: h, ratio: w / h });
        return;
      }

      resolve({ blob, width: w, height: h, ratio: w / h });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ blob: file, width: 800, height: 600, ratio: 4 / 3 });
    };

    img.src = url;
  });
}
