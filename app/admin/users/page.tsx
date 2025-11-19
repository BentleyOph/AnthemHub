import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

import { CreateUserForm } from "@/components/admin/users/create-user-form";
import { DeleteUserButton } from "@/components/admin/users/delete-user-button";
import { assertAdmin, updateUserAction } from "./actions";
import type { ClientOption } from "@/lib/admin/users/types";

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

async function getClients(): Promise<ClientOption[]> {
  const admin = getSupabaseServiceRoleClient();
  const { data } = await admin
    .from("client")
    .select("id,name")
    .order("name", { ascending: true });
  return (data ?? []).map((client) => ({
    id: client.id,
    name: client.name ?? "Unnamed client",
  }));
}


export default async function UsersAdminPage() {
  const viewer = await assertAdmin();
  const [profiles, clients] = await Promise.all([getProfiles(), getClients()]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="text-sm text-zinc-600">Promote users to ADMIN and assign client mapping.</p>

      <CreateUserForm clients={clients} />

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
                    <select
                      name="client_id"
                      defaultValue={u.client_id ?? ""}
                      className="border rounded p-1 w-64"
                    >
                      <option value="">Unassigned</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="rounded bg-black text-white px-3 py-1 text-xs">
                      Save
                    </button>
                  </form>
                </td>
                <td className="p-2">{u.client_id ?? "—"}</td>
                <td className="p-2 text-right">
                  <DeleteUserButton userId={u.id} email={u.email} disabled={viewer.id === u.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
