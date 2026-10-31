// Usage: node atlanta-streetcars-1924-clean.js <streetcars1924.json> <out.geojson>
import fs from 'fs';
const [inFile, outFile] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const features = d.features.map(f => ({
  type: 'Feature',
  properties: {
    name: (f.properties.R_Name || '').trim(),
    kind: 'streetcar',
    route: f.properties.Route_num || null,
    date_quality: 'snapshot',
    date_source: 'ECDS GeoServer StreetcarRoutes:streetcars1924, 1924',
  },
  geometry: f.geometry,
}));
fs.writeFileSync(outFile, JSON.stringify({ type: 'FeatureCollection', features }));
console.log(JSON.stringify({ features: features.length, routes: new Set(features.map(f => f.properties.route)).size, unnamed: features.filter(f => !f.properties.name).length }));
