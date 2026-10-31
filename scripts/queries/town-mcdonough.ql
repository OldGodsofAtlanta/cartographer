[out:json][timeout:120];
(
  way["highway"]["name"]["highway"!~"^(footway|cycleway|path|steps|track|bridleway|service|pedestrian_unused|construction|proposed)$"](33.42,-84.18,33.5,-84.11);
  way["railway"~"^(rail|abandoned|disused|razed)$"](33.42,-84.18,33.5,-84.11);
  way["waterway"~"^(river|stream|canal)$"]["name"](33.42,-84.18,33.5,-84.11);
);
out geom;
