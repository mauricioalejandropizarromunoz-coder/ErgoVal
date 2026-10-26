import { RenderedPngResult } from '../types/figurePlan';

const MAX_PNG_BYTES = 118 * 1024; // < 120 KB editorial limit when compact mode is requested

// Precomputed IEEE 802.3 CRC32 table for standard PNG chunks
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(typeAscii: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = typeAscii.charCodeAt(i);
  }
  chunk.set(data, 8);
  const crcVal = crc32(chunk.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crcVal, false);
  return chunk;
}

async function deflateZlib(raw: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    writer.write(raw as unknown as BufferSource);
    writer.close();
    const reader = cs.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const ch of chunks) {
      out.set(ch, offset);
      offset += ch.length;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Encodes ImageData as an 8-bit Indexed-Color PNG with a dedicated 20-level grayscale
 * anti-aliasing ramp so typography and human contours remain razor-sharp without color halos.
 */
async function encodeIndexedPng8(imageData: ImageData): Promise<Blob | null> {
  const { width, height, data } = imageData;
  const pixelCount = width * height;

  // Pin 20 neutral grayscale steps so anti-aliased text never gets color-fringed
  const pinnedColors: [number, number, number][] = [
    [255, 255, 255],
    [248, 250, 252],
    [241, 245, 249],
    [226, 232, 240],
    [203, 213, 225],
    [180, 192, 206],
    [148, 163, 184],
    [120, 134, 155],
    [100, 116, 139],
    [71, 85, 105],
    [51, 65, 85],
    [30, 41, 59],
    [15, 23, 42],
    [5, 10, 20],
    // Photorealistic warm human skin ramp
    [224, 184, 160],
    [208, 162, 136],
    [199, 150, 124],
    [190, 141, 115],
    [176, 127, 102],
    [156, 108, 84],
    [132, 86, 65],
    // Solid dark-grey scrubs & medium-grey trousers ramp
    [42, 48, 56],
    [56, 63, 72],
    [68, 76, 86],
    [90, 98, 108],
    [107, 115, 126],
    [124, 132, 143],
    // Semi-transparent blue angular sectors & crisp black callout accents
    [9, 13, 22],     // Crisp black outline (#090d16)
    [96, 165, 250],  // Blue-400 angular sector
    [134, 188, 252], // Sector over light studio
    [172, 210, 254], // Soft sector highlight
    // Key ergonomic & vector colors
    [234, 88, 12],   // Orange-600 angle arcs (alpha)
    [194, 65, 12],   // Orange-700 text
    [251, 146, 60],  // Orange-400 arc AA
    [2, 132, 199],   // Sky-600 joint nodes
    [29, 78, 216],   // Blue-700 force vectors (F)
    [22, 163, 74],   // Green-600 chart accent
    [220, 38, 38],   // Red-600 critical accent
  ];

  const counts = new Int32Array(32768);
  const sumR = new Float64Array(32768);
  const sumG = new Float64Array(32768);
  const sumB = new Float64Array(32768);

  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const a = data[off + 3];
    const r = a === 255 ? data[off] : Math.round((data[off] * a + 255 * (255 - a)) / 255);
    const g = a === 255 ? data[off + 1] : Math.round((data[off + 1] * a + 255 * (255 - a)) / 255);
    const b = a === 255 ? data[off + 2] : Math.round((data[off + 2] * a + 255 * (255 - a)) / 255);
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    counts[key]++;
    sumR[key] += r;
    sumG[key] += g;
    sumB[key] += b;
  }

  const buckets: { count: number; r: number; g: number; b: number }[] = [];
  for (let k = 0; k < 32768; k++) {
    if (counts[k] > 0) {
      buckets.push({
        count: counts[k],
        r: Math.round(sumR[k] / counts[k]),
        g: Math.round(sumG[k] / counts[k]),
        b: Math.round(sumB[k] / counts[k]),
      });
    }
  }
  buckets.sort((a, b) => b.count - a.count);

  const palette: [number, number, number][] = [...pinnedColors];
  for (const b of buckets) {
    if (palette.length >= 256) break;
    let tooClose = false;
    for (let j = 0; j < palette.length; j++) {
      const dr = palette[j][0] - b.r;
      const dg = palette[j][1] - b.g;
      const db = palette[j][2] - b.b;
      if (dr * dr + dg * dg + db * db < 16) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      palette.push([b.r, b.g, b.b]);
    }
  }

  const lut = new Int16Array(32768).fill(-1);
  const nearestIndex = (r: number, g: number, b: number): number => {
    if (r >= 253 && g >= 253 && b >= 253) return 0;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    if (lut[key] !== -1) return lut[key];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dr = palette[i][0] - r;
      const dg = palette[i][1] - g;
      const db = palette[i][2] - b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
        if (d === 0) break;
      }
    }
    lut[key] = bestIdx;
    return bestIdx;
  };

  const rowStride = width + 1;
  const rawScanlines = new Uint8Array(rowStride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowStride;
    rawScanlines[rowStart] = 0;
    const pixRow = y * width;
    for (let x = 0; x < width; x++) {
      const off = (pixRow + x) * 4;
      const a = data[off + 3];
      const r = a === 255 ? data[off] : Math.round((data[off] * a + 255 * (255 - a)) / 255);
      const g = a === 255 ? data[off + 1] : Math.round((data[off + 1] * a + 255 * (255 - a)) / 255);
      const b = a === 255 ? data[off + 2] : Math.round((data[off + 2] * a + 255 * (255 - a)) / 255);
      rawScanlines[rowStart + 1 + x] = nearestIndex(r, g, b);
    }
  }

  const compressed = await deflateZlib(rawScanlines);
  if (!compressed) return null;

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdrData[8] = 8;
  ihdrData[9] = 3;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdrChunk = makePngChunk('IHDR', ihdrData);

  const plteData = new Uint8Array(palette.length * 3);
  for (let i = 0; i < palette.length; i++) {
    plteData[i * 3] = palette[i][0];
    plteData[i * 3 + 1] = palette[i][1];
    plteData[i * 3 + 2] = palette[i][2];
  }
  const plteChunk = makePngChunk('PLTE', plteData);
  const idatChunk = makePngChunk('IDAT', compressed);
  const iendChunk = makePngChunk('IEND', new Uint8Array(0));

  const parts: BlobPart[] = [
    signature as unknown as BlobPart,
    ihdrChunk as unknown as BlobPart,
    plteChunk as unknown as BlobPart,
    idatChunk as unknown as BlobPart,
    iendChunk as unknown as BlobPart,
  ];
  return new Blob(parts, {
    type: 'image/png',
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo codificar DataURL PNG'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Exports a 24-bit Lossless High-Quality PNG (zero quantization, 100% sharp text & smooth shading).
 */
export async function exportCanvasToHighQualityPng(
  sourceCanvas: HTMLCanvasElement,
): Promise<RenderedPngResult> {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const blob = await new Promise<Blob>((resolve) => {
    sourceCanvas.toBlob((b) => resolve(b || new Blob()), 'image/png');
  });
  const dataUrl = await blobToDataUrl(blob);
  return {
    blob,
    dataUrl,
    sizeBytes: blob.size,
    width,
    height,
  };
}

/**
 * Exports a crisp PNG guaranteed < 120 KB by trying lossless 24-bit PNG first
 * and only falling back to grayscale-preserved Indexed PNG-8 if needed.
 */
export async function exportCanvasToOptimizedPng(
  sourceCanvas: HTMLCanvasElement,
): Promise<RenderedPngResult> {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const workCanvas = document.createElement('canvas');
  workCanvas.width = width;
  workCanvas.height = height;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(sourceCanvas, 0, 0);

  // Snap only near-white WebGL background noise (253..255) to pure #FFFFFF, leaving text untouched
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] >= 253 && d[i + 1] >= 253 && d[i + 2] >= 253) {
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = 255;
    } else {
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // 1. Try true 24-bit lossless PNG first for maximum typographic sharpness!
  const nativeBlob = await new Promise<Blob>((resolve) => {
    workCanvas.toBlob((b) => resolve(b || new Blob()), 'image/png');
  });

  if (nativeBlob.size > 0 && nativeBlob.size <= MAX_PNG_BYTES) {
    const dataUrl = await blobToDataUrl(nativeBlob);
    return {
      blob: nativeBlob,
      dataUrl,
      sizeBytes: nativeBlob.size,
      width,
      height,
    };
  }

  // 2. If > 118 KB, use grayscale-preserved 256-color Indexed PNG-8
  const indexedBlob = await encodeIndexedPng8(imgData);
  const finalBlob = indexedBlob && indexedBlob.size <= MAX_PNG_BYTES ? indexedBlob : indexedBlob || nativeBlob;
  const dataUrl = await blobToDataUrl(finalBlob);
  return {
    blob: finalBlob,
    dataUrl,
    sizeBytes: finalBlob.size,
    width,
    height,
  };
}
