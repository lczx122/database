import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, requireAdmin } from "@/server/auth";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  SuccessBanner,
  Table,
  Td,
  Th,
} from "@/components/ui";

function back(key: "error" | "success", message: string): never {
  redirect(`/settings/users?${key}=${encodeURIComponent(message)}`);
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const me = await requireAdmin();
  const { error, success } = await searchParams;

  const allUsers = await db.select().from(users).orderBy(asc(users.username));

  async function createUserAction(formData: FormData) {
    "use server";
    await requireAdmin();

    const username = String(formData.get("username") ?? "").trim();
    const displayName = String(formData.get("displayName") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const role = formData.get("role") === "admin" ? ("admin" as const) : ("user" as const);

    if (!username || !displayName) back("error", "Username and display name are required");
    if (password.length < 8) back("error", "Password must be at least 8 characters");

    try {
      await db.insert(users).values({
        username,
        displayName,
        role,
        passwordHash: await hashPassword(password),
      });
    } catch (err) {
      back("error", err instanceof Error ? err.message : "Failed to create user");
    }

    revalidatePath("/settings/users");
    back("success", `User ${username} created`);
  }

  async function toggleActiveAction(id: string) {
    "use server";
    const admin = await requireAdmin();
    if (id === admin.id) back("error", "You cannot deactivate your own account");

    const target = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!target) back("error", "User not found");

    await db.update(users).set({ isActive: !target.isActive }).where(eq(users.id, id));
    revalidatePath("/settings/users");
    back("success", `User ${target.username} ${target.isActive ? "deactivated" : "activated"}`);
  }

  async function resetPasswordAction(id: string, formData: FormData) {
    "use server";
    await requireAdmin();

    const password = String(formData.get("password") ?? "");
    if (password.length < 8) back("error", "Password must be at least 8 characters");

    const target = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!target) back("error", "User not found");

    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, id));
    revalidatePath("/settings/users");
    back("success", `Password reset for ${target.username}`);
  }

  return (
    <div>
      <PageHeader title="Users" subtitle="Manage who can sign in and their roles" />
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">New user</h2>
        <form action={createUserAction} className="grid grid-cols-1 gap-4 sm:grid-cols-5">
          <Field label="Username">
            <Input name="username" autoComplete="off" required />
          </Field>
          <Field label="Display Name">
            <Input name="displayName" required />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="new-password" required />
          </Field>
          <Field label="Role">
            <Select name="role" defaultValue="user">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <div className="self-end">
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Card>

      <Table>
        <thead>
          <tr>
            <Th>Username</Th>
            <Th>Display Name</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {allUsers.map((u) => (
            <tr key={u.id} className="hover:bg-gray-50">
              <Td className="font-medium">
                {u.username}
                {u.id === me.id ? <span className="ml-1 text-xs text-gray-400">(you)</span> : null}
              </Td>
              <Td>{u.displayName}</Td>
              <Td>
                <Badge color={u.role === "admin" ? "blue" : "gray"}>{u.role}</Badge>
              </Td>
              <Td>
                <Badge color={u.isActive ? "green" : "red"}>
                  {u.isActive ? "active" : "inactive"}
                </Badge>
              </Td>
              <Td>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={toggleActiveAction.bind(null, u.id)}>
                    <Button
                      type="submit"
                      variant={u.isActive ? "danger" : "secondary"}
                      disabled={u.id === me.id}
                    >
                      {u.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </form>
                  <form
                    action={resetPasswordAction.bind(null, u.id)}
                    className="flex items-center gap-2"
                  >
                    <Input
                      name="password"
                      type="password"
                      placeholder="New password"
                      autoComplete="new-password"
                      required
                      className="w-40"
                    />
                    <Button type="submit" variant="secondary">
                      Reset
                    </Button>
                  </form>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
