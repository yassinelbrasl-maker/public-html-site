import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useConfigurator } from "../context";
import { StepHeading } from "./_shared";
import { StepNav } from "../StepNav";

/**
 * Step 6 — Localisation du terrain avec react-leaflet.
 *
 * - Carte satellite Google (même tile layer que le legacy)
 * - Marker cliquable + draggable
 * - Recherche par adresse via Nominatim (OpenStreetMap)
 * - Coordonnées GPS affichées, lien vers Google Maps
 */

const DEFAULT_CENTER: [number, number] = [33.8047, 10.9861]; // Djerba

const goldIcon = L.divIcon({
  className: "",
  html: '<div style="width:22px;height:22px;background:#c8a96e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export function Step6Terrain() {
  const { state, dispatch } = useConfigurator();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(
    state.cfg_terrain_lat != null && state.cfg_terrain_lng != null
      ? [state.cfg_terrain_lat, state.cfg_terrain_lng]
      : DEFAULT_CENTER
  );

  const setMarkerPos = useCallback(
    (lat: number, lng: number) => {
      dispatch({
        type: "PATCH",
        patch: {
          cfg_terrain_lat: parseFloat(lat.toFixed(6)),
          cfg_terrain_lng: parseFloat(lng.toFixed(6)),
        },
      });
    },
    [dispatch]
  );

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const url =
        "https://nominatim.openstreetmap.org/search?format=json&q=" +
        encodeURIComponent(query) +
        "&limit=1";
      const res = await fetch(url, { headers: { "Accept-Language": "fr" } });
      const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setMapCenter([lat, lng]);
        setMarkerPos(lat, lng);
        dispatch({
          type: "SET",
          key: "cfg_terrain_adresse",
          value: data[0].display_name || query,
        });
      } else {
        setSearchError("Adresse introuvable. Essayez une adresse plus précise.");
      }
    } catch {
      setSearchError("Erreur de recherche. Vérifiez votre connexion.");
    } finally {
      setSearching(false);
    }
  }

  const hasMarker = state.cfg_terrain_lat != null && state.cfg_terrain_lng != null;

  return (
    <>
      <StepHeading num="06" title="📍 Localisation du terrain">
        Placez un repère sur votre terrain. Nous extrairons les coordonnées GPS pour
        adapter notre analyse au site.
      </StepHeading>

      {/* Search bar */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Ex : Midoun, Djerba, Tunisie…"
          className="flex-1 bg-bg-card border border-white/10 rounded-md px-4 py-3 text-fg placeholder:text-fg-muted focus:outline-none focus:border-gold transition-colors"
        />
        <button
          type="button"
          onClick={search}
          disabled={searching || !query.trim()}
          className="cta-button cta-button-primary disabled:opacity-50"
        >
          {searching ? "…" : "Rechercher"}
        </button>
      </div>

      {searchError && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-red-400 mb-3"
        >
          ⚠ {searchError}
        </motion.p>
      )}

      {/* Map */}
      <div className="relative rounded-md overflow-hidden border border-white/10 mb-4">
        <div className="h-[420px]">
          <MapContainer
            center={mapCenter}
            zoom={hasMarker ? 16 : 13}
            scrollWheelZoom
            className="h-full w-full"
          >
            <MapRecenter center={mapCenter} />
            <TileLayer
              // Same Google satellite layer as the legacy
              url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
              attribution="© Google"
              maxZoom={21}
            />
            <MapClickHandler onClick={setMarkerPos} />
            {hasMarker && (
              <Marker
                position={[state.cfg_terrain_lat!, state.cfg_terrain_lng!]}
                icon={goldIcon}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const pos = e.target.getLatLng();
                    setMarkerPos(pos.lat, pos.lng);
                  },
                }}
              />
            )}
          </MapContainer>
        </div>
        <div className="absolute bottom-3 left-3 z-[400] bg-bg/80 backdrop-blur-sm text-xs text-fg-muted px-3 py-1.5 rounded-md border border-white/10 flex items-center gap-2 pointer-events-none">
          <span>📍</span>
          Cliquez ou glissez l'épingle pour placer votre terrain
        </div>
      </div>

      {/* GPS coords */}
      {hasMarker && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-bg-card border border-gold-dim rounded-md mb-6"
        >
          <p className="text-xs text-gold tracking-[0.2em] uppercase mb-2">
            📡 Coordonnées GPS extraites
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-fg">
            <span>
              Lat : <strong className="text-gold">{state.cfg_terrain_lat}</strong>
            </span>
            <span>
              Lng : <strong className="text-gold">{state.cfg_terrain_lng}</strong>
            </span>
          </div>
          <a
            href={`https://www.google.com/maps?q=${state.cfg_terrain_lat},${state.cfg_terrain_lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-2 text-xs text-gold hover:underline"
          >
            📍 Voir sur Google Maps ↗
          </a>
        </motion.div>
      )}

      <StepNav nextLabel="✦ Voir les résultats →" />
    </>
  );
}

// ─── React-Leaflet helpers ────────────────────────────────────────────────

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Recentre when parent updates mapCenter (e.g. after a search)
  map.setView(center);
  return null;
}
