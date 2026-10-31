[out:json][timeout:120];
(
  way["highway"]["name"]["highway"!~"^(footway|cycleway|path|steps|track|bridleway|service|pedestrian_unused|construction|proposed)$"](34.27,-83.86,34.32,-83.79);
  way["railway"~"^(rail|abandoned|disused|razed)$"](34.27,-83.86,34.32,-83.79);
  way["waterway"~"^(river|stream|canal)$"]["name"](34.27,-83.86,34.32,-83.79);
);
out geom;
