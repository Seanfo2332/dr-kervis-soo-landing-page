// Turns the photo an editor picks into the two files the website needs: a full-size copy and a 640px copy.
// This runs in the editor's browser, so the server never has to open an untrusted image.
const FULL_MAX_WIDTH = 1600;
const SMALL_WIDTH = 640;
const SMALL_QUALITY = 0.8;
const FULL_QUALITIES = [0.82, 0.7, 0.55];
const FULL_BUDGET_BYTES = 1.5 * 1024 * 1024;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;
const BACKGROUND = '#ffffff';

const fail = (message) => { throw new Error(message); };

async function decode(file) {
  if (self.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fall through to the <img> route below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawn(source, width) {
  const scale = Math.min(1, width / (source.naturalWidth || source.width));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((source.naturalWidth || source.width) * scale));
  canvas.height = Math.max(1, Math.round((source.naturalHeight || source.height) * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// WebP where the browser can make it, otherwise JPEG. Both copies always share one type.
async function encodeFull(canvas) {
  let type = 'image/webp';
  let blob = await toBlob(canvas, type, FULL_QUALITIES[0]);
  if (!blob || blob.type !== type) {
    type = 'image/jpeg';
    blob = await toBlob(canvas, type, FULL_QUALITIES[0]);
  }
  for (const quality of FULL_QUALITIES.slice(1)) {
    if (blob.size <= FULL_BUDGET_BYTES) break;
    blob = await toBlob(canvas, type, quality);
  }
  return { blob, type };
}

export async function prepareImage(file) {
  if (!file.type.startsWith('image/')) fail('这不是图片文件，请选择 JPG、PNG 或 WebP 图片。');
  if (file.size > MAX_INPUT_BYTES) fail('这张图片太大了，请换一张小于 30 MB 的图片。');
  let source;
  try {
    source = await decode(file);
  } catch {
    fail('这张图片的格式暂时不支持，请换成 JPG、PNG 或 WebP 图片。');
  }
  const fullCanvas = drawn(source, FULL_MAX_WIDTH);
  const { blob: fullBlob, type } = await encodeFull(fullCanvas);
  const smallBlob = await toBlob(drawn(source, SMALL_WIDTH), type, SMALL_QUALITY);
  if (!fullBlob || !smallBlob) fail('图片处理失败，请换一张图片再试。');
  return {
    full: await toBase64(fullBlob), small: await toBase64(smallBlob),
    width: fullCanvas.width, height: fullCanvas.height, previewUrl: URL.createObjectURL(smallBlob),
  };
}
