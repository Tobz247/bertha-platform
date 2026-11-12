import "server-only";
import { db } from "./db";

type Actor = { id: string; name: string; businessId?: string | null } | null;

/**
 * Add a line to the admin audit log (/admin/audit). Never throws: a failed log write
 * must not stop the action the person was doing.
 *
 * `action` is a dotted name such as "team.role_changed"; the part before the dot is the group
 * admins filter by. `summary` is a plain sentence, e.g. "Amina changed Kunle from Staff to Kitchen".
 */
export async function audit(
  actor: Actor,
  action: string,
  summary: string,
  opts: { businessId?: string | null; targetType?: string; targetId?: string } = {},
) {
  try {
    await db.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? null,
        businessId: opts.businessId !== undefined ? opts.businessId : (actor?.businessId ?? null),
        action,
        summary,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
      },
    });
  } catch (e) {
    console.error("audit log write failed", action, e);
  }
}
