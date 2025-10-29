import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

interface UserProfile {
  id: string;
  email: string | null;
  role: "ADMIN" | "CLIENT";
  client_id: string | null;
}

async function getProfiles(): Promise<UserProfile[]> {
  const admin = getSupabaseServiceRoleClient();
  const { data } = await admin
    .from("user_profile")
    .select("id,email,role,client_id")
    .order("email", { ascending: true });
  return data ?? [];
}

async function assertAdmin() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error("Failed to load authenticated user");
  }

  const user = data.user;
  if (!user) throw new Error("No session");

  // Prefer definitive check against DB profile role
  const admin = getSupabaseServiceRoleClient();
  const { data: me } = await admin
    .from("user_profile")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (me?.role !== "ADMIN") {
    const metadataRole = user.app_metadata?.role;
    if (metadataRole !== "ADMIN") {
      // Fallback to metadata-based guard (in case claims are enriched)
      throw new Error("Not authorized");
    }
  }
}

export default async function UsersAdminPage() {
  await assertAdmin();
  const profiles = await getProfiles();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="text-sm text-zinc-600">Promote users to ADMIN and assign client mapping.</p>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">Email</th>
              <th className="p-2">Role</th>
              <th className="p-2">Client ID</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="p-2">{u.email}</td>
                <td className="p-2">
                  <form action={updateUserAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" defaultValue={u.id} />
                    <select name="role" defaultValue={u.role} className="border rounded p-1">
                      <option value="CLIENT">CLIENT</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                    <input
                      type="text"
                      name="client_id"
                      defaultValue={u.client_id ?? ""}
                      placeholder="client uuid"
                      className="border rounded p-1 w-64"
                    />
                    <button type="submit" className="rounded bg-black text-white px-3 py-1 text-xs">
                      Save
                    </button>
                  </form>
                </td>
                <td className="p-2">{u.client_id ?? "—"}</td>
                <td className="p-2"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export async function updateUserAction(formData: FormData) {
  "use server";
  await assertAdmin();

  const id = String(formData.get("id") || "");
  const role = String(formData.get("role") || "CLIENT");
  const client_id_raw = String(formData.get("client_id") || "").trim();
  const client_id = client_id_raw.length ? client_id_raw : null;

  if (!id) throw new Error("Missing user id");
  if (role !== "ADMIN" && role !== "CLIENT") throw new Error("Invalid role");

  const admin = getSupabaseServiceRoleClient();
  const { error } = await admin
    .from("user_profile")
    .update({ role, client_id })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/admin/users");
}
