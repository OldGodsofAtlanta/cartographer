// Drops features whose geometry became null after rounding (sliver polygons under 1 m).
// Usage: node atlanta-1878-drop-null.js <in.geojson> <out.geojson>
import fs from 'fs';
const [inFile, outFile] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const keep = d.features.filter(f => f.geometry);
console.log(JSON.stringify({ dropped: d.features.length - keep.length, kept: keep.length }));
fs.writeFileSync(outFile, JSON.stringify({ type: 'FeatureCollection', features: keep }));
