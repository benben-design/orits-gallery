/**
 * Generates the placeholder paintings used by the design-system page at /dev.
 *
 * Why generated rather than photographed: /dev exists to exercise the layout,
 * and the only thing that matters there is aspect ratio. Real paintings would
 * make the page a content preview instead of a component specimen, and would
 * tie a developer tool to whatever is currently in public/paintings.
 *
 * No dependencies. PNG is written by hand — signature, IHDR, IDAT, IEND, with
 * node's zlib doing the deflate and a hand-rolled CRC32. That is the same house
 * style as scripts/generate-image-manifest.mjs, which parses JPEG headers
 * rather than pulling in an image library.
 *
 * The two colours come out of app/tokens.css at run time, so these files can
 * never drift from the palette. Nothing here invents a colour.
 *
 *   npm run dev:placeholders
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'dev');

/** The three orientations in the real body of work: 9 portrait, 5 square, 1 landscape. */
const SPECS = [
  { name: 'placeholder-portrait', width: 800, height: 1200 },
  { name: 'placeholder-square', width: 1000, height: 1000 },
  { name: 'placeholder-landscape', width: 1400, height: 950 },
];

// ---------------------------------------------------------------- //
// Palette, read from the token file rather than restated here.
// ---------------------------------------------------------------- //

function readToken(css, name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!match) throw new Error(`token --${name} not found in app/tokens.css`);
  const n = parseInt(match[1].slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const tokens = readFileSync(join(root, 'app', 'tokens.css'), 'utf8');
const FIELD = readToken(tokens, 'surface-sunk');
const MARK = readToken(tokens, 'line-strong');

// ---------------------------------------------------------------- //
// Minimal PNG writer (truecolour, 8-bit, no interlace).
// ---------------------------------------------------------------- //

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // Each scanline is prefixed with its filter byte. Filter 0 (none) keeps this
  // readable; the images are flat, so deflate handles them well regardless.
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- //
// The placeholder itself: a flat field, a border, and both diagonals.
// Enough to read the aspect ratio and the edges at a glance, and
// unmistakably not a painting.
// ---------------------------------------------------------------- //

function draw(width, height) {
  const buf = Buffer.alloc(width * height * 3);
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
  };

  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) put(x, y, FIELD);

  const edge = Math.max(3, Math.round(Math.min(width, height) * 0.006));
  for (let y = 0; y < height; y += 1) {
    for (let t = 0; t < edge; t += 1) {
      put(t, y, MARK);
      put(width - 1 - t, y, MARK);
    }
  }
  for (let x = 0; x < width; x += 1) {
    for (let t = 0; t < edge; t += 1) {
      put(x, t, MARK);
      put(x, height - 1 - t, MARK);
    }
  }

  // Both diagonals, stepped along the longer axis so neither one breaks up.
  const steps = Math.max(width, height);
  for (let i = 0; i < steps; i += 1) {
    const x = Math.round((i * (width - 1)) / (steps - 1));
    const y = Math.round((i * (height - 1)) / (steps - 1));
    for (let t = -1; t <= 1; t += 1) {
      put(x + t, y, MARK);
      put(width - 1 - x + t, y, MARK);
    }
  }

  return buf;
}

mkdirSync(outDir, { recursive: true });

for (const { name, width, height } of SPECS) {
  const png = encodePng(width, height, draw(width, height));
  writeFileSync(join(outDir, `${name}.png`), png);
  console.log(`  ${name}.png  ${width}x${height}  ${(png.length / 1024).toFixed(1)} KB`);
}

console.log(`Wrote ${SPECS.length} placeholders to public/dev/`);
