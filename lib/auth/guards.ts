import type { Session } from "@supabase/supabase-js";
import type { AppRole, AppSession } from "./session";
import { toAppSession } from "./session";

export class AccessDeniedError extends Error {
  constructor(message = "You are not allowed to perform this action.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

function asAppSession(session: Session | AppSession): AppSession {
  if ("role" in session && "session" in session) {
    return session;
  }

  return toAppSession(session);
}

export function requireRole(
  session: Session | AppSession,
  role: AppRole,
): AppSession {
  const appSession = asAppSession(session);

  if (appSession.role !== role) {
    throw new AccessDeniedError();
  }

  return appSession;
}

export function requireAnyRole(
  session: Session | AppSession,
  roles: AppRole[],
): AppSession {
  const appSession = asAppSession(session);

  if (!roles.includes(appSession.role)) {
    throw new AccessDeniedError();
  }

  return appSession;
}

export function requireAdmin(session: Session | AppSession): AppSession {
  return requireRole(session, "ADMIN");
}

export function requireClient(session: Session | AppSession): AppSession {
  return requireRole(session, "CLIENT");
}
