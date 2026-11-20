/** Header slot 148×32 的 3× 输出，与顶栏显示比例一致 */
const TARGET_W = 444;
const TARGET_H = 96;

/** 浏览器标签页 favicon 正方形输出（尽量大，便于高清屏缩放） */
const FAVICON_TARGET = 256;
/** 画布内留白 */
const FAVICON_CONTENT_PADDING = 0.001;

type LogoNormalizeMode = 'light' | 'dark';

const WHITE_THRESHOLD = 245;
const BLACK_THRESHOLD = 10;
const ALPHA_THRESHOLD = 10;
const CONTENT_PADDING = 0.06;
const MAX_SCAN_EDGE = 2000;

/** 浅色 Logo：去掉透明/近白底。深色 Logo：去掉透明/近黑底，保留白字。 */
function isContentPixel(
  r: number,
  g: number,
  b: number,
  a: number,
  mode: LogoNormalizeMode,
): boolean {
  if (a <= ALPHA_THRESHOLD) return false;
  if (mode === 'dark') {
    if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) return false;
    return true;
  }
  if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) return false;
  return true;
}

function findContentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mode: LogoNormalizeMode,
) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (isContentPixel(data[i], data[i + 1], data[i + 2], data[i + 3], mode)) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) return null;
  return { minX, minY, maxX, maxY };
}

async function loadRasterSource(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load image'));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawToScanCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const maxEdge = Math.max(width, height);
  const scale = maxEdge > MAX_SCAN_EDGE ? MAX_SCAN_EDGE / maxEdge : 1;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

function canvasToPngFile(canvas: HTMLCanvasElement, originalName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to export PNG'));
        return;
      }
      const base = originalName.replace(/\.[^.]+$/, '') || 'logo';
      resolve(new File([blob], `${base}.png`, { type: 'image/png', lastModified: Date.now() }));
    }, 'image/png');
  });
}

/**
 * 上传前按主题抠边，并铺到与顶栏槽位同比例的横条画布上。
 * SVG 不处理，原样返回。
 */
async function normalizeSiteLogoFileByMode(file: File, mode: LogoNormalizeMode): Promise<File> {
  if (file.type === 'image/svg+xml') {
    return file;
  }

  const { source, width, height } = await loadRasterSource(file);
  try {
    const scanCanvas = drawToScanCanvas(source, width, height);
    const scanCtx = scanCanvas.getContext('2d');
    if (!scanCtx) throw new Error('Canvas not supported');

    const { width: scanW, height: scanH } = scanCanvas;
    const { data } = scanCtx.getImageData(0, 0, scanW, scanH);
    const bounds = findContentBounds(data, scanW, scanH, mode);
    if (!bounds) throw new Error('No visible logo content');

    const cropW = bounds.maxX - bounds.minX + 1;
    const cropH = bounds.maxY - bounds.minY + 1;

    const padX = TARGET_W * CONTENT_PADDING;
    const padY = TARGET_H * CONTENT_PADDING;
    const innerW = TARGET_W - padX * 2;
    const innerH = TARGET_H - padY * 2;
    const fitScale = Math.min(innerW / cropW, innerH / cropH);
    const drawW = cropW * fitScale;
    const drawH = cropH * fitScale;
    const drawX = (TARGET_W - drawW) / 2;
    const drawY = (TARGET_H - drawH) / 2;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = TARGET_W;
    outCanvas.height = TARGET_H;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) throw new Error('Canvas not supported');

    outCtx.clearRect(0, 0, TARGET_W, TARGET_H);
    outCtx.drawImage(
      scanCanvas,
      bounds.minX,
      bounds.minY,
      cropW,
      cropH,
      drawX,
      drawY,
      drawW,
      drawH,
    );

    return canvasToPngFile(outCanvas, file.name);
  } finally {
    if (source instanceof ImageBitmap) {
      source.close();
    }
  }
}

/** 浅色主题 Logo：裁掉透明/近白边缘 */
export async function normalizeSiteLogoFile(file: File): Promise<File> {
  return normalizeSiteLogoFileByMode(file, 'light');
}

/** 深色主题 Logo：裁掉透明/近黑边缘，保留白字与浅色图形 */
export async function normalizeDarkSiteLogoFile(file: File): Promise<File> {
  return normalizeSiteLogoFileByMode(file, 'dark');
}

/**
 * 完整原图居中放入正方形画布（contain，不裁切、不抠边）。
 * 标签页图标需保留上传图的全部内容（含白底/圆角等）。
 */
export async function normalizeSiteFaviconFile(file: File): Promise<File> {
  if (file.type === 'image/svg+xml') {
    return file;
  }

  const { source, width, height } = await loadRasterSource(file);
  try {
    const scanCanvas = drawToScanCanvas(source, width, height);
    const scanCtx = scanCanvas.getContext('2d');
    if (!scanCtx) throw new Error('Canvas not supported');

    const { width: scanW, height: scanH } = scanCanvas;

    const pad = FAVICON_TARGET * FAVICON_CONTENT_PADDING;
    const inner = FAVICON_TARGET - pad * 2;
    const fitScale = Math.min(inner / scanW, inner / scanH);
    const drawW = scanW * fitScale;
    const drawH = scanH * fitScale;
    const drawX = (FAVICON_TARGET - drawW) / 2;
    const drawY = (FAVICON_TARGET - drawH) / 2;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = FAVICON_TARGET;
    outCanvas.height = FAVICON_TARGET;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) throw new Error('Canvas not supported');

    outCtx.clearRect(0, 0, FAVICON_TARGET, FAVICON_TARGET);
    outCtx.drawImage(scanCanvas, 0, 0, scanW, scanH, drawX, drawY, drawW, drawH);

    return canvasToPngFile(outCanvas, file.name);
  } finally {
    if (source instanceof ImageBitmap) {
      source.close();
    }
  }
}
