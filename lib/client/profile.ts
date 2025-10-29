import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import {
  getSupabaseServerClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

type UserProfileRow = {
  id: string;
  email: string | null;
  name: string | null;
  client_id: string | null;
  client?: {
    id: string;
    name: string | null;
    company: string | null;
  } | null;
};

export interface ClientProfile {
  userId: string;
  userEmail: string | null;
  userName: string | null;
  clientId: string | null;
  clientName: string;
  clientCompany: string | null;
}

function fallbackClientName(
  profile: UserProfileRow | null,
  user: User,
): string {
  if (profile?.client?.name) {
    return profile.client.name;
  }

  if (profile?.name) {
    return profile.name;
  }

  const metadataName =
    (user.user_metadata as Record<string, unknown> | undefined)?.full_name;
  if (typeof metadataName === "string" && metadataName.trim().length > 0) {
    return metadataName.trim();
  }

  const email = profile?.email ?? user.email ?? undefined;
  if (email && email.includes("@")) {
    return email.split("@")[0] ?? "My Workspace";
  }

  return "My Workspace";
}

export async function getClientProfile(options?: {
  supabase?: SupabaseClient;
}): Promise<ClientProfile> {
  const supabase = options?.supabase ?? (await getSupabaseServerClient());

  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    throw authError;
  }

  const user = authData.user;

  if (!user) {
    throw new Error("No authenticated user available for client profile.");
  }

  const service = getSupabaseServiceRoleClient();

  const { data: profileRow, error: profileError } = await service
    .from("user_profile")
    .select(
      `
        id,
        email,
        name,
        client_id,
        client:client (
          id,
          name,
          company
        )
      `,
    )
    .eq("id", user.id)
    .maybeSingle<UserProfileRow>();

  if (profileError) {
    throw profileError;
  }

  const profile = profileRow ?? null;
  const clientId = profile?.client_id ?? null;

  return {
    userId: user.id,
    userEmail: profile?.email ?? user.email ?? null,
    userName:
      profile?.name ??
      (typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : null),
    clientId,
    clientName: fallbackClientName(profile, user),
    clientCompany: profile?.client?.company ?? null,
  };
}
