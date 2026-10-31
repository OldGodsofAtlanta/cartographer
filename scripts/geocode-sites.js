// Looks up candidate coordinates for canon sites in OpenStreetMap's Nominatim, for review.
//   node scripts/geocode-sites.js            writes sources/raw/sites/nominatim.json and prints each hit
// Nothing here is accepted automatically: scripts/build-sites.js uses only what data/sites-sources.json lists.
import { writeFile } from 'node:fs/promises';
const Q = {
  'five-points': 'Five Points, Atlanta',
  'oakland-cemetery': 'Oakland Cemetery, Atlanta',
  'union-depot': 'Underground Atlanta',
  'friendship-baptist-church': 'Friendship Baptist Church, Atlanta',
  'ebenezer-baptist': 'Ebenezer Baptist Church, Atlanta',
  'bethel-ame': 'Big Bethel AME Church, Atlanta',
  'georgia-state-capitol': 'Georgia State Capitol, Atlanta',
  'fox-theatre': 'Fox Theatre, Atlanta',
  'loews-grand': 'Georgia Theatre Loew Grand Peachtree Forsyth Atlanta',
  'atlanta-municipal-auditorium': 'Atlanta Municipal Auditorium',
  'terminal-station': 'Terminal Station, Spring Street, Atlanta',
  'union-station-1930': 'Atlanta Union Station',
  'atlanta-medical-college': 'Atlanta Medical College, Butler Street, Atlanta',
  'national-pencil-company': 'National Pencil Company, Forsyth Street, Atlanta',
  'atlanta-federal-penitentiary': 'United States Penitentiary, Atlanta',
  'fort-mcpherson': 'Fort McPherson, Atlanta',
  'grant-park': 'Grant Park, Atlanta',
  'ponce-de-leon': 'Ponce de Leon Park, Atlanta',
  'exposition-grounds': 'Piedmont Park, Atlanta',
  'clara-meer-spillway': 'Lake Clara Meer, Piedmont Park',
  'techwood-homes': 'Techwood Homes, Atlanta',
  'grant-field': 'Bobby Dodd Stadium, Atlanta',
  'university-homes-site': 'University Homes, Atlanta',
  'westview-cemetery': 'Westview Cemetery, Atlanta',
  'south-view-ground': 'South-View Cemetery, Atlanta',
  'morris-brown-college': 'Morris Brown College, Atlanta',
  'west-side-atlanta-university': 'Atlanta University Center, Atlanta',
  'camp-gordon': 'Camp Gordon, Chamblee',
  'candler-field': 'Hartsfield-Jackson Atlanta International Airport',
  'bellwood-prison-camp': 'Bellwood Quarry, Atlanta',
  'stone-mountain': 'Stone Mountain, Georgia',
  'big-ledge': 'Arabia Mountain',
  'cooper-pants-factory': 'West Broad Street and Maple Street, Gainesville, Georgia',
  'gainesville-square': 'Gainesville Square, Gainesville, Georgia',
  'marietta-square': 'Marietta Square, Georgia',
  'decatur-square-courthouse': 'Old DeKalb County Courthouse, Decatur, Georgia',
  'buckhead': 'Buckhead, Atlanta',
  'west-end': 'West End, Atlanta',
  'inman-park': 'Inman Park, Atlanta',
  'ansley-park': 'Ansley Park, Atlanta',
  'druid-hills': 'Druid Hills, Atlanta',
  'summerhill': 'Summerhill, Atlanta',
  'pittsburg': 'Pittsburgh, Atlanta',
  'brownsville': 'Brownsville, Atlanta',
  'lithia-springs': 'Lithia Springs, Georgia',
  'standing-peachtree': 'Standing Peachtree, Atlanta',
  'fenn-ice': 'Fenn Ice and Coal, Atlanta',
  'dupre-excelsior-mill': 'The Masquerade, Atlanta',
  'atlanta-city-stockade': 'Glenwood Avenue, Atlanta stockade',
  'atlanta-daily-world-office': 'Atlanta Daily World, Auburn Avenue',
  'imperial-palace': 'Imperial Palace Klan Peachtree Street Atlanta',
  'reynoldstown': 'Reynoldstown, Atlanta',
  'tax-collectors-office-1877': '5 East Alabama Street, Atlanta',
  'fulton-county-courthouse': 'Old Fulton County Courthouse, Atlanta',
  'hapeville': 'Hapeville, Georgia',
  'mcdonough': 'McDonough, Georgia',
  'lithonia': 'Lithonia, Georgia',
  'chamblee': 'Chamblee, Georgia',
  'norcross': 'Norcross, Georgia',
  'jonesboro-road-southview': 'South-View Cemetery',
};
const out = {};
for (const [id, q] of Object.entries(Q)) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=3&viewbox=-84.9,34.4,-83.9,33.4`;
  const r = await fetch(url, { headers: { 'User-Agent': 'OldGodsCartographer/0.1 (aaboyles@gmail.com)' } });
  const j = r.ok ? await r.json() : [];
  out[id] = { q, hits: j.map((h) => ({ osm: `${h.osm_type}/${h.osm_id}`, lat: +h.lat, lon: +h.lon, type: `${h.category}:${h.type}`, name: h.display_name.slice(0, 90) })) };
  console.log(id.padEnd(30), j.length ? j.map((h) => `${(+h.lat).toFixed(4)},${(+h.lon).toFixed(4)} ${h.category}:${h.type} ${h.display_name.split(',').slice(0, 2).join(',')}`).join('  ||  ') : '— none');
  await new Promise((r) => setTimeout(r, 1100));
}
await writeFile(new URL('../sources/raw/sites/nominatim.json', import.meta.url), JSON.stringify(out, null, 1));
