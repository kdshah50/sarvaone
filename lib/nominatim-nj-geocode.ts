import "server-only";

import { njColoniaSlugFromCountyDisplayLabel } from "@/lib/nj-county-label-to-slug";

type NomiAddr = {
  county?: string;
  state?: string;
};

export type NjNominatimHit = {
  lat: number;
  lng: number;
  coloniaSlug: string;
};

function nominatimUserAgent(): string {
  const u = process.env.NOMINATIM_USER_AGENT?.trim();
  return (
    u ||
    "SarvaoneDev/1.0 (NJ place→county resolver; https://github.com/kdshah50/Sarvaone)"
  );
}

/**
 * Free-text placemark → NJ centroid + inferred county via OSM (Nominatim).
 * Per https://operations.osmfoundation.org/policies/nominatim/ — honour User-Agent env in production.
 */
export async function nominatimGeocodeNjPlace(placePhrase: string): Promise<NjNominatimHit | null> {
  const q = `${placePhrase.trim()}, NJ, USA`;
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("q", q);
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("limit", "1");
  u.searchParams.set("addressdetails", "1");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": nominatimUserAgent(),
      },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as {
      lat?: string;
      lon?: string;
      address?: NomiAddr;
    }[];
    const hit = Array.isArray(arr) ? arr[0] : null;
    const lat = hit?.lat != null ? parseFloat(hit.lat) : NaN;
    const lng = hit?.lon != null ? parseFloat(hit.lon) : NaN;
    const st = typeof hit?.address?.state === "string" ? hit.address.state.toLowerCase() : "";
    const countyLab = typeof hit?.address?.county === "string" ? hit.address.county : "";
    if (!(st === "nj" || st === "new jersey")) return null;
    const coloniaSlug = njColoniaSlugFromCountyDisplayLabel(countyLab);
    if (!coloniaSlug || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng: lng, coloniaSlug };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
