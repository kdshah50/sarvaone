/**
 * Seed verified menu listings for cleaning, pet walking, and veterinary (Middlesex).
 * Taxi already seeded via seed-middlesex-taxi-drivers.sql.
 *
 * Run: npx tsx scripts/seed-menu-verticals.ts
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
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

const MARKER = "(Sarvaone demo menu Middlesex)";

async function main() {
  loadDotenv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const providers = [
    {
      phone: "15555550301",
      display_name: "Edison Fresh Clean",
      title_es: `Limpieza del hogar — Edison Fresh Clean — Edison, NJ`,
      title_en: `House Cleaning — Edison Fresh Clean — Edison, NJ`,
      description_es: `Limpieza residencial con menú fijo. Cotización en chat, depósito en app. ${MARKER}`,
      description_en: `Residential cleaning with fixed menu. Quote in chat, deposit in app. ${MARKER}`,
      category_id: "services",
      menu: housekeepingStarterMenu(),
      city: "Edison",
      zip: "08817",
      lat: 40.5182,
      lng: -74.3895,
      price_mxn: 45000,
    },
    {
      phone: "15555550302",
      display_name: "Paws on Parkway",
      title_es: `Paseador de perros — Paws on Parkway — Edison, NJ`,
      title_en: `Dog Walker — Paws on Parkway — Edison, NJ`,
      description_es: `Paseos con menú fijo. Cotización en chat, depósito en app. ${MARKER}`,
      description_en: `Dog walks with fixed menu. Quote in chat, deposit in app. ${MARKER}`,
      category_id: "pet_care",
      menu: dogWalkingStarterMenu(),
      city: "Edison",
      zip: "08817",
      lat: 40.52,
      lng: -74.39,
      price_mxn: 20000,
    },
    {
      phone: "15555550303",
      display_name: "Middlesex Pet Clinic Demo",
      title_es: `Servicios veterinarios — Middlesex Pet Clinic — New Brunswick, NJ`,
      title_en: `Veterinary Services — Middlesex Pet Clinic — New Brunswick, NJ`,
      description_es: `Clínica demo con menú fijo. Cotización en chat, depósito en app. ${MARKER}`,
      description_en: `Demo clinic with fixed menu. Quote in chat, deposit in app. ${MARKER}`,
      category_id: "services",
      menu: veterinaryStarterMenu(),
      city: "New Brunswick",
      zip: "08901",
      lat: 40.4862,
      lng: -74.4518,
      price_mxn: 35000,
    },
  ];

  // Remove prior demo rows
  await supabase.from("listings").delete().ilike("description_es", `%${MARKER}%`);

  for (const p of providers) {
    const { data: user, error: uErr } = await supabase
      .from("users")
      .upsert(
        {
          phone: p.phone,
          display_name: p.display_name,
          trust_badge: "silver",
          phone_verified: true,
        },
        { onConflict: "phone" },
      )
      .select("id")
      .single();
    if (uErr || !user) throw new Error(`user ${p.phone}: ${uErr?.message}`);

    const { data: listing, error: lErr } = await supabase
      .from("listings")
      .insert({
        seller_id: user.id,
        title_es: p.title_es,
        title_en: p.title_en,
        description_es: p.description_es,
        description_en: p.description_en,
        price_mxn: p.price_mxn,
        category_id: p.category_id,
        condition: "good",
        status: "active",
        is_verified: true,
        location_city: p.city,
        location_state: "New Jersey",
        zip_code: p.zip,
        location_lat: p.lat,
        location_lng: p.lng,
        shipping_available: false,
        negotiable: true,
        photo_urls: [],
        payment_methods: ["stripe", "efectivo"],
        service_menu: p.menu,
        expires_at: new Date(Date.now() + 180 * 86400_000).toISOString(),
      })
      .select("id,title_es")
      .single();
    if (lErr || !listing) throw new Error(`listing ${p.phone}: ${lErr?.message}`);
    console.log("✓", listing.title_es, listing.id);
  }
  console.log("OK — seeded cleaning, pet walking, veterinary menu listings");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
