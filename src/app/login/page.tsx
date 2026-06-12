import { redirect } from "next/navigation";
import { getCurrentUser, login } from "@/server/auth";
import { Button, Card, ErrorBanner, Field, Input } from "@/components/ui";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const { error } = await searchParams;

  async function loginAction(formData: FormData) {
    "use server";
    const result = await login(String(formData.get("username") ?? ""), String(formData.get("password") ?? ""));
    if (!result.ok) redirect(`/login?error=${encodeURIComponent(result.error ?? "Login failed")}`);
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-lg font-semibold text-gray-900">Accounting</h1>
        <p className="mb-4 text-sm text-gray-500">Sign in to continue</p>
        <ErrorBanner message={error} />
        <form action={loginAction} className="space-y-3">
          <Field label="Username">
            <Input name="username" autoComplete="username" required autoFocus />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" className="w-full justify-center">
            Sign in
          </Button>
        </form>
      </Card>
    </main>
  );
}
