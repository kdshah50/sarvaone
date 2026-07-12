import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authOtpChannelForPhone, type AuthOtpChannel } from "@/lib/auth-otp-channel";
import { canonicalizeAuthPhone, isValidAuthPhone, normalizeAuthPhone } from "@/lib/phone";
import { clientIpFromHeaders, rateLimitMemory } from "@/lib/rate-limit-memory";
import { getSupabaseUrl } from "@/lib/service-rest";
import {
  isTwilioSmsConfigured,
  isTwilioWhatsAppConfigured,
  sendSmsToE164Digits,
  sendWhatsApp,
} from "@/lib/twilio";

function generateOTP() {
  return Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
}

function getRequiredEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function logSupabaseError(step: string, phone: string, err: unknown) {
  const e = err as { message?: string; code?: string; details?: string; hint?: string; status?: number };
  console.error(`[send-otp] ${step}`, {
    phone,
    message: e?.message,
    code: e?.code,
    details: e?.details,
    hint: e?.hint,
    status: e?.status,
    raw: typeof err === "object" ? JSON.stringify(err) : String(err),
  });
}

function newRequestId(req: NextRequest) {
  return req.headers.get("x-vercel-id") ?? globalThis.crypto?.randomUUID?.() ?? String(Date.now());
}

function otpMessageBody(code: string): string {
  return `Your Sarvaone code is: *${code}*\nValid 5 minutes. Do not share it.`;
}

async function deliverOtp(
  phone: string,
  channel: AuthOtpChannel,
  code: string,
  requestId: string,
): Promise<{ ok: boolean; twilioStatus?: number; twilioError?: string; twilioCode?: number }> {
  const msgBody = otpMessageBody(code);

  if (channel === "sms") {
    console.log("[send-otp] sms-attempt", { requestId, phone });
    const ok = await sendSmsToE164Digits(phone, msgBody.replace(/\*/g, ""));
    return { ok };
  }

  const destinations = [phone];
  if (/^52\d{10}$/.test(phone)) {
    destinations.push(`521${phone.slice(2)}`);
  }

  const results = await Promise.all(
    destinations.map(async (dest) => {
      console.log("[send-otp] whatsapp-attempt", { requestId, phone: dest });
      const ok = await sendWhatsApp(dest, msgBody);
      return { dest, ok };
    }),
  );

  const anyOk = results.some((r) => r.ok);
  if (anyOk) return { ok: true };

  return { ok: false, twilioStatus: 500, twilioError: "WhatsApp delivery failed" };
}

export async function POST(req: NextRequest) {
  const requestId = newRequestId(req);
  let step: "validate" | "rate_limit" | "insert" | "twilio" | "done" = "validate";
  try {
    const supabase = createClient(getSupabaseUrl(), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const body = await req.json();
    let phone = normalizeAuthPhone(String(body?.phone ?? ""));
    phone = canonicalizeAuthPhone(phone);
    const channel = authOtpChannelForPhone(phone);

    if (!phone || !isValidAuthPhone(phone)) {
      return NextResponse.json(
        {
          error: "Número inválido (México: 10 dígitos; EE.UU.: 10 dígitos con código +1)",
          requestId,
        },
        { status: 400 },
      );
    }

    const ip = clientIpFromHeaders(req.headers);
    const ipRl = rateLimitMemory(`send-otp-ip:${ip}`, 25, 15 * 60 * 1000);
    if (!ipRl.ok) {
      return NextResponse.json(
        { error: "Demasiados intentos desde esta red. Espera 15 minutos.", requestId },
        { status: 429 },
      );
    }

    step = "rate_limit";
    const rateLimitWindow = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const maxOtpsPerWindow = 10;
    const { data: recentOtps, error: rateLimitError } = await supabase
      .from("otp_codes")
      .select("id")
      .eq("phone", phone)
      .gte("created_at", rateLimitWindow)
      .order("created_at", { ascending: false })
      .limit(maxOtpsPerWindow);
    if (rateLimitError) {
      logSupabaseError("rate-limit-query-failed", phone, rateLimitError);
      return NextResponse.json(
        { error: "No se pudo enviar el código OTP", requestId, step: "rate_limit" },
        { status: 500 },
      );
    }
    if ((recentOtps?.length ?? 0) >= maxOtpsPerWindow) {
      return NextResponse.json({ error: "Demasiados intentos. Espera 15 minutos.", requestId }, { status: 429 });
    }

    const smsConfigured = isTwilioSmsConfigured();
    const whatsappConfigured = isTwilioWhatsAppConfigured();
    const channelConfigured = channel === "sms" ? smsConfigured : whatsappConfigured;

    if (process.env.NODE_ENV === "production" && !channelConfigured) {
      const missing =
        channel === "sms"
          ? "TWILIO_SMS_FROM (US text login)"
          : "TWILIO_WHATSAPP_FROM (WhatsApp login)";
      console.error("[send-otp] production missing channel config", { requestId, channel, missing });
      return NextResponse.json(
        {
          error: `Verificación no configurada en el servidor (${missing}).`,
          requestId,
          step: "twilio_config",
          channel,
        },
        { status: 503 },
      );
    }

    step = "insert";
    const code = generateOTP();
    const { error: insertError } = await supabase.from("otp_codes").insert({
      phone,
      code,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    if (insertError) {
      logSupabaseError("otp-insert-failed", phone, insertError);
      return NextResponse.json({ error: "No se pudo enviar el código OTP", requestId, step: "insert" }, { status: 500 });
    }

    if (channelConfigured) {
      step = "twilio";
      const delivery = await deliverOtp(phone, channel, code, requestId);

      if (!delivery.ok) {
        const twilioError = delivery.twilioError ?? "";
        const sandboxHint =
          channel === "whatsapp" &&
          (/63016|not a valid WhatsApp user|join.*sandbox/i.test(twilioError)
            ? " Si usas el sandbox de Twilio, envía primero el mensaje de unión al número de prueba."
            : "");

        if (process.env.NODE_ENV !== "production") {
          console.warn("[send-otp] Twilio failed in development — returning devOtp", {
            requestId,
            phone,
            channel,
            twilioError,
          });
          step = "done";
          return NextResponse.json({
            ok: true,
            channel,
            devOtp: code,
            requestId,
            devTwilioFailed: true,
            devTwilioHint:
              `${channel === "sms" ? "SMS" : "WhatsApp"} did not deliver. Use the dev code on the verify page.${sandboxHint}`,
          });
        }

        return NextResponse.json(
          {
            error: `No se pudo enviar el código OTP${twilioError ? `: ${twilioError}` : ""}${sandboxHint}`,
            requestId,
            step: "twilio",
            channel,
            twilioStatus: delivery.twilioStatus,
            twilioCode: delivery.twilioCode,
          },
          { status: 500 },
        );
      }
    } else {
      console.log(`[DEV OTP] +${phone} (${channel}) -> ${code}`);
    }

    step = "done";
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ ok: true, channel, devOtp: code, requestId });
    }
    return NextResponse.json({ ok: true, channel, requestId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[send-otp] unhandled error", { requestId, step, message: msg });
    const clientMsg = process.env.NODE_ENV === "production" ? "No se pudo enviar el código OTP" : msg;
    return NextResponse.json({ error: clientMsg, requestId, step }, { status: 500 });
  }
}
