"use server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function logout() {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Failed to sign out", error);
    throw error;
  }
}
