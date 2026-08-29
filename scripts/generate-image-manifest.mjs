/**
 * Operational script — no dependencies.
 *
 * Reads the true pixel dimensions of every painting in public/paintings by
 * parsing the JPEG/PNG headers directly, and writes them to
 * lib/data/image-manifest.json.
 *
 * Why this exists: the works grid must lay out every painting at its own
 * aspect ratio without cropping, so it needs real width/height for each file.
 * Those numbers are never typed by hand — they are read from the files. The
 * script is wired into `prebuild`, so the manifest cannot drift from what is
 * actually on disk, even when the low-resolution stand-ins are swapped for the
 * final scans.
 *
 *   npm run images:manifest
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

const PAINTINGS_DIR = join(process.cwd(), 'public', 'paintings');
const MANIFEST_PATH = join(process.cwd(), 'lib', 'data', 'image-manifest.json');
const SUPPORTED = ['.jpg', '.jpeg', '.png'];

/** Pull width/height out of a PNG IHDR chunk. */
function readPngSize(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Walk JPEG segment markers until a Start Of Frame, which carries the size. */
function readJpegSize(buf) {
  if (buf.readUInt16BE(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset < buf.length - 1) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    // SOF0..SOF15, minus the markers in that range that are not frame headers.
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + buf.readUInt16BE(offset + 2);
  }
  return null;
}

function readSize(buf, file) {
  const ext = extname(file).toLowerCase();
  if (ext === '.png') return readPngSize(buf);
  return readJpegSize(buf);
}

function shape(ratio) {
  if (ratio < 0.9) return 'portrait';
  if (ratio > 1.1) return 'landscape';
  return 'near-square';
}

const files = (await readdir(PAINTINGS_DIR)).filter((f) =>
  SUPPORTED.includes(extname(f).toLowerCase())
);

const manifest = {};
const rows = [];

for (const file of files) {
  const size = readSize(await readFile(join(PAINTINGS_DIR, file)), file);
  if (!size) {
    throw new Error(`Could not read image dimensions from public/paintings/${file}`);
  }
  // The English slug of a work is its filename without the extension.
  const slug = basename(file, extname(file));
  manifest[slug] = { src: `/paintings/${file}`, width: size.width, height: size.height };
  rows.push({ ...manifest[slug], slug, ratio: Number((size.width / size.height).toFixed(3)) });
}

const ordered = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));

await writeFile(
  MANIFEST_PATH,
  `${JSON.stringify(ordered, null, 2)}\n`,
  'utf8'
);

rows.sort((a, b) => a.ratio - b.ratio);
console.table(rows.map(({ slug, width, height, ratio }) => ({ slug, width, height, ratio, shape: shape(ratio) })));

const counts = rows.reduce((acc, r) => ({ ...acc, [shape(r.ratio)]: (acc[shape(r.ratio)] ?? 0) + 1 }), {});
console.log(`\nWrote ${rows.length} entries to lib/data/image-manifest.json —`, counts);
