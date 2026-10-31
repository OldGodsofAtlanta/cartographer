[out:json][timeout:120];
(
  way["highway"]["name"]["highway"!~"^(footway|cycleway|path|steps|track|bridleway|service|pedestrian_unused|construction|proposed)$"](33.695,-84.125,33.735,-84.085);
  way["railway"~"^(rail|abandoned|disused|razed)$"](33.695,-84.125,33.735,-84.085);
  way["waterway"~"^(river|stream|canal)$"]["name"](33.695,-84.125,33.735,-84.085);
);
out geom;
