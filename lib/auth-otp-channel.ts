import { canonicalizeAuthPhone } from "@/lib/phone";

/** How login OTP is delivered. In-app chat is always on Sarvaone — not via this channel. */
export type AuthOtpChannel = "sms" | "whatsapp";

export function authOtpChannelForPhone(phone: string): AuthOtpChannel {
  const p = canonicalizeAuthPhone(phone);
  if (/^1\d{10}$/.test(p)) return "sms";
  return "whatsapp";
}

export function authOtpChannelLabel(channel: AuthOtpChannel, lang: "en" | "es" = "en"): string {
  if (channel === "sms") return lang === "es" ? "SMS" : "text message";
  return "WhatsApp";
}
