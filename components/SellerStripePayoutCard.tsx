"use client";

import { useState } from "react";
import type { Lang } from "@/lib/i18n-lang";

export default function SellerStripePayoutCard({
  lang,
  hasStripeConnect,
}: {
  lang: Lang;
  hasStripeConnect?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/connect/onboarding", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hasStripeConnect ? {} : { email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg((data as { error?: string }).error ?? "Error");
        return;
      }
      const url = (data as { url?: string }).url;
      if (url) window.location.href = url;
    } catch {
      setMsg(lang === "es" ? "No se pudo abrir Stripe" : "Could not start Stripe");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-[#E5E0D8] p-6 mb-5 shadow-sm">
      <h2 className="font-serif text-lg font-bold text-[#1C1917] mb-2">
        {lang === "es" ? "Cobros por carrito (artículos)" : "Payouts (item cart)"}
      </h2>
      <p className="text-sm text-[#6B7280] mb-4 leading-relaxed">
        {lang === "es"
          ? "Los compradores pueden pagar artículos en el carrito. Conecta una cuenta Stripe Express para recibir el subtotal del artículo. Sarvaone retiene la comisión y el IVA mostrados al pagar."
          : "Buyers can pay for goods in the cart. Connect a Stripe Express account to receive the item subtotal. Sarvaone keeps the commission + VAT line shown at checkout."}
      </p>
      {hasStripeConnect && (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
          {lang === "es" ? "Cuenta Stripe vinculada — abre de nuevo si debes completar la verificación." : "Stripe account linked — you can reopen onboarding to finish verification."}
        </p>
      )}
      {!hasStripeConnect && (
        <>
          <label className="block text-xs font-semibold text-[#6B7280] mb-1">
            {lang === "es" ? "Correo para Stripe" : "Email for Stripe"}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="w-full border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm mb-3 focus:outline-none focus:border-[#1B4332]"
          />
        </>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className="w-full py-3 rounded-xl bg-[#635BFF] text-white text-sm font-semibold disabled:opacity-50"
      >
        {busy
          ? "…"
          : hasStripeConnect
            ? lang === "es"
              ? "Abrir verificación Stripe"
              : "Open Stripe dashboard"
            : lang === "es"
              ? "Continuar con Stripe"
              : "Continue with Stripe"}
      </button>
      {msg && <p className="mt-3 text-xs text-red-600">{msg}</p>}
    </div>
  );
}
