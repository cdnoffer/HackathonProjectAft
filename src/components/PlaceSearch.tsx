import { useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Loader2,
  MapPin,
  Search,
  X,
} from "lucide-react";
import type { GeocodeResult, Place } from "../../shared/types";
import { api } from "../lib/api";

interface PlaceSearchProps {
  role: "origin" | "destination";
  value: Place | null;
  onSelect: (place: Place) => void;
  onPickOnMap: () => void;
  pickActive: boolean;
  disabled?: boolean;
}

export default function PlaceSearch({
  role,
  value,
  onSelect,
  onPickOnMap,
  pickActive,
  disabled,
}: PlaceSearchProps) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!focusedRef.current) setQuery(value?.label ?? "");
  }, [value]);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    if (clean === value?.label) return;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setSearching(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const found = await api.searchPlaces(clean, controller.signal);
        if (!controller.signal.aborted) {
          setResults(found);
          setOpen(true);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Place search unavailable",
          );
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 380);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, value?.label]);

  const choose = (result: GeocodeResult) => {
    setQuery(result.shortLabel);
    setResults([]);
    setOpen(false);
    onSelect({
      label: result.shortLabel,
      lat: result.lat,
      lon: result.lon,
    });
  };

  return (
    <div className={`place-search ${pickActive ? "pick-active" : ""}`}>
      <label className="place-label">
        <span className={`place-dot place-dot-${role}`} aria-hidden="true" />
        {role === "origin" ? "Start" : "Destination"}
      </label>
      <div className="place-input-row">
        <MapPin size={15} className="place-pin" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          disabled={disabled}
          placeholder={
            role === "origin" ? "Search a starting point" : "Search a destination"
          }
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            focusedRef.current = true;
            if (results.length > 0) setOpen(true);
          }}
          onBlur={() => {
            focusedRef.current = false;
            window.setTimeout(() => setOpen(false), 140);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && results[0]) choose(results[0]);
          }}
          aria-label={role === "origin" ? "Starting point" : "Destination"}
        />
        {searching ? (
          <Loader2 size={15} className="spin place-action-icon" />
        ) : query ? (
          <button
            type="button"
            className="place-mini-button"
            onClick={() => {
              setQuery("");
              setResults([]);
              inputRef.current?.focus();
            }}
            aria-label="Clear place"
          >
            <X size={14} />
          </button>
        ) : null}
        <button
          type="button"
          className={`place-mini-button pick-button ${pickActive ? "active" : ""}`}
          onClick={onPickOnMap}
          title="Pick this point on the map"
          aria-label={`Pick ${role === "origin" ? "start" : "destination"} on map`}
        >
          <Crosshair size={15} />
        </button>
      </div>
      {pickActive ? (
        <div className="pick-hint">
          <Crosshair size={13} /> Click the map to set this point
        </div>
      ) : null}
      {open && (results.length > 0 || error || (searching && query.length > 1)) ? (
        <div className="search-results" role="listbox">
          {error ? <div className="search-empty">{error}</div> : null}
          {!error && searching && results.length === 0 ? (
            <div className="search-empty">Searching OpenStreetMap…</div>
          ) : null}
          {results.map((result) => (
            <button
              type="button"
              key={`${result.lat}-${result.lon}-${result.label}`}
              className="search-result"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(result)}
            >
              <span className="search-result-icon">
                <Search size={13} />
              </span>
              <span className="search-result-text">
                <strong>{result.shortLabel}</strong>
                <small>{result.label}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
