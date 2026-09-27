"use client";

import type { Lang } from "@/lib/i18n-lang";

type Props = {
  pickup: string;
  dropoff: string;
  lang?: Lang;
  className?: string;
};

/** Keep Google’s geocoder in the United States when the address omits a country. */
function usQuery(address: string): string {
  const q = address.trim();
  if (/\b(USA|U\.S\.A\.|United States)\b/i.test(q)) return q;
  return `${q}, USA`;
}

function googleEmbedSrc(pickup: string, dropoff: string, lang: Lang): string | null {
  const origin = pickup.trim();
  const destination = dropoff.trim();
  const hl = lang === "es" ? "es" : "en";
  if (origin && destination) {
    return (
      "https://maps.google.com/maps?output=embed&hl=" +
      hl +
      "&saddr=" +
      encodeURIComponent(usQuery(origin)) +
      "&daddr=" +
      encodeURIComponent(usQuery(destination))
    );
  }
  const one = origin || destination;
  if (!one) return null;
  return (
    "https://maps.google.com/maps?output=embed&hl=" +
    hl +
    "&z=14&q=" +
    encodeURIComponent(usQuery(one))
  );
}

function googleMapsHref(pickup: string, dropoff: string): string | null {
  const origin = pickup.trim();
  const destination = dropoff.trim();
  if (origin && destination) {
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("origin", usQuery(origin));
    url.searchParams.set("destination", usQuery(destination));
    url.searchParams.set("travelmode", "driving");
    return url.toString();
  }
  const one = origin || destination;
  if (!one) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(usQuery(one))}`;
}

export default function RideTripStaticMap({ pickup, dropoff, lang = "en", className = "" }: Props) {
  const es = lang === "es";
  const src = googleEmbedSrc(pickup, dropoff, lang);
  const href = googleMapsHref(pickup, dropoff);

  if (!src || !href) {
    return (
      <p className={`text-[11px] text-[#6B7280] italic ${className}`} role="status">
        {es ? "Agrega recogida y destino para ver el mapa." : "Add pickup and drop-off to see the map."}
      </p>
    );
  }

  return (
    <div className={className}>
      <iframe
        title={es ? "Ruta en Google Maps" : "Driving route on Google Maps"}
        src={src}
        className="w-full h-48 rounded-xl border border-[#E5E0D8] bg-[#E8E4DC]"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <p className="text-[10px] text-[#6B7280] mt-1.5 leading-snug">
        {es ? "Ruta en auto en Google Maps. " : "Driving route on Google Maps. "}
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline font-semibold text-[#1B4332]">
          {es ? "Abrir en Google Maps" : "Open in Google Maps"}
        </a>
      </p>
    </div>
  );
}
