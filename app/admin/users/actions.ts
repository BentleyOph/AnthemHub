"use server";

import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";

import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function assertAdmin(): Promise<User> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error("Failed to load authenticated user");
  }

  const user = data.user;
  if (!user) throw new Error("No session");

  const admin = getSupabaseServiceRoleClient();
  const { data: me } = await admin
    .from("user_profile")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (me?.role !== "ADMIN") {
    const metadataRole = user.app_metadata?.role;
    if (metadataRole !== "ADMIN") {
      throw new Error("Not authorized");
    }
  }
  return user;
}

export async function updateUserAction(formData: FormData) {
  await assertAdmin();

  const id = String(formData.get("id") || "");
  const role = String(formData.get("role") || "CLIENT");
  const client_id_raw = String(formData.get("client_id") || "").trim();
  const client_id = client_id_raw.length ? client_id_raw : null;

  if (!id) throw new Error("Missing user id");
  if (role !== "ADMIN" && role !== "CLIENT") throw new Error("Invalid role");

  const admin = getSupabaseServiceRoleClient();
  const { error } = await admin.from("user_profile").update({ role, client_id }).eq("id", id);

  if (error) throw error;
  revalidatePath("/admin/users");
}

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(255),
  email: z.string().trim().email("Enter a valid email").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "CLIENT"]),
  clientId: z.union([z.string().uuid(), z.literal("")]).optional().transform((value) => {
    if (!value) return null;
    return value;
  }),
});

export type CreateUserActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const initialState: CreateUserActionState = { status: "idle" };

export async function createUserAction(
  _prevState: CreateUserActionState = initialState,
  formData: FormData,
): Promise<CreateUserActionState> {
  await assertAdmin();
  void _prevState;
  const rawPayload = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    clientId: formData.get("client_id"),
  };

  const parsed = createUserSchema.safeParse(rawPayload);
  if (!parsed.success) {
    const errorMessage = parsed.error.issues.at(0)?.message ?? "Invalid input";
    return { status: "error", message: errorMessage };
  }

  const { name, email, password, role, clientId } = parsed.data;
  const admin = getSupabaseServiceRoleClient();

  const createResult = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });

  if (createResult.error || !createResult.data?.user) {
    const message = createResult.error?.message ?? "Failed to create auth user";
    return { status: "error", message };
  }

  const user = createResult.data.user;

  const { error: profileError } = await admin
    .from("user_profile")
    .insert({
      id: user.id,
      email,
      name,
      role,
      client_id: clientId ?? null,
    })
    .select("id")
    .single();

  if (profileError) {
    return { status: "error", message: profileError.message ?? "Failed to persist profile" };
  }

  revalidatePath("/admin/users");
  return { status: "success", message: "User created" };
}

export async function deleteUserAction(userId: string): Promise<{ status: "success" | "error"; message?: string }> {
  const currentUser = await assertAdmin();

  if (!userId) {
    return { status: "error", message: "Missing user id" };
  }

  if (currentUser.id === userId) {
    return { status: "error", message: "You cannot delete your own account." };
  }

  const admin = getSupabaseServiceRoleClient();

  const authResult = await admin.auth.admin.deleteUser(userId);
  if (authResult.error && authResult.error.message !== "User not found") {
    return { status: "error", message: authResult.error.message };
  }

  const { error: profileError } = await admin.from("user_profile").delete().eq("id", userId);
  if (profileError) {
    return { status: "error", message: profileError.message ?? "Failed to delete profile" };
  }

  revalidatePath("/admin/users");
  return { status: "success" };
}
