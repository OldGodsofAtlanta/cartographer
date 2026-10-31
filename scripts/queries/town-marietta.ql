[out:json][timeout:120];
(
  way["highway"]["name"]["highway"!~"^(footway|cycleway|path|steps|track|bridleway|service|pedestrian_unused|construction|proposed)$"](33.935,-84.575,33.975,-84.52);
  way["railway"~"^(rail|abandoned|disused|razed)$"](33.935,-84.575,33.975,-84.52);
  way["waterway"~"^(river|stream|canal)$"]["name"](33.935,-84.575,33.975,-84.52);
);
out geom;
