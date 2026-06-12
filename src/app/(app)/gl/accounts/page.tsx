import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, accountTypeEnum } from "@/db/schema";
import { requireUser } from "@/server/auth";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui";

const TYPE_LABELS: Record<(typeof accountTypeEnum)[number], string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

type Account = typeof accounts.$inferSelect;

/** Flatten accounts of one type into display order with parent/child indents. */
function orderWithDepth(rows: Account[]): Array<{ account: Account; depth: number }> {
  const ids = new Set(rows.map((a) => a.id));
  const children = new Map<string, Account[]>();
  const roots: Account[] = [];
  for (const a of rows) {
    if (a.parentId && ids.has(a.parentId)) {
      const list = children.get(a.parentId) ?? [];
      list.push(a);
      children.set(a.parentId, list);
    } else {
      roots.push(a);
    }
  }
  const out: Array<{ account: Account; depth: number }> = [];
  const visit = (a: Account, depth: number) => {
    out.push({ account: a, depth });
    for (const child of children.get(a.id) ?? []) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return out;
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { error } = await searchParams;

  const allAccounts = await db.select().from(accounts).orderBy(asc(accounts.code));

  async function createAccount(formData: FormData) {
    "use server";
    await requireUser();
    const code = String(formData.get("code") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const type = String(formData.get("type") ?? "");
    const parentId = String(formData.get("parentId") ?? "");

    const fail = (msg: string) =>
      redirect(`/gl/accounts?error=${encodeURIComponent(msg)}`);
    if (!code || !name) fail("Code and name are required");
    if (!(accountTypeEnum as readonly string[]).includes(type)) fail("Choose an account type");

    try {
      await db.insert(accounts).values({
        code,
        name,
        type: type as (typeof accountTypeEnum)[number],
        parentId: parentId || null,
      });
    } catch (e) {
      fail(e instanceof Error ? e.message : "Failed to create account");
    }
    revalidatePath("/gl/accounts");
    redirect("/gl/accounts");
  }

  async function deleteAccount(formData: FormData) {
    "use server";
    await requireUser();
    const id = String(formData.get("id") ?? "");
    try {
      const account = await db.query.accounts.findFirst({ where: eq(accounts.id, id) });
      if (!account) throw new Error("Account not found");
      if (account.isSystem) throw new Error("System accounts cannot be deleted");
      await db.delete(accounts).where(eq(accounts.id, id));
    } catch (e) {
      redirect(
        `/gl/accounts?error=${encodeURIComponent(
          e instanceof Error
            ? e.message.includes("violates foreign key")
              ? "Account is in use and cannot be deleted"
              : e.message
            : "Failed to delete account",
        )}`,
      );
    }
    revalidatePath("/gl/accounts");
    redirect("/gl/accounts");
  }

  return (
    <div>
      <PageHeader title="Chart of Accounts" subtitle={`${allAccounts.length} accounts`} />
      <ErrorBanner message={error} />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">New account</h2>
        <form action={createAccount} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-5">
          <Field label="Code">
            <Input name="code" required placeholder="e.g. 1110" />
          </Field>
          <Field label="Name">
            <Input name="name" required placeholder="e.g. Petty Cash" />
          </Field>
          <Field label="Type">
            <Select name="type" required defaultValue="">
              <option value="" disabled>
                Select type
              </option>
              {accountTypeEnum.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Parent (optional)">
            <Select name="parentId" defaultValue="">
              <option value="">None</option>
              {allAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <Button type="submit">Add account</Button>
          </div>
        </form>
      </Card>

      <div className="space-y-6">
        {accountTypeEnum.map((type) => {
          const rows = orderWithDepth(allAccounts.filter((a) => a.type === type));
          if (rows.length === 0) return null;
          return (
            <div key={type}>
              <h2 className="mb-2 text-sm font-semibold text-gray-900">{TYPE_LABELS[type]}</h2>
              <Table>
                <thead>
                  <tr>
                    <Th className="w-32">Code</Th>
                    <Th>Name</Th>
                    <Th className="w-28">Status</Th>
                    <Th className="w-20"></Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(({ account, depth }) => (
                    <tr key={account.id}>
                      <Td className="font-mono">{account.code}</Td>
                      <Td>
                        <span style={{ paddingLeft: `${depth * 1.25}rem` }}>{account.name}</span>
                      </Td>
                      <Td>
                        <span className="flex gap-1.5">
                          {account.isSystem ? <Badge color="blue">System</Badge> : null}
                          {!account.isActive ? <Badge color="gray">Inactive</Badge> : null}
                        </span>
                      </Td>
                      <Td className="text-right">
                        {!account.isSystem ? (
                          <form action={deleteAccount}>
                            <input type="hidden" name="id" value={account.id} />
                            <button
                              type="submit"
                              className="text-xs text-red-600 underline hover:text-red-800"
                            >
                              Delete
                            </button>
                          </form>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
