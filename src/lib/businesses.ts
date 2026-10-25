import "server-only";
import { randomBytes as _rb, randomUUID as _uuid } from "node:crypto";
import { hashToken, query, queryOne, withStore, withTransaction } from "./db";
import { emailHtml, publicBaseUrl, sendMail } from "./mailer";
import { runScheduledReports } from "./reports/history";
import { formatMoney } from "./format";

export type Business = {
  id: number;
  name: string;
  status: "active" | "paused";
  paid_until: string | null;
  price_kobo: string;
  interval_months: number;
  billing_email: string | null;
  notes: string | null;
  created_at: string;
  /** paused by hand, or the paid period has ended */
  locked: boolean;
  days_left: number | null;
};

const SELECT = `SELECT s.id, s.name, s.status, s.paid_until::text, s.price_kobo::text, s.interval_months, s.billing_email, s.notes, s.created_at::text,
       (s.status = 'paused' OR (s.paid_until IS NOT NULL AND s.paid_until < now())) AS locked,
       CASE WHEN s.paid_until IS NULL THEN NULL ELSE ceil(extract(epoch FROM s.paid_until - now()) / 86400)::int END AS days_left
  FROM stores s`;

export const listBusinesses = () => withStore(null, () => query<Business>(`${SELECT} ORDER BY s.id`));
export const getBusiness = (id: number) => withStore(null, () => queryOne<Business>(`${SELECT} WHERE s.id = $1`, [id]));

/** Months of subscription added on top of whatever is left (or from now, if it had already ended). */
export function extendedUntil(paidUntil: string | null, months: number, from = new Date()) {
  const base = paidUntil && new Date(paidUntil) > from ? new Date(paidUntil) : from;
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * Records a successful payment and extends the business (idempotent on the reference: a Paystack callback
 * and webhook for the same payment only count once). Returns the new end date, or null if already applied.
 */
export async function applyPayment(p: { storeId: number; reference: string; amountKobo: number; months: number; method: "paystack" | "manual"; by?: string | null; raw?: unknown }) {
  return withStore(null, () => withTransaction(async (c) => {
    const st = await c.query<{ paid_until: string | null }>("SELECT paid_until::text FROM stores WHERE id = $1 FOR UPDATE", [p.storeId]);
    if (!st.rowCount) throw new Error("Business not found");
    const done = await c.query("SELECT 1 FROM payments WHERE reference = $1 AND status = 'success'", [p.reference]);
    if (done.rowCount) return null;
    const until = extendedUntil(st.rows[0].paid_until, p.months);
    await c.query(
      `INSERT INTO payments (store_id, reference, amount_kobo, months, status, method, paid_at, new_paid_until, created_by, raw)
       VALUES ($1,$2,$3,$4,'success',$5,now(),$6,$7,$8)
       ON CONFLICT (reference) DO UPDATE SET status='success', paid_at=now(), new_paid_until=EXCLUDED.new_paid_until, raw=EXCLUDED.raw`,
      [p.storeId, p.reference, p.amountKobo, p.months, p.method, until, p.by ?? null, p.raw ? JSON.stringify(p.raw) : null],
    );
    // Paying also lifts a manual pause.
    await c.query("UPDATE stores SET paid_until = $2, status = 'active' WHERE id = $1", [p.storeId, until]);
    return until;
  }));
}

/** Owners of a business (for billing emails). */
export function businessOwners(storeId: number) {
  return withStore(null, () => query<{ id: string; name: string; email: string }>(
    "SELECT id, name, email FROM users WHERE store_id = $1 AND role = 'owner' AND is_active AND deleted_at IS NULL AND NOT is_platform_admin",
    [storeId],
  ));
}

/** "Your subscription ends in N days" (once per paid period, within 3 days of the end). */
export async function sendRenewalReminders() {
  const due = await withStore(null, () => query<{ id: number; name: string; paid_until: string; price_kobo: string; interval_months: number; billing_email: string | null }>(
    `SELECT id, name, paid_until::text, price_kobo::text, interval_months, billing_email FROM stores
      WHERE status = 'active' AND paid_until IS NOT NULL AND paid_until > now() AND paid_until < now() + interval '3 days'
        AND (reminded_for IS DISTINCT FROM paid_until)`,
  ));
  const sent: number[] = [];
  for (const b of due) {
    const owners = await businessOwners(b.id);
    const to = [...new Set([b.billing_email, ...owners.map((o) => o.email)].filter(Boolean) as string[])];
    if (!to.length) continue;
    const when = new Date(b.paid_until).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" });
    const text = `Hello,\n\nYour ÌṢÚRA subscription for ${b.name} ends on ${when}.\n\nRenew now to keep recording stock without interruption` +
      (Number(b.price_kobo) > 0 ? ` (${formatMoney(Number(b.price_kobo) / 100, "₦")} for ${b.interval_months} month${b.interval_months === 1 ? "" : "s"}).` : ".") +
      `\n\nWhen it ends, the account is paused until it's renewed. Nothing is deleted.`;
    try {
      await withStore(b.id, () => sendMail({
        to, subject: `ÌṢÚRA: your subscription ends ${when}`, text,
        html: emailHtml(b.name, "Your subscription ends soon", text, { label: "Renew now", href: `${publicBaseUrl()}/billing` }),
        kind: "message",
      }));
      await withStore(null, () => query("UPDATE stores SET reminded_for = paid_until WHERE id = $1", [b.id]));
      sent.push(b.id);
    } catch (e) {
      console.error(`[billing] reminder for business ${b.id} failed:`, (e as Error).message);
    }
  }
  return sent;
}

/** Scheduled work for every business that isn't locked, plus renewal reminders. */
export async function runForAllBusinesses(now = new Date()) {
  const all = await listBusinesses();
  const businesses = [];
  for (const b of all) {
    if (b.locked) { businesses.push({ store_id: b.id, status: "locked" as const, generated: [] as string[] }); continue; }
    try {
      businesses.push({ store_id: b.id, ...(await withStore(b.id, () => runScheduledReports(now))) });
    } catch (e) {
      businesses.push({ store_id: b.id, status: "error" as const, error: (e as Error).message, generated: [] as string[] });
    }
  }
  const reminders = await sendRenewalReminders().catch(() => []);
  return { businesses, reminders };
}

// ---------------------------------------------------------------------------------------------
// Creating businesses and handing them to an owner
// ---------------------------------------------------------------------------------------------

/** A new business with its own settings. paidUntil null = no end date (e.g. ÌṢÚRA's own). */
export async function createBusiness(b: { name: string; priceKobo: number; paidUntil: Date | null; billingEmail?: string | null; notes?: string | null }) {
  const id = await withStore(null, async () => {
    const row = await queryOne<{ id: number }>(
      "INSERT INTO stores (name, price_kobo, interval_months, paid_until, billing_email, notes) VALUES ($1,$2,1,$3,$4,$5) RETURNING id",
      [b.name, b.priceKobo, b.paidUntil, b.billingEmail ?? null, b.notes ?? null],
    );
    return row!.id;
  });
  await withStore(id, () => query("INSERT INTO settings (id, store_id, store_name) VALUES ($1, $2, $3)", [id, id, b.name]));
  return id;
}

export const INVITE_DAYS = 7;

/** Invitation link for an email to join a business (as owner by default). Returns the link. */
export async function createInvite(i: { storeId: number; email: string; role?: "owner" | "staff" | "viewer"; demotePrevious?: boolean; by: string }) {
  const token = _rb(24).toString("base64url");
  await withStore(null, () => query(
    `INSERT INTO store_invites (store_id, email, role, token_hash, demote_previous, invited_by, expires_at)
     VALUES ($1, lower($2), $3, $4, $5, $6, now() + interval '${INVITE_DAYS} days')`,
    [i.storeId, i.email.trim(), i.role ?? "owner", hashToken(token), i.demotePrevious ?? true, i.by],
  ));
  return `${publicBaseUrl()}/invite/${token}`;
}

/** Emails the invitation (from ÌṢÚRA's account, or the business's own). Never throws; says what happened. */
export async function emailInvite(storeId: number, email: string, link: string, role: string) {
  const b = await getBusiness(storeId);
  const text = `Hello,\n\nYou've been invited to ${role === "owner" ? "take over as the owner of" : "join"} ${b?.name ?? "a business"} on ÌṢÚRA, the stock and inventory app.\n\n` +
    `Open the link below to accept and set your password. The link works for ${INVITE_DAYS} days.\n\n${link}`;
  try {
    await withStore(storeId, () => sendMail({
      to: [email], subject: `ÌṢÚRA: you're invited to ${b?.name ?? "a business"}`, text,
      html: emailHtml(b?.name ?? "ÌṢÚRA", role === "owner" ? "You're the new owner" : "You're invited", text, { label: "Accept invitation", href: link }),
      kind: "message",
    }));
    return "sent" as const;
  } catch (e) {
    return `failed: ${(e as Error).message}`;
  }
}

// ---------------------------------------------------------------------------------------------
// Paystack
// ---------------------------------------------------------------------------------------------
export async function paystackKey() {
  const row = await withStore(null, () => queryOne<{ k: string | null }>("SELECT paystack_secret_key AS k FROM platform_settings WHERE id = 1"));
  return row?.k || process.env.PAYSTACK_SECRET_KEY || null;
}

async function paystack<T>(path: string, init?: RequestInit): Promise<T> {
  const key = await paystackKey();
  if (!key) throw new Error("Online payment isn't set up yet. Ask ÌṢÚRA to add the Paystack key.");
  const res = await fetch(`${process.env.PAYSTACK_API_URL ?? "https://api.paystack.co"}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === false) throw new Error(body.message ? `Paystack: ${body.message}` : `Paystack error (${res.status})`);
  return body as T;
}

/** Starts a Paystack payment for `months` of subscription; returns the page to send the payer to. */
export async function startCheckout(storeId: number, months: number, email: string, by: string) {
  const b = await getBusiness(storeId);
  if (!b) throw new Error("Business not found");
  const amount = Number(b.price_kobo) * months;
  if (amount <= 0) throw new Error("No price is set for this subscription yet. Ask ÌṢÚRA to set it.");
  const reference = `isura-${storeId}-${_uuid().slice(0, 18)}`;
  await withStore(null, () => query(
    "INSERT INTO payments (store_id, reference, amount_kobo, months, status, method, created_by) VALUES ($1,$2,$3,$4,'pending','paystack',$5)",
    [storeId, reference, amount, months, by],
  ));
  const r = await paystack<{ data: { authorization_url: string } }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email, amount, reference, currency: "NGN",
      callback_url: `${publicBaseUrl()}/billing/callback`,
      metadata: { store_id: storeId, months, business: b.name },
    }),
  });
  return { url: r.data.authorization_url, reference };
}

/** Checks a payment with Paystack and, if it succeeded for the expected amount, extends the business. */
export async function confirmPayment(reference: string) {
  const pending = await withStore(null, () => queryOne<{ store_id: number; amount_kobo: string; months: number; status: string }>(
    "SELECT store_id, amount_kobo::text, months, status FROM payments WHERE reference = $1", [reference]));
  if (!pending) return { ok: false as const, reason: "Unknown payment reference." };
  const v = await paystack<{ data: { status: string; amount: number; currency: string; reference: string } }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (v.data.status !== "success") {
    await withStore(null, () => query("UPDATE payments SET status = 'failed', raw = $2 WHERE reference = $1 AND status = 'pending'", [reference, JSON.stringify(v.data)]));
    return { ok: false as const, reason: `Payment ${v.data.status}.` };
  }
  if (v.data.amount < Number(pending.amount_kobo)) return { ok: false as const, reason: "The amount paid is less than expected." };
  const until = await applyPayment({ storeId: pending.store_id, reference, amountKobo: v.data.amount, months: pending.months, method: "paystack", raw: v.data });
  return { ok: true as const, storeId: pending.store_id, until };
}

// ---------------------------------------------------------------------------------------------
// Accepting an invitation (taking over a business)
// ---------------------------------------------------------------------------------------------
export type InviteInfo = { id: number; store_id: number; business: string; email: string; role: "owner" | "staff" | "viewer"; expired: boolean; accepted: boolean; existing_user: boolean };

export async function getInvite(token: string): Promise<InviteInfo | null> {
  return withStore(null, () => queryOne<InviteInfo>(
    `SELECT i.id::int AS id, i.store_id, s.name AS business, i.email, i.role, (i.expires_at < now()) AS expired, (i.accepted_at IS NOT NULL) AS accepted,
            EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = i.email AND u.deleted_at IS NULL) AS existing_user
       FROM store_invites i JOIN stores s ON s.id = i.store_id WHERE i.token_hash = $1`,
    [hashToken(token)],
  ));
}
