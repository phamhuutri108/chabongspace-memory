/**
 * Helper trích xuất thông tin ảnh và nén preview WebP tại trình duyệt
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

      // Lấy thời gian chụp / sửa đổi từ file
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

export async function createWebpPreview(file, maxDimension = 1400, quality = 0.82) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth || 800;
      let h = img.naturalHeight || 600;

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
          if (!blob) {
            // fallback nếu không toBlob được
            resolve({ blob: file, width: w, height: h, ratio: w / h });
            return;
          }
          resolve({ blob, width: w, height: h, ratio: w / h });
        },
        "image/webp",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ blob: file, width: 800, height: 600, ratio: 4 / 3 });
    };
    img.src = url;
  });
}
