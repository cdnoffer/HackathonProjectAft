import { useEffect, useRef } from "react";
import L from "leaflet";
import type { RouteData, Scenario } from "../../shared/types";
import {
  formatDistance,
  formatDuration,
  routeColor,
} from "../../shared/labels";

export type PickMode = "origin" | "destination" | null;

interface CarPosition {
  lat: number;
  lon: number;
  bearing: number;
}

interface MapViewProps {
  scenario: Scenario | null;
  routes: RouteData[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  pickMode: PickMode;
  onMapClick: (lat: number, lon: number) => void;
  theme: "light" | "dark";
  carPosition: CarPosition | null;
  driving: boolean;
}

const TILE_LAYERS = {
  light: {
    base: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    reference:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  },
  dark: {
    base: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    reference:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  },
} as const;

const ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a> — Esri, HERE, Garmin, &copy; OpenStreetMap contributors · Routing by Valhalla';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function MapView({
  scenario,
  routes,
  selectedRouteId,
  onSelectRoute,
  pickMode,
  onMapClick,
  theme,
  carPosition,
  driving,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const referenceRef = useRef<L.TileLayer | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const carMarkerRef = useRef<L.Marker | null>(null);
  const clickHandlerRef = useRef(onMapClick);
  const lastPanRef = useRef(0);
  const fitStateRef = useRef<string>("");
  clickHandlerRef.current = onMapClick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      minZoom: 2,
      worldCopyJump: true,
    });
    map.setView([24, 10], 2);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    map.on("click", (event) => {
      clickHandlerRef.current(event.latlng.lat, event.latlng.lng);
    });
    mapRef.current = map;
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    if (referenceRef.current) map.removeLayer(referenceRef.current);

    const layers = TILE_LAYERS[theme];
    tileRef.current = L.tileLayer(layers.base, {
      attribution: ATTRIBUTION,
      maxZoom: 30,
      zIndex: 0,
      detectRetina: false,
    }).addTo(map);
    tileRef.current.bringToBack();

    referenceRef.current = L.tileLayer(layers.reference, {
      maxZoom: 30,
      zIndex: 1,
      detectRetina: false,
    }).addTo(map);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    const group = routeLayerRef.current;
    if (!map || !group) return;
    group.clearLayers();

    for (const route of routes) {
      const selected = route.id === selectedRouteId;
      if (driving && !selected) continue;
      if (route.geometry.length < 2) continue;
      const latlngs = route.geometry.map(
        ([lon, lat]) => [lat, lon] as [number, number],
      );
      L.polyline(latlngs, {
        color: theme === "dark" ? "#03070a" : "#ffffff",
        weight: selected ? 12 : 8,
        opacity: selected ? 0.75 : 0.35,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(group);
      const line = L.polyline(latlngs, {
        color: routeColor(route.ordinal),
        weight: selected ? 6 : 4,
        opacity: selected ? 1 : 0.48,
        lineCap: "round",
        lineJoin: "round",
        dashArray:
          route.kind === "detour" && !selected ? "10 8" : undefined,
      }).addTo(group);
      line.on("click", () => onSelectRoute(route.id));
      line.bindTooltip(
        `<strong>${escapeHtml(route.name)}</strong><br/>${Math.round(route.safetyScore)} safety · ${formatDuration(route.adjustedDurationS)} · ${formatDistance(route.distanceM)}`,
        { sticky: true, className: "route-tooltip", direction: "top" },
      );
    }

    const fitKey = `${scenario?.id ?? "none"}:${routes.length}`;
    if (!driving && fitKey !== fitStateRef.current) {
      fitStateRef.current = fitKey;
      const points: [number, number][] = [];
      for (const route of routes) {
        for (const [lon, lat] of route.geometry) points.push([lat, lon]);
      }
      if (points.length > 0) {
        const isNarrow = window.innerWidth < 900;
        map.fitBounds(L.latLngBounds(points), {
          paddingTopLeft: isNarrow ? [32, 90] : [460, 95],
          paddingBottomRight: isNarrow ? [32, 260] : [80, 95],
          maxZoom: 30,
          animate: true,
        });
      }
    }
  }, [routes, selectedRouteId, theme, driving, scenario?.id, onSelectRoute]);

  useEffect(() => {
    const group = markerLayerRef.current;
    if (!group || !scenario) return;
    group.clearLayers();
    const originIcon = L.divIcon({
      className: "route-marker-shell",
      html: '<div class="route-marker route-marker-origin">S</div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    const destinationIcon = L.divIcon({
      className: "route-marker-shell",
      html: '<div class="route-marker route-marker-destination">D</div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    L.marker([scenario.origin.lat, scenario.origin.lon], {
      icon: originIcon,
      zIndexOffset: 900,
    })
      .bindTooltip(`Start · ${escapeHtml(scenario.origin.label)}`, {
        direction: "top",
        className: "route-tooltip",
      })
      .addTo(group);
    L.marker([scenario.destination.lat, scenario.destination.lon], {
      icon: destinationIcon,
      zIndexOffset: 900,
    })
      .bindTooltip(`Destination · ${escapeHtml(scenario.destination.label)}`, {
        direction: "top",
        className: "route-tooltip",
      })
      .addTo(group);
  }, [scenario]);

  useEffect(() => {
    const map = mapRef.current;
    const container = map?.getContainer();
    if (!map || !container) return;
    container.classList.toggle("map-picking", Boolean(pickMode));
  }, [pickMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!driving || !carPosition) {
      if (carMarkerRef.current) {
        map.removeLayer(carMarkerRef.current);
        carMarkerRef.current = null;
      }
      return;
    }
    const html = `<div class="car-marker-inner" style="transform: rotate(${carPosition.bearing}deg)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 21 12 17 4 21 12 2Z" fill="currentColor"/></svg></div>`;
    const icon = L.divIcon({
      className: "car-marker-shell",
      html,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    const latlng: [number, number] = [carPosition.lat, carPosition.lon];
    if (!carMarkerRef.current) {
      carMarkerRef.current = L.marker(latlng, {
        icon,
        zIndexOffset: 1100,
        interactive: false,
      }).addTo(map);
      map.setView(latlng, Math.max(map.getZoom(), 15), { animate: true });
    } else {
      carMarkerRef.current.setLatLng(latlng);
      carMarkerRef.current.setIcon(icon);
    }
    const now = Date.now();
    if (now - lastPanRef.current > 900) {
      lastPanRef.current = now;
      map.panTo(latlng, { animate: true, duration: 0.65 });
    }
  }, [carPosition, driving]);

  return <div ref={containerRef} className="map-canvas" aria-label="Route map" />;
}
