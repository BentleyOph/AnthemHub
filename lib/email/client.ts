import { Resend } from "resend";

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (resendClient) {
    return resendClient;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY must be set");
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

export function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL ?? "Anthem <noreply@anthem.agency>";
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://anthem.agency";
}
