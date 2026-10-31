// Georeferencing a scan: fit an affine transform from image pixels to a plane from control points
// (pixel ↔ longitude/latitude). Affine handles a scan that is turned, scaled, or slightly sheared,
// which is what Sanborn sheets with a turned compass are. No DOM, so Node scripts use it too.

const LAT0 = 33.75;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180); // metres per degree of longitude
const KY = 110540; // metres per degree of latitude

export const toMetres = ([lon, lat]) => [lon * KX, lat * KY];
export const fromMetres = ([x, y]) => [x / KX, y / KY];

// Solves the 3×3 system A·v = b by Gaussian elimination.
function solve3(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    if (Math.abs(M[i][i]) < 1e-12) throw new Error('Control points are collinear or repeated');
    for (let r = i + 1; r < 3; r++) {
      const f = M[r][i] / M[i][i];
      for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c];
    }
  }
  const v = [0, 0, 0];
  for (let i = 2; i >= 0; i--) v[i] = (M[i][3] - M[i].slice(i + 1, 3).reduce((s, x, k) => s + x * v[i + 1 + k], 0)) / M[i][i];
  return v;
}

// Least-squares affine from src [[x, y], …] to dst [[X, Y], …]: X = a·x + c·y + e, Y = b·x + d·y + f.
// Returns [a, b, c, d, e, f] (the SVG matrix order).
export function fitAffine(src, dst) {
  if (src.length < 3) throw new Error('At least three control points are needed');
  const AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const AtX = [0, 0, 0];
  const AtY = [0, 0, 0];
  src.forEach(([x, y], i) => {
    const row = [x, y, 1];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) AtA[r][c] += row[r] * row[c];
      AtX[r] += row[r] * dst[i][0];
      AtY[r] += row[r] * dst[i][1];
    }
  });
  const [a, c, e] = solve3(AtA, AtX);
  const [b, d, f] = solve3(AtA, AtY);
  return [a, b, c, d, e, f];
}

export const apply = ([a, b, c, d, e, f], [x, y]) => [a * x + c * y + e, b * x + d * y + f];

export function invert([a, b, c, d, e, f]) {
  const det = a * d - b * c;
  if (!det) throw new Error('Transform is not invertible');
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)];
}

// A backdrop's georeference: pixel → metres (a local plane), its residuals, and pixel ↔ lon/lat.
// fit (optional): { bearingRight, metresPerPixel? } for a sheet whose orientation is known (and, if given, its printed scale;
// without metresPerPixel the scale is fitted by least squares from the points).
// bearingRight is the compass bearing (degrees clockwise from north) that the image's +x (right) direction points
// to; image-down is 90° clockwise from it. { northUp: true } means bearingRight 90. It fixes rotation and scale
// and fits only the position, which suits a small plan with only one or two known corners (an affine fit would be
// under-determined).
export function georeference(points, fit) {
  const px = points.map((p) => p.px);
  const m = points.map((p) => toMetres(p.lonlat));
  let T;
  const bearing = fit?.bearingRight ?? (fit?.northUp ? 90 : null);
  if (bearing != null) {
    const r = (bearing * Math.PI) / 180;
    let s = fit.metresPerPixel;
    if (s == null) {
      // Scale not given: least squares from the points, with rotation fixed.
      const A = px.map(([x, y]) => x * Math.sin(r) + y * Math.cos(r));
      const B = px.map(([x, y]) => x * Math.cos(r) - y * Math.sin(r));
      const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
      const [mA, mB, mX, mY] = [mean(A), mean(B), mean(m.map((q) => q[0])), mean(m.map((q) => q[1]))];
      let num = 0;
      let den = 0;
      m.forEach((q, i) => {
        num += (A[i] - mA) * (q[0] - mX) + (B[i] - mB) * (q[1] - mY);
        den += (A[i] - mA) ** 2 + (B[i] - mB) ** 2;
      });
      s = num / den;
    }
    // ground (east, north) = (e, f) + s * (x·(sin r, cos r) + y·(sin(r+90°), cos(r+90°)))
    const [a, b, c, d] = [s * Math.sin(r), s * Math.cos(r), s * Math.cos(r), -s * Math.sin(r)];
    const e = m.reduce((acc, q, i) => acc + (q[0] - (a * px[i][0] + c * px[i][1])), 0) / m.length;
    const f = m.reduce((acc, q, i) => acc + (q[1] - (b * px[i][0] + d * px[i][1])), 0) / m.length;
    T = [a, b, c, d, e, f];
  } else T = fitAffine(px, m);
  const residuals = points.map((p, i) => {
    const [X, Y] = apply(T, p.px);
    return Math.hypot(X - m[i][0], Y - m[i][1]);
  });
  const rms = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
  const inv = invert(T);
  return {
    transform: T,
    residualsM: residuals.map((r) => Math.round(r * 10) / 10),
    rmsM: Math.round(rms * 10) / 10,
    // Ground metres per pixel along the image's x and y axes.
    metresPerPixel: [Math.round(Math.hypot(T[0], T[1]) * 100) / 100, Math.round(Math.hypot(T[2], T[3]) * 100) / 100],
    pixelToLonLat: (xy) => fromMetres(apply(T, xy)),
    lonLatToPixel: (ll) => apply(inv, toMetres(ll)),
  };
}
