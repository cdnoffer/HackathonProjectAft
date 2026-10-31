import { Route as RouteIcon } from "lucide-react";

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <div className="brand-glyph" aria-hidden="true">
        <RouteIcon size={compact ? 18 : 22} strokeWidth={2.2} />
      </div>
      <div>
        <div className="brand-name">
          Routey<span className="brand-dot">.</span>
        </div>
        {!compact ? (
          <div className="brand-tagline">Safety-first route intelligence</div>
        ) : null}
      </div>
    </div>
  );
}
