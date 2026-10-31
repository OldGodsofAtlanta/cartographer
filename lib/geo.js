// Small geometry helpers shared by the MCP server and the data build scripts.

export function km(a, b) {
  const R = 6371.0088;
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r;
  const dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function segmentMeet(p, p2, q, q2) {
  const r = [p2[0] - p[0], p2[1] - p[1]];
  const s = [q2[0] - q[0], q2[1] - q[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (den) {
    const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den;
    const u = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { d: 0, pt: [p[0] + t * r[0], p[1] + t * r[1]] };
  }
  // No crossing: the closest pair of end-to-segment distances.
  const near = (pt, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2)) : 0;
    const c = [a[0] + t * dx, a[1] + t * dy];
    return { d: Math.hypot(pt[0] - c[0], pt[1] - c[1]), pt: [(pt[0] + c[0]) / 2, (pt[1] + c[1]) / 2] };
  };
  return [near(p, q, q2), near(p2, q, q2), near(q, p, p2), near(q2, p, p2)].reduce((a, b) => (b.d < a.d ? b : a));
}


// Where two sets of street parts ({name, line}) meet: crossings, or the closest approach within 60 m.
// Returns distinct places (more than 150 m apart), best first.
export function intersections(A, B) {
  // Planar metres around Atlanta are fine for this.
  const kx = 111320 * Math.cos((33.75 * Math.PI) / 180);
  const ky = 110540;
  const cands = [];
  for (const pa of A)
    for (const pb of B)
      for (let i = 1; i < pa.line.length; i++)
        for (let j = 1; j < pb.line.length; j++) {
          const [p, p2, q, q2] = [pa.line[i - 1], pa.line[i], pb.line[j - 1], pb.line[j]].map(([x, y]) => [x * kx, y * ky]);
          const hit = segmentMeet(p, p2, q, q2);
          if (hit.d <= 60) cands.push({ point: [Math.round((hit.pt[0] / kx) * 1e6) / 1e6, Math.round((hit.pt[1] / ky) * 1e6) / 1e6], gap_m: Math.round(hit.d), names: [pa.name, pb.name] });
        }
  cands.sort((x, y) => x.gap_m - y.gap_m);
  const distinct = [];
  for (const c of cands) if (!distinct.some((d) => km(d.point, c.point) < 0.15)) distinct.push(c);
  return distinct;
}

// The parts of the named lines among GeoJSON features whose name matches pred.
export function lineParts(features, pred) {
  return features
    .filter((f) => pred(f.properties?.name))
    .flatMap((f) => (f.geometry.type === 'LineString' ? [{ name: f.properties.name, line: f.geometry.coordinates }] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates.map((line) => ({ name: f.properties.name, line })) : []));
}
