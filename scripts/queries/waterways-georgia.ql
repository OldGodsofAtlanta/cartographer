[out:json][timeout:300];
(
  way["waterway"~"^(river|canal)$"](30.2,-86.0,35.3,-80.5);
  way["waterway"="stream"]["name"~"River$"](30.2,-86.0,35.3,-80.5);
);
out geom;
