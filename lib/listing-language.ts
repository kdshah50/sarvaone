import type { Lang } from "@/lib/i18n-lang";

export type ListingTitleRow = {
  title_es?: string | null;
  title_en?: string | null;
  title_hi?: string | null;
  title_gu?: string | null;
};

export type ListingDescriptionRow = {
  description_es?: string | null;
  description_en?: string | null;
  description_hi?: string | null;
  description_gu?: string | null;
};

function firstNonEmpty(...vals: (string | null | undefined)[]): string {
  for (const v of vals) {
    const t = (v ?? "").trim();
    if (t) return t;
  }
  return "";
}

/** Picks the best title for `lang`, then sensible fallbacks so cards never go blank. */
export function listingTitle(row: ListingTitleRow, lang: Lang): string {
  const en = row.title_en;
  const es = row.title_es;
  const hi = row.title_hi;
  const gu = row.title_gu;
  if (lang === "en") return firstNonEmpty(en, hi, gu, es);
  if (lang === "es") return firstNonEmpty(es, en, hi, gu);
  if (lang === "hi") return firstNonEmpty(hi, en, es, gu);
  return firstNonEmpty(gu, hi, en, es);
}

export function listingDescription(row: ListingDescriptionRow, lang: Lang): string {
  const en = row.description_en;
  const es = row.description_es;
  const hi = row.description_hi;
  const gu = row.description_gu;
  if (lang === "en") return firstNonEmpty(en, hi, gu, es);
  if (lang === "es") return firstNonEmpty(es, en, hi, gu);
  if (lang === "hi") return firstNonEmpty(hi, en, es, gu);
  return firstNonEmpty(gu, hi, en, es);
}
