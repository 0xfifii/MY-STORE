import "server-only";
import { replaceSession, isLoginThrottled, recordLoginAttempt, verifyPassword, type SessionUser } from "./auth";
import { query, queryOne, withStore } from "./db";
import { AppError } from "./errors";

/** Most accounts one person can link together (keeps the switcher short). */
export const MAX_LINKED = 10;

export type LinkedAccount = {
  id: string;
  name: string;
  email: string;
  store_id: number;
  business: string;
  locked: boolean;
};

/**
 * Every account in the same group as this one (all accounts reachable through links), apart from itself.
 * Runs with no business selected: the accounts belong to other businesses.
 */
export function linkedAccounts(userId: string): Promise<LinkedAccount[]> {
  return withStore(null, () =>
    query<LinkedAccount>(
      `WITH RECURSIVE grp(id) AS (
         SELECT $1::uuid
         UNION
         SELECT CASE WHEN l.user_a = g.id THEN l.user_b ELSE l.user_a END
           FROM user_links l JOIN grp g ON g.id IN (l.user_a, l.user_b)
       )
       SELECT u.id, u.name, u.email, st.id AS store_id, st.name AS business,
              (NOT u.is_platform_admin AND (st.status = 'paused' OR (st.paid_until IS NOT NULL AND st.paid_until < now()))) AS locked
         FROM grp JOIN users u ON u.id = grp.id JOIN stores st ON st.id = u.store_id
        WHERE u.id <> $1 AND u.is_active AND u.deleted_at IS NULL
        ORDER BY st.name, u.name`,
      [userId],
    ),
  );
}

/** Links another account to this one. Needs that account's email and password, so nobody can link an account they can't sign in to. */
export async function linkAccount(me: SessionUser, email: string, password: string): Promise<LinkedAccount[]> {
  const e = email.trim().toLowerCase();
  if (await isLoginThrottled(e)) throw new AppError("THROTTLED", "Too many failed attempts. Wait 15 minutes and try again.", 429);
  const other = await withStore(null, () =>
    queryOne<{ id: string; password_hash: string; is_active: boolean }>(
      "SELECT id, password_hash, is_active FROM users WHERE lower(email) = $1 AND deleted_at IS NULL",
      [e],
    ),
  );
  const valid = other ? await verifyPassword(password, other.password_hash) : false;
  await recordLoginAttempt(e, valid && !!other?.is_active);
  if (!other || !valid) throw new AppError("BAD_LOGIN", "Incorrect email or password for that account.", 401);
  if (!other.is_active) throw new AppError("INACTIVE", "That account has been deactivated.", 403);
  if (other.id === me.id) throw new AppError("SAME_ACCOUNT", "That's the account you're signed in to.", 400);

  const current = await linkedAccounts(me.id);
  if (current.some((a) => a.id === other.id)) throw new AppError("ALREADY_LINKED", "That account is already linked.", 409);
  const theirs = await linkedAccounts(other.id);
  if (current.length + theirs.length + 2 > MAX_LINKED) {
    throw new AppError("TOO_MANY", `You can link up to ${MAX_LINKED} accounts together.`, 400);
  }
  const [a, b] = me.id < other.id ? [me.id, other.id] : [other.id, me.id];
  await withStore(null, () =>
    query("INSERT INTO user_links (user_a, user_b, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [a, b, me.id]),
  );
  return linkedAccounts(me.id);
}

/** Takes one account out of the group (the accounts left stay linked to each other). */
export async function unlinkAccount(me: SessionUser, otherId: string): Promise<LinkedAccount[]> {
  const group = await linkedAccounts(me.id);
  if (!group.some((a) => a.id === otherId)) throw new AppError("NOT_LINKED", "That account isn't linked to this one.", 404);
  await withStore(null, async () => {
    // Re-join the leaving account's neighbours to each other first, so removing one doesn't split the rest.
    const neighbours = await query<{ id: string }>(
      "SELECT CASE WHEN user_a = $1 THEN user_b ELSE user_a END AS id FROM user_links WHERE $1 IN (user_a, user_b)",
      [otherId],
    );
    const rest = neighbours.map((n) => n.id);
    await query("DELETE FROM user_links WHERE $1 IN (user_a, user_b)", [otherId]);
    for (let i = 1; i < rest.length; i++) {
      const [a, b] = rest[0] < rest[i] ? [rest[0], rest[i]] : [rest[i], rest[0]];
      await query("INSERT INTO user_links (user_a, user_b, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [a, b, me.id]);
    }
  });
  return linkedAccounts(me.id);
}

/** Signs in to a linked account in place of this one (no password needed: it was given when linking). */
export async function switchAccount(me: SessionUser, targetId: string) {
  const target = (await linkedAccounts(me.id)).find((a) => a.id === targetId);
  if (!target) throw new AppError("NOT_LINKED", "That account isn't linked to this one.", 404);
  await replaceSession(target.id);
  return target;
}
