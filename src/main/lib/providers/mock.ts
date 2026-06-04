import { deflateSync } from "node:zlib";
import type { GenerationRequest, GenerationResult, ImageProvider } from "../image-provider";

/** Simulated network latency so progress UI can be exercised. */
const MOCK_DELAY_MS = 450;

// ---------------------------------------------------------------------------
// Minimal 1024×1024 RGBA PNG (solid fill) — no extra dependencies.
// ---------------------------------------------------------------------------

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let n = 0; n < data.length; n++) {
    c ^= data[n]!;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c >>>= 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function rgba1024PngBuffer(r: number, g: number, b: number, a: number): Buffer {
  const width = 1024;
  const height = 1024;
  const row = Buffer.alloc(1 + width * 4);
  row[0] = 0;
  for (let x = 0; x < width; x++) {
    const o = 1 + x * 4;
    row[o] = r;
    row[o + 1] = g;
    row[o + 2] = b;
    row[o + 3] = a;
  }
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) rows.push(row);
  const raw = Buffer.concat(rows);
  const compressed = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", compressed), pngChunk("IEND", Buffer.alloc(0))]);
}

const VARIANT_COLORS: readonly [number, number, number][] = [
  [0x4a, 0x90, 0xd2],
  [0x50, 0xc8, 0x7a],
  [0xc8, 0x6a, 0xe8],
];

let mockProviderLogged = false;

/**
 * Returns placeholder PNGs for UI and pipeline testing. No API keys or network.
 *
 * Enable with `ICON_PROVIDER=mock` when launching the app.
 */
export class MockImageProvider implements ImageProvider {
  constructor() {
    if (!mockProviderLogged) {
      mockProviderLogged = true;
      console.warn(
        "[MōIcons] Mock image provider is active (no paid API calls). " +
          "Unset ICON_PROVIDER or set ICON_PROVIDER=openai for real generation.",
      );
    }
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    await new Promise<void>((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
    const n = Math.max(1, Math.min(request.count, 10));
    const images: string[] = [];
    for (let i = 0; i < n; i++) {
      const [rv, gv, bv] = VARIANT_COLORS[i % VARIANT_COLORS.length]!;
      const tweak = Math.min(40, i * 8);
      const buf = rgba1024PngBuffer(
        Math.min(255, rv + tweak),
        Math.min(255, gv + tweak / 2),
        Math.max(0, bv - tweak / 3),
        255,
      );
      images.push(buf.toString("base64"));
    }
    return { images };
  }
}
