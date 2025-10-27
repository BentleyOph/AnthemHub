import type { Session } from "@supabase/supabase-js";

export type AppRole = "ADMIN" | "CLIENT";

export interface AppSession {
  session: Session;
  role: AppRole;
  clientId: string | null;
}

function resolveRole(session: Session): AppRole {
  const metadataRole =
    (session.user?.app_metadata as Record<string, unknown> | undefined)?.role ??
    (session.user?.user_metadata as Record<string, unknown> | undefined)?.role;

  if (metadataRole === "ADMIN" || metadataRole === "CLIENT") {
    return metadataRole;
  }

  return "CLIENT";
}

function resolveClientId(session: Session): string | null {
  const metadata =
    (session.user?.app_metadata as Record<string, unknown> | undefined) ?? {};
  const candidate = metadata.clientId ?? metadata.client_id;

  if (typeof candidate === "string" && candidate.length > 0) {
    return candidate;
  }

  return null;
}

export function toAppSession(session: Session): AppSession {
  return {
    session,
    role: resolveRole(session),
    clientId: resolveClientId(session),
  };
}
