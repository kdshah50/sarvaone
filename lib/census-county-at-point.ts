import "server-only";

import { njColoniaSlugFromCountyDisplayLabel } from "@/lib/nj-county-label-to-slug";

type CensusCountyRow = { BASENAME?: string; NAME?: string };

type CensusGeomResponse = {
  result?: { geographies?: { Counties?: CensusCountyRow[] } };
};

/**
 * USDA Census REST: county containing (lat, lng) in NAD83.
 * `x` = longitude, `y` = latitude. Free, no API key.
 */
export async function censusCountySlugAtLngLat(
  lng: number,
  lat: number,
): Promise<{ slug: string; label: string } | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const u = new URL("https://geocoding.geo.census.gov/geocoder/geographies/coordinates");
  u.searchParams.set("x", String(lng));
  u.searchParams.set("y", String(lat));
  u.searchParams.set("benchmark", "Public_AR_Current");
  u.searchParams.set("vintage", "Current_Current");
  u.searchParams.set("layers", "Counties");
  u.searchParams.set("format", "json");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7_000);
  try {
    const res = await fetch(u.toString(), { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as CensusGeomResponse;
    const row = body.result?.geographies?.Counties?.[0];
    const basename = typeof row?.BASENAME === "string" ? row.BASENAME : "";
    const name = typeof row?.NAME === "string" ? row.NAME : "";
    const label = basename || name;
    const slug = njColoniaSlugFromCountyDisplayLabel(label);
    return slug ? { slug, label: label.includes("County") ? label : `${label} County` } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
