// Keeps the data-contract properties for one ATL1878 layer. Usage: node atlanta-1878-clean.js <in.json> <out.geojson> <kind>
import fs from 'fs';
const [inFile, outFile, kind] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const source = kind === 'block'
  ? 'ECDS OpenWorld Atlanta, 1878 blocks'
  : 'ECDS OpenWorld Atlanta, 1878 horse routes';
const features = d.features.map(f => {
  const p = { kind, date_quality: 'snapshot', date_source: source, id: f.properties.OBJECTID };
  return { type: 'Feature', properties: p, geometry: f.geometry };
});
fs.writeFileSync(outFile, JSON.stringify({ type: 'FeatureCollection', features }));
console.log(JSON.stringify({ kind, features: features.length }));
