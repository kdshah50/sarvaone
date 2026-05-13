import "server-only";

import { COLONIAS, detectColoniaInQuery } from "@/lib/colonias";
import { detectZipInQuery, normalizeUsZip5 } from "@/lib/us-zip";
import { geocodeUsZip } from "@/lib/geocode-us-zip";
import { censusCountySlugAtLngLat } from "@/lib/census-county-at-point";
import { nominatimGeocodeNjPlace } from "@/lib/nominatim-nj-geocode";
import { extractNjPlaceFromQuery } from "@/lib/extract-nj-place-from-query";

export type NjLocationEnrichment = "none" | "colonia_alias" | "zip_county" | "city_osm";

export type NjShopperSearchContextInfer = {
  cleanedQuery: string;
  inferredCountySlug: string;
  shopperLat: number | null;
  shopperLng: number | null;
  enrichment: NjLocationEnrichment;
  geoZipApplied: string | null;
};

function isValidCountyChip(k: string): boolean {
  return Boolean(k && k !== "otro" && k in COLONIAS);
}

/**
 * Strip ZIP placenames / alias noise from `q`, fill shopper coords when missing,
 * infer NJ county slug (Census ZIP centroid or Nominatim city county) unless `lockedColoniaSlug` wins.
 */
export async function inferNjShopperSearchContext(opts: {
  rawQuery: string;
  zipParam?: string | null;
  shopperLat?: number | null;
  shopperLng?: number | null;
  lockedColoniaSlug?: string | null;
}): Promise<NjShopperSearchContextInfer> {
  let cleaned = opts.rawQuery.trim().replace(/\s+/g, " ");
  let enrichment: NjLocationEnrichment = "none";
  let inferredCountySlug = "";

  let lat =
    opts.shopperLat != null && Number.isFinite(opts.shopperLat) ? opts.shopperLat : null;
  let lng =
    opts.shopperLng != null && Number.isFinite(opts.shopperLng) ? opts.shopperLng : null;

  const locked = (opts.lockedColoniaSlug ?? "").trim().toLowerCase();
  const lockedValid = isValidCountyChip(locked);

  if (!lockedValid) {
    const hitAlias = detectColoniaInQuery(cleaned);
    if (hitAlias) {
      inferredCountySlug = hitAlias.coloniaKey;
      cleaned = (hitAlias.cleanedQuery ?? cleaned).replace(/\s+/g, " ").trim();
      enrichment = "colonia_alias";
    }
  }

  const zipFromParam = normalizeUsZip5(opts.zipParam ?? "");
  const zipInText = detectZipInQuery(cleaned);
  const zipResolved = zipFromParam ?? zipInText?.zip ?? null;

  let geoZipApplied: string | null = null;

  if (zipResolved) {
    geoZipApplied = zipResolved;
    if (zipInText?.zip === zipResolved) {
      cleaned = zipInText.cleanedQuery.replace(/\s+/g, " ").trim();
    }
    const geo = await geocodeUsZip(zipResolved);
    if (geo) {
      if (lat == null || lng == null) {
        lat = geo.lat;
        lng = geo.lng;
      }
      if (!lockedValid && !inferredCountySlug) {
        const c = await censusCountySlugAtLngLat(geo.lng, geo.lat);
        if (c?.slug) {
          inferredCountySlug = c.slug;
          enrichment = "zip_county";
        }
      }
    }
  }

  const placeExtract = extractNjPlaceFromQuery(cleaned);
  if (placeExtract) {
    const inferCountyFromCity = !lockedValid && !inferredCountySlug;
    if (inferCountyFromCity) {
      const nom = await nominatimGeocodeNjPlace(placeExtract.phrase);
      if (nom?.coloniaSlug) {
        inferredCountySlug = nom.coloniaSlug;
        enrichment = "city_osm";
        if (lat == null || lng == null) {
          lat = nom.lat;
          lng = nom.lng;
        }
      }
    } else if (lockedValid && (lat == null || lng == null)) {
      const nom = await nominatimGeocodeNjPlace(placeExtract.phrase);
      if (
        nom &&
        Number.isFinite(nom.lat) &&
        Number.isFinite(nom.lng) &&
        (lat == null || lng == null)
      ) {
        lat = nom.lat;
        lng = nom.lng;
      }
    }
    cleaned = placeExtract.strippedQuery.replace(/\s+/g, " ").trim();
  }

  return {
    cleanedQuery: cleaned,
    inferredCountySlug,
    shopperLat: lat,
    shopperLng: lng,
    enrichment,
    geoZipApplied,
  };
}
