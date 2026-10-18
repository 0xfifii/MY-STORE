import "server-only";
import type { PoolClient } from "pg";
import { pool } from "./db";

export async function audit(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string | number | null,
  details: Record<string, unknown> = {},
  client?: PoolClient,
) {
  const q = client ?? pool();
  await q.query(
    "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
    [userId, action, entityType, entityId === null ? null : String(entityId), JSON.stringify(details)],
  );
}
