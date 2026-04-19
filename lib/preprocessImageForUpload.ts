const MAX_WIDTH = 1024;
const JPEG_QUALITY = 0.8;

/**
 * Resize (max width), keep aspect ratio, encode as JPEG for smaller uploads.
 * Quality is 0.8 per product spec (do not go below).
 */
export function preprocessImageForUpload(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w <= 0 || h <= 0) {
        reject(new Error("Invalid image dimensions"));
        return;
      }
      if (w > MAX_WIDTH) {
        h = (h * MAX_WIDTH) / w;
        w = MAX_WIDTH;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not create canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not encode image"));
            return;
          }
          const base =
            file.name?.replace(/\.[^/.]+$/, "")?.trim() || "photo";
          resolve(new File([blob], `${base}.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}
