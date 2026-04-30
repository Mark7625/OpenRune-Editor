export const CACHE_ICON_SIZE = 128;
export const MAX_SOURCE_ICON_BYTES = 8_000_000;

export async function readImageFileAsDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file");
  }
  if (file.size > MAX_SOURCE_ICON_BYTES) {
    throw new Error(`Image must be under ${Math.round(MAX_SOURCE_ICON_BYTES / 1024 / 1024)} MB`);
  }

  const sourceDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode image"));
    el.src = sourceDataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = CACHE_ICON_SIZE;
  canvas.height = CACHE_ICON_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare icon canvas");

  ctx.clearRect(0, 0, CACHE_ICON_SIZE, CACHE_ICON_SIZE);
  const scale = Math.min(CACHE_ICON_SIZE / img.width, CACHE_ICON_SIZE / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const x = Math.floor((CACHE_ICON_SIZE - w) / 2);
  const y = Math.floor((CACHE_ICON_SIZE - h) / 2);
  ctx.drawImage(img, x, y, w, h);

  const out = canvas.toDataURL("image/webp", 0.82);
  if (!out.startsWith("data:image/")) {
    throw new Error("Could not encode icon");
  }
  return out;
}
