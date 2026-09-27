/**
 * E2E for the four promotable menu verticals:
 * home cleaning, pet care (dog walking), veterinary, fixed-fare taxi.
 *
 * Seeds temporary cleaning/pet/vet listings (prod currently only has taxi menus),
 * runs quote → accept → simulated deposit → lifecycle → cleanup.
 *
 * Requires: .env.local (Supabase + JWT_SECRET) and `npm run dev` on :3006.
 * Run: npx tsx scripts/test-four-verticals-e2e.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import {
  dogWalkingStarterMenu,
  housekeepingStarterMenu,
  veterinaryStarterMenu,
} from "../lib/listing-service-menu";

function loadDotenv() {
  for (const name of [".env.local", ".env"]) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

async function jwtFor(userId: string): Promise<string> {
  const raw = process.env.JWT_SECRET?.trim();
  const secret = new TextEncoder().encode(
    raw && raw.length > 0 ? raw : "tianguis_dev_secret_change_in_production",
  );
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

const FETCH_MS = 90_000;

async function fetchJson(
  base: string,
  path: string,
  opts: RequestInit & { cookieJwt?: string } = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const { cookieJwt, ...init } = opts;
  const headers = new Headers(init.headers);
  if (cookieJwt) headers.set("Cookie", `tianguis_token=${cookieJwt}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(`${base}${path}`, { ...init, headers, signal: ctrl.signal });
    const text = await res.text();
    let data: unknown = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text.slice(0, 400) };
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtml(base: string, path: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(`${base}${path}`, { signal: ctrl.signal });
    return { ok: res.ok, status: res.status, html: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

function fail(msg: string): never {
  console.error("FAIL:", msg);
  process.exit(1);
}

function ok(msg: string) {
  console.log("  ✓", msg);
}

type Vert = {
  key: string;
  landing: string;
  titleMustInclude?: string;
  listingId?: string;
  sellerId?: string;
  title?: string;
  sku?: string;
  seeded?: boolean;
};

async function cleanupBooking(
  supabase: SupabaseClient,
  opts: { bookingId?: string; listingId: string; buyerId: string; conversationId?: string },
) {
  if (opts.bookingId) {
    await supabase.from("service_booking_events").delete().eq("booking_id", opts.bookingId);
    await supabase.from("service_bookings").delete().eq("id", opts.bookingId);
  }
  await supabase
    .from("listing_service_contact_gate")
    .delete()
    .eq("listing_id", opts.listingId)
    .eq("buyer_id", opts.buyerId);
  if (opts.conversationId) {
    await supabase.from("listing_messages").delete().eq("conversation_id", opts.conversationId);
    await supabase.from("listing_conversations").delete().eq("id", opts.conversationId);
  }
}

async function runVerticalFlow(
  base: string,
  supabase: SupabaseClient,
  vert: Required<Pick<Vert, "key" | "listingId" | "sellerId" | "sku">> & { title: string },
) {
  console.log(`\n════ ${vert.key.toUpperCase()} ════`);
  console.log(`  listing: ${vert.title.slice(0, 60)}`);
  console.log(`  sku: ${vert.sku}`);

  const listingId = vert.listingId;
  const sellerId = vert.sellerId;
  const buyerId = randomUUID();
  const buyerToken = await jwtFor(buyerId);
  const sellerToken = await jwtFor(sellerId);

  const page = await fetchHtml(base, `/listing/${listingId}`);
  if (!page.ok) fail(`${vert.key}: listing page ${page.status}`);
  if (!page.html.includes("Service menu") && !page.html.includes("Menú de servicios")) {
    fail(`${vert.key}: listing page missing service menu`);
  }
  ok("Listing page shows service menu");

  const preferredAt = new Date(Date.now() + 48 * 3600_000).toISOString();
  const buyerContact = {
    firstName: "E2E",
    lastName: vert.key.replace(/_/g, " "),
    contactPhone: "15555550998",
    whatsappPhone: null,
    serviceAddress: "123 Main St, Edison, NJ 08817",
    preferredAt,
    ...(vert.key === "taxi"
      ? {
          pickupAddress: "123 Main St, Edison, NJ 08817",
          dropoffAddress: "EWR Airport, Newark, NJ",
        }
      : {}),
  };

  const req = await fetchJson(base, `/api/listings/${listingId}/service-booking/quote/request`, {
    method: "POST",
    cookieJwt: buyerToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cartLines: [{ sku: vert.sku, qty: 1 }],
      lang: "en",
      buyerContact,
      buyerNotes: `E2E four-verticals test (${vert.key}) — safe to delete`,
    }),
  });
  if (!req.ok) fail(`${vert.key} quote/request: ${req.status} ${JSON.stringify(req.data)}`);
  ok("Buyer quote request");

  const convRes = await fetchJson(base, `/api/conversations?listingId=${encodeURIComponent(listingId)}`, {
    cookieJwt: buyerToken,
  });
  const conversationId =
    (convRes.data as { conversations?: { id: string }[] })?.conversations?.[0]?.id;
  if (!conversationId) fail(`${vert.key}: no conversation after request`);

  const { data: gateBefore } = await supabase
    .from("listing_service_contact_gate")
    .select("quote_status,quote_line_items")
    .eq("listing_id", listingId)
    .eq("buyer_id", buyerId)
    .maybeSingle();
  if (!gateBefore?.quote_line_items) fail(`${vert.key}: missing quote_line_items`);
  const lineItems = gateBefore.quote_line_items as {
    sku: string;
    qty: number;
    price_mxn_cents: number;
  }[];
  const agreedTotal = lineItems.reduce((s, it) => s + it.price_mxn_cents * (it.qty ?? 1), 0);
  ok(`Line items total $${(agreedTotal / 100).toFixed(2)}`);

  const send = await fetchJson(base, `/api/listings/${listingId}/service-booking/quote/send`, {
    method: "POST",
    cookieJwt: sellerToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buyerId,
      agreedSubtotalMxnCents: agreedTotal,
      quoteLineItems: lineItems,
      lang: "en",
    }),
  });
  if (!send.ok) fail(`${vert.key} quote/send: ${send.status} ${JSON.stringify(send.data)}`);
  ok("Seller sent quote");

  const accept = await fetchJson(base, `/api/listings/${listingId}/service-booking/quote/respond`, {
    method: "POST",
    cookieJwt: buyerToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "accept", lang: "en" }),
  });
  if (!accept.ok) fail(`${vert.key} quote/respond: ${accept.status} ${JSON.stringify(accept.data)}`);
  ok("Buyer accepted quote");

  const commissionCents = Math.max(1000, Math.round(agreedTotal * 0.1));
  const bookingId = randomUUID();
  const { error: insErr } = await supabase.from("service_bookings").insert({
    id: bookingId,
    listing_id: listingId,
    buyer_id: buyerId,
    seller_id: sellerId,
    commission_amount_cents: commissionCents,
    commission_pct: 10,
    pricing_base_mxn_cents: agreedTotal,
    payment_status: "paid",
    paid_at: new Date().toISOString(),
    status: "confirmed",
    stripe_checkout_session_id: `e2e4_${bookingId}`,
    seller_phone_snapshot: "15555550201",
    contact_revealed_at: new Date().toISOString(),
    note: `E2E four-verticals (${vert.key})`,
  });
  if (insErr) fail(`${vert.key} insert booking: ${insErr.message}`);
  await supabase
    .from("service_bookings")
    .update({ ticket_code: `E2E4-${bookingId.slice(0, 8).toUpperCase()}` })
    .eq("id", bookingId);
  ok("Simulated deposit (paid booking)");

  const appt = new Date(Date.now() + 72 * 3600_000).toISOString();
  for (const [status, body] of [
    ["scheduled", { status: "scheduled", appointmentAt: appt }],
    ["in_progress", { status: "in_progress" }],
    ["completed", { status: "completed" }],
  ] as const) {
    const patch = await fetchJson(base, `/api/bookings/${bookingId}`, {
      method: "PATCH",
      cookieJwt: sellerToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!patch.ok) fail(`${vert.key} PATCH ${status}: ${patch.status} ${JSON.stringify(patch.data)}`);
    ok(`Lifecycle → ${status}`);
  }

  const getBooking = await fetchJson(base, `/api/bookings/${bookingId}`, { cookieJwt: buyerToken });
  if (!getBooking.ok) fail(`${vert.key} GET booking: ${getBooking.status}`);
  const b = getBooking.data as { status?: string; balanceDueMxnCents?: number; isBuyer?: boolean };
  if (b.status !== "completed" || !b.isBuyer) fail(`${vert.key}: buyer booking state bad`);
  if ((b.balanceDueMxnCents ?? 0) < 100) fail(`${vert.key}: balance due missing`);
  ok(`Buyer sees completed + balance $${((b.balanceDueMxnCents ?? 0) / 100).toFixed(2)}`);

  await cleanupBooking(supabase, { bookingId, listingId, buyerId, conversationId });
  ok("Cleanup booking rows");
  return true;
}

async function main() {
  loadDotenv();
  const base = (process.env.MESSAGING_TEST_BASE_URL ?? "http://127.0.0.1:3006").replace(/\/$/, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("Missing Supabase env");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  console.log(`Four-verticals E2E → ${base}`);

  // Keep Next.js dev idle-killer from exiting during headless API tests.
  const keepAlive = setInterval(() => {
    fetch(`${base}/api/dev/heartbeat`, { method: "POST" }).catch(() => {});
  }, 15_000);
  fetch(`${base}/api/dev/heartbeat`, { method: "POST" }).catch(() => {});

  try {
  const ping = await fetchJson(base, "/api/conversations/inbox");
  if (ping.status !== 401) fail(`Dev server not ready (inbox ${ping.status}). Run npm run dev.`);
  ok("API reachable");

  console.log("\n— Landing pages —");
  for (const [path, needle] of [
    ["/home-cleaning", "clean"],
    ["/pet-care", "pet"],
    ["/veterinary", "vet"],
    ["/ride-share", "Middlesex"],
  ] as const) {
    const r = await fetchHtml(base, path);
    if (!r.ok) fail(`${path} → ${r.status}`);
    if (!r.html.toLowerCase().includes(needle.toLowerCase())) {
      fail(`${path} missing expected copy (${needle})`);
    }
    ok(`${path} loads`);
  }

  // Existing taxi listing
  const { data: taxiRows } = await supabase
    .from("listings")
    .select("id,seller_id,title_es,service_menu")
    .eq("status", "active")
    .ilike("title_es", "Transporte / Taxi%")
    .not("service_menu", "is", null)
    .limit(5);
  const taxi = (taxiRows ?? []).find((r) => {
    const items = (r.service_menu as { items?: { sku: string }[] })?.items;
    return r.seller_id && Array.isArray(items) && items.length > 0;
  });
  if (!taxi) fail("No taxi listing with service_menu — run seed-middlesex-taxi-drivers.sql");

  const taxiItems = (taxi.service_menu as { items: { sku: string }[] }).items;
  const taxiSku =
    taxiItems.find((i) => i.sku.includes("ewr") || i.sku.includes("airport"))?.sku ?? taxiItems[0].sku;

  // Seller for seeded listings (reuse a known taxi seller so JWT works)
  const seedSellerId = String(taxi.seller_id);

  const seedMarker = "(E2E four-verticals temp)";
  const toSeed = [
    {
      key: "cleaning",
      title_es: `Limpieza del hogar — Edison E2E ${seedMarker}`,
      title_en: `House Cleaning — Edison E2E ${seedMarker}`,
      category_id: "services",
      menu: housekeepingStarterMenu(),
      skuPick: (items: { sku: string }[]) =>
        items.find((i) => i.sku.includes("std_base"))?.sku ?? items[0]?.sku,
    },
    {
      key: "pet",
      title_es: `Paseador de perros — Edison E2E ${seedMarker}`,
      title_en: `Dog Walker — Edison E2E ${seedMarker}`,
      category_id: "pet_care",
      menu: dogWalkingStarterMenu(),
      skuPick: (items: { sku: string }[]) => items[0]?.sku,
    },
    {
      key: "vet",
      title_es: `Servicios veterinarios — Edison E2E ${seedMarker}`,
      title_en: `Veterinary Services — Edison E2E ${seedMarker}`,
      category_id: "services",
      menu: veterinaryStarterMenu(),
      skuPick: (items: { sku: string }[]) =>
        items.find((i) => i.sku.includes("consult_general") || i.sku.includes("wellness"))?.sku ??
        items[0]?.sku,
    },
  ];

  // Clean any leftover seeds
  await supabase.from("listings").delete().ilike("title_es", `%${seedMarker}%`);

  const seededIds: string[] = [];
  const verticals: Array<{
    key: string;
    listingId: string;
    sellerId: string;
    sku: string;
    title: string;
  }> = [];

  for (const s of toSeed) {
    const { data: inserted, error } = await supabase
      .from("listings")
      .insert({
        seller_id: seedSellerId,
        title_es: s.title_es,
        title_en: s.title_en,
        description_es: `Temp E2E listing ${seedMarker}`,
        description_en: `Temp E2E listing ${seedMarker}`,
        price_mxn: 5000,
        category_id: s.category_id,
        condition: "good",
        status: "active",
        is_verified: true,
        location_city: "Edison",
        location_state: "New Jersey",
        zip_code: "08817",
        location_lat: 40.5182,
        location_lng: -74.3895,
        shipping_available: false,
        negotiable: true,
        photo_urls: [],
        payment_methods: ["efectivo", "stripe"],
        service_menu: s.menu,
        expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      })
      .select("id,title_es,service_menu")
      .single();
    if (error || !inserted) fail(`Seed ${s.key}: ${error?.message}`);
    seededIds.push(inserted.id);
    const items = (inserted.service_menu as { items: { sku: string }[] }).items ?? [];
    const sku = s.skuPick(items);
    if (!sku) fail(`Seed ${s.key}: no sku`);
    verticals.push({
      key: s.key,
      listingId: inserted.id,
      sellerId: seedSellerId,
      sku,
      title: inserted.title_es,
    });
    ok(`Seeded ${s.key} listing ${inserted.id.slice(0, 8)}…`);
  }

  verticals.push({
    key: "taxi",
    listingId: String(taxi.id),
    sellerId: String(taxi.seller_id),
    sku: taxiSku,
    title: String(taxi.title_es),
  });

  const results: Record<string, "PASS" | "FAIL"> = {};
  try {
    for (const v of verticals) {
      try {
        await runVerticalFlow(base, supabase, v);
        results[v.key] = "PASS";
      } catch (e) {
        results[v.key] = "FAIL";
        throw e;
      }
    }
  } finally {
    if (seededIds.length) {
      await supabase.from("listings").delete().in("id", seededIds);
      console.log(`\nRemoved ${seededIds.length} temp seeded listings`);
    }
  }

  console.log("\n════════ SUMMARY ════════");
  for (const k of ["cleaning", "pet", "vet", "taxi"]) {
    console.log(`  ${k}: ${results[k] ?? "SKIPPED"}`);
  }
  console.log("\nNote: Stripe deposit UI not exercised (DB-simulated paid booking).");
  console.log("OK — all four vertical booking flows passed.");
  } finally {
    clearInterval(keepAlive);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
