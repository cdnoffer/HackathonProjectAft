import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Droplets,
  Moon,
  Sun,
  Wind,
  Eye,
  Thermometer,
} from "lucide-react";
import type { DayPhase, WeatherCondition } from "../../shared/types";

const ICONS = {
  clear: Sun,
  "partly-cloudy": Cloud,
  overcast: Cloud,
  mist: CloudFog,
  fog: CloudFog,
  drizzle: Droplets,
  rain: CloudRain,
  "heavy-rain": CloudRain,
  snow: CloudSnow,
  sleet: CloudSnow,
  thunderstorm: CloudLightning,
} satisfies Record<WeatherCondition, typeof Sun>;

export function WeatherIcon({
  condition,
  size = 20,
  phase,
}: {
  condition: WeatherCondition;
  size?: number;
  phase?: DayPhase;
}) {
  const nightClear =
    phase === "night" &&
    (condition === "clear" || condition === "partly-cloudy");
  const Icon = nightClear ? Moon : (ICONS[condition] ?? Cloud);
  return <Icon size={size} aria-hidden="true" />;
}

export function WeatherStat({
  icon,
  label,
  value,
}: {
  icon: "wind" | "eye" | "temp" | "humidity";
  label: string;
  value: string;
}) {
  const Icon =
    icon === "wind"
      ? Wind
      : icon === "eye"
        ? Eye
        : icon === "temp"
          ? Thermometer
          : Droplets;
  return (
    <div className="weather-stat">
      <Icon size={14} aria-hidden="true" />
      <span className="weather-stat-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
