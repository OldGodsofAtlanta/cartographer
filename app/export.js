// Export: a self-contained SVG (fonts embedded, so it renders the same anywhere), or a PNG/JPEG
// rasterised from it at a chosen resolution, with the resolution written into the file.

const FACES = [
  ['IM Fell Great Primer SC', 400, 'normal', 'im-fell-great-primer-sc-latin-400-normal.woff2'],
  ['IM Fell English', 400, 'normal', 'im-fell-english-latin-400-normal.woff2'],
  ['IM Fell English', 400, 'italic', 'im-fell-english-latin-400-italic.woff2'],
  ['Spectral', 300, 'normal', 'spectral-latin-300-normal.woff2'],
  ['Spectral', 400, 'normal', 'spectral-latin-400-normal.woff2'],
  ['Spectral', 600, 'normal', 'spectral-latin-600-normal.woff2'],
  ['Spectral', 700, 'normal', 'spectral-latin-700-normal.woff2'],
  ['Spectral', 300, 'italic', 'spectral-latin-300-italic.woff2'],
  ['Spectral', 400, 'italic', 'spectral-latin-400-italic.woff2'],
  ['Spectral', 700, 'italic', 'spectral-latin-700-italic.woff2'],
  ['Special Elite', 400, 'normal', 'special-elite-latin-400-normal.woff2'],
];

export { FACES };

const fontData = new Map();
async function fontURL(file) {
  if (!fontData.has(file)) {
    fontData.set(
      file,
      fetch(`fonts/${file}`)
        .then((r) => r.arrayBuffer())
        .then((buf) => {
          let bin = '';
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return `data:font/woff2;base64,${btoa(bin)}`;
        }),
    );
  }
  return fontData.get(file);
}

// Returns the sheet as an SVG string, sized in inches, with the fonts it uses embedded.
export async function svgString(svgEl, widthIn, heightIn) {
  const clone = svgEl.cloneNode(true);
  clone.querySelectorAll('.ui, .ui-hit').forEach((n) => n.remove());
  // Clear stale pan and zoom offsets from the layer groups (not the backdrops' georeferencing matrices).
  clone.querySelectorAll('g[transform]').forEach((n) => {
    if (n.parentNode?.classList?.contains('map') || n.parentNode?.classList?.contains('annotations')) n.removeAttribute('transform');
  });
  clone.removeAttribute('style');
  clone.setAttribute('width', `${widthIn}in`);
  clone.setAttribute('height', `${heightIn}in`);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const used = new Set([...clone.querySelectorAll('[font-family]')].map((n) => n.getAttribute('font-family')));
  const rules = [];
  for (const [family, weight, style, file] of FACES) {
    if (!used.has(family)) continue;
    rules.push(`@font-face{font-family:"${family}";font-weight:${weight};font-style:${style};src:url(${await fontURL(file)}) format("woff2");}`);
  }
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = rules.join('\n');
  let defs = clone.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    clone.prepend(defs);
  }
  defs.prepend(styleEl);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

export async function rasterBlob(svgEl, widthIn, heightIn, dpi, type = 'image/png') {
  const svg = await svgString(svgEl, widthIn, heightIn);
  const w = Math.round(widthIn * dpi);
  const h = Math.round(heightIn * dpi);
  // Size the SVG in pixels so the browser rasterises it at full resolution, not scaled up.
  const sized = svg.replace(/width="[^"]+in" height="[^"]+in"/, `width="${w}" height="${h}"`);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('The SVG could not be rasterised'));
      img.src = url;
    });
    await img.decode?.().catch(() => {});
    await new Promise((r) => setTimeout(r, 120)); // embedded fonts settle
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, type, 0.93));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const out = type === 'image/png' ? pngDensity(bytes, dpi) : jpegDensity(bytes, dpi);
    return new Blob([out], { type });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Adds a pHYs chunk after IHDR so layout programs place the image at its intended size.
function pngDensity(bytes, dpi) {
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // metres
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const at = 8 + 25; // signature + IHDR
  const out = new Uint8Array(bytes.length + 21);
  out.set(bytes.subarray(0, at));
  out.set(chunk, at);
  out.set(bytes.subarray(at), at + 21);
  return out;
}

function jpegDensity(bytes, dpi) {
  // FFD8 FFE0 len "JFIF\0" ver units Xdensity Ydensity
  if (bytes[2] === 0xff && bytes[3] === 0xe0 && String.fromCharCode(...bytes.subarray(6, 10)) === 'JFIF') {
    bytes[13] = 1;
    bytes[14] = dpi >> 8;
    bytes[15] = dpi & 255;
    bytes[16] = dpi >> 8;
    bytes[17] = dpi & 255;
  }
  return bytes;
}

export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
