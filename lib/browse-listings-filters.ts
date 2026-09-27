import { categoryAllowsDevPendingListings } from "@/lib/marketplace-categories";

const E2E_TEMP_MARKER = "e2e four-verticals temp";
const DEMO_QA_MARKER = "(demo svc qa)";

type TitleRow = {
  id?: string;
  title_en?: string | null;
  title_es?: string | null;
};

/** Hide leftover automated-test listings from public browse and search. */
export function isHiddenTestListing(row: TitleRow): boolean {
  const blob = `${row.title_en ?? ""} ${row.title_es ?? ""}`.toLowerCase();
  return blob.includes(E2E_TEMP_MARKER);
}

/**
 * The demo QA seed has no unique key, so re-running it stacks identical titles.
 * Keep the first row of each demo title; leave real listings untouched.
 */
export function collapseRepeatedDemoQaListings<T extends TitleRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const title = `${row.title_en ?? ""} ${row.title_es ?? ""}`.trim().toLowerCase();
    if (title.includes(DEMO_QA_MARKER)) {
      if (seen.has(title)) continue;
      seen.add(title);
    }
    out.push(row);
  }
  return out;
}

export function publicBrowseRows<T extends TitleRow>(rows: T[]): T[] {
  return collapseRepeatedDemoQaListings(rows.filter((row) => !isHiddenTestListing(row)));
}

/**
 * PostgREST fragment: active listings + verification rule.
 * In development, `SHOW_PENDING_SERVICES=true` (in .env.local) also returns unverified rows for
 * **service-vertical** categories (`serviceVertical` in `marketplace-categories`) so hybrid search
 * can be tested before admin approval. Goods categories stay verified-only. Production always requires is_verified=true.
 */
export function postgrestActiveListingVerificationFragment(category: string): string {
  const pendingOk =
    process.env.NODE_ENV === "development" &&
    process.env.SHOW_PENDING_SERVICES === "true" &&
    categoryAllowsDevPendingListings(category);
  if (pendingOk) {
    return "status=eq.active&or=(is_verified.eq.true,is_verified.eq.false)";
  }
  return "status=eq.active&is_verified=eq.true";
}
