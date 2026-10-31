[out:json][timeout:120];
(
  way["highway"]["name"]["highway"!~"^(footway|cycleway|path|steps|track|bridleway|service|pedestrian_unused|construction|proposed)$"](33.755,-84.32,33.8,-84.26);
  way["railway"~"^(rail|abandoned|disused|razed)$"](33.755,-84.32,33.8,-84.26);
  way["waterway"~"^(river|stream|canal)$"]["name"](33.755,-84.32,33.8,-84.26);
);
out geom;
