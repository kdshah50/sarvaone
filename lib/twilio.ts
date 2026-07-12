import { canonicalizeAuthPhone, normalizeAuthPhone } from "@/lib/phone";

const TWILIO_SID = () => process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_TOKEN = () => process.env.TWILIO_AUTH_TOKEN ?? "";
const TWILIO_WHATSAPP_FROM = () => process.env.TWILIO_WHATSAPP_FROM ?? "";
const TWILIO_SMS_FROM = () => process.env.TWILIO_SMS_FROM ?? "";

/** True when WhatsApp outbound is configured (before validating recipient). */
export function isTwilioWhatsAppConfigured(): boolean {
  return Boolean(TWILIO_SID() && TWILIO_TOKEN() && TWILIO_WHATSAPP_FROM());
}

/** True when US SMS OTP can be sent (TWILIO_SMS_FROM is E.164, e.g. +15551234567). */
export function isTwilioSmsConfigured(): boolean {
  const from = TWILIO_SMS_FROM().trim();
  return Boolean(TWILIO_SID() && TWILIO_TOKEN() && from && /^\+?\d{10,15}$/.test(from.replace(/\s/g, "")));
}

function twilioAuthHeader(): string {
  return "Basic " + Buffer.from(`${TWILIO_SID()}:${TWILIO_TOKEN()}`).toString("base64");
}

function twilioMessagesUrl(): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID()}/Messages.json`;
}

function asWhatsappAddress(value: string) {
  const v = value.trim();
  if (!v) return v;
  if (v.startsWith("whatsapp:")) return v;
  const cleaned = v.replace(/^whatsapp:/, "");
  return `whatsapp:${cleaned.startsWith("+") ? cleaned : `+${cleaned}`}`;
}

function asSmsAddress(value: string) {
  const v = value.trim();
  if (!v) return v;
  return v.startsWith("+") ? v : `+${v}`;
}

const WHATSAPP_RETRY_AFTER_MS = 2200;

async function postTwilioMessage(form: URLSearchParams): Promise<{ ok: boolean; status: number; body: string }> {
  const url = twilioMessagesUrl();
  const auth = twilioAuthHeader();
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const text = await res.text();
      if (res.ok) return { ok: true, status: res.status, body: text };
      if (res.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      return { ok: false, status: res.status, body: text };
    } catch (e) {
      console.error("[twilio] send error", e);
      return { ok: false, status: 0, body: String(e) };
    }
  }
  return { ok: false, status: 0, body: "max retries" };
}

/**
 * US/CA login OTP via SMS. `toDigits` is E.164 without + (e.g. 15551234567).
 */
export async function sendSmsToE164Digits(toDigitsRaw: string, message: string): Promise<boolean> {
  const digits = canonicalizeAuthPhone(normalizeAuthPhone(String(toDigitsRaw ?? "")));
  if (!digits || !/^1\d{10}$/.test(digits)) {
    console.error("[twilio] invalid US SMS recipient", toDigitsRaw);
    return false;
  }
  const sid = TWILIO_SID();
  const token = TWILIO_TOKEN();
  const from = TWILIO_SMS_FROM();
  if (!sid || !token || !from) {
    console.error("[twilio] missing TWILIO_* or TWILIO_SMS_FROM for SMS");
    return false;
  }

  const form = new URLSearchParams({
    From: asSmsAddress(from),
    To: asSmsAddress(digits),
    Body: message,
  });
  const result = await postTwilioMessage(form);
  if (!result.ok) {
    console.error("[twilio] SMS send failed", { to: digits, status: result.status, body: result.body });
  }
  return result.ok;
}

/**
 * Send using E.164 digits only (no +). Handles US (+1) and Mexico (+52/+521) routes.
 */
export async function sendWhatsAppToE164Digits(toDigitsRaw: string, message: string): Promise<boolean> {
  const digits = canonicalizeAuthPhone(normalizeAuthPhone(String(toDigitsRaw ?? "")));
  if (!digits) {
    console.error("[twilio] empty E.164 digits for WhatsApp");
    return false;
  }

  const trySend = async (): Promise<boolean> => {
    if (/^52\d{10}$/.test(digits)) {
      return sendWhatsApp(`521${digits.slice(2)}`, message);
    }
    if (/^521\d{10}$/.test(digits)) {
      return sendWhatsApp(digits, message);
    }
    return sendWhatsApp(digits, message);
  };

  if (await trySend()) return true;
  await new Promise((r) => setTimeout(r, WHATSAPP_RETRY_AFTER_MS));
  return trySend();
}

export async function sendWhatsApp(to: string, message: string): Promise<boolean> {
  const sid = TWILIO_SID();
  const token = TWILIO_TOKEN();
  const from = TWILIO_WHATSAPP_FROM();
  if (!sid || !token || !from || !to) {
    console.error("[twilio] missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, or empty recipient");
    return false;
  }

  const form = new URLSearchParams({
    From: asWhatsappAddress(from),
    To: asWhatsappAddress(to),
    Body: message,
  });
  const result = await postTwilioMessage(form);
  if (!result.ok) {
    console.error("[twilio] WhatsApp send failed", { to, status: result.status, body: result.body });
  }
  return result.ok;
}
