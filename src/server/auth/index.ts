import crypto from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export const hashPassword = (password: string) => argonHash(password);
export const verifyPassword = (passwordHash: string, password: string) =>
  argonVerify(passwordHash, password);

export async function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const user = await db.query.users.findFirst({ where: eq(users.username, username.trim()) });
  if (!user || !user.isActive || !(await verifyPassword(user.passwordHash, password))) {
    return { ok: false, error: "Invalid username or password" };
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId: user.id, tokenHash: hashToken(token), expiresAt });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  return { ok: true };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const user = rows[0]?.user;
  return user && user.isActive ? user : null;
});

/** Use in server components/actions that require a signed-in user. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
