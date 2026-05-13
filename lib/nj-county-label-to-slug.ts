/**
 * Normalize US county labels ("Middlesex County", Nominatim `address.county`) to COLONIAS slugs.
 * New Jersey counties only — used after Census / OSM lookups.
 */
const NJ_COUNTY_NAME_TO_COLONIA: Record<string, string> = {
  atlantic: "atlantic",
  bergen: "bergen",
  burlington: "burlington",
  camden: "camden",
  "cape may": "cape_may",
  cumberland: "cumberland",
  essex: "essex",
  gloucester: "gloucester",
  hudson: "hudson",
  hunterdon: "hunterdon",
  mercer: "mercer",
  middlesex: "middlesex",
  monmouth: "monmouth",
  morris: "morris",
  ocean: "ocean",
  passaic: "passaic",
  salem: "salem",
  somerset: "somerset",
  sussex: "sussex",
  union: "union",
  warren: "warren",
};

export function njColoniaSlugFromCountyDisplayLabel(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const core = raw
    .trim()
    .replace(/\s+County$/i, "")
    .trim()
    .toLowerCase();
  return NJ_COUNTY_NAME_TO_COLONIA[core] ?? null;
}
