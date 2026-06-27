import { drizzle } from "drizzle-orm/d1";
import { accounts, sessions, users, verifications } from "./schema";

// Drizzle client over the D1 binding, scoped to the auth tables Better Auth's
// adapter reads and writes. Kept in this package (not in @puzzlehub/auth) because
// only @puzzlehub/db depends on drizzle-orm; @puzzlehub/auth consumes the built
// client through the AuthDb type.
export const authSchema = { users, sessions, accounts, verifications };

export function createAuthDb(d1: D1Database) {
  return drizzle(d1, { schema: authSchema });
}

export type AuthDb = ReturnType<typeof createAuthDb>;
