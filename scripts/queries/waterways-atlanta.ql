[out:json][timeout:300];
(
  way["waterway"~"^(river|stream|canal)$"]["name"](33.55,-84.65,34.00,-84.10);
);
out geom;
