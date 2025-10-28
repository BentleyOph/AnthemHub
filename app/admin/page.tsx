export default function AdminPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p>Admin-facing workflow management lives here.</p>
      <ul className="list-disc pl-5 text-sm text-zinc-600">
        <li>
          <a className="underline" href="/admin/users">
            Manage users (roles and client mapping)
          </a>
        </li>
      </ul>
    </div>
  );
}
