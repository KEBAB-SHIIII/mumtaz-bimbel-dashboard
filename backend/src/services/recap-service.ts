import type { RecapGroup, RecapQuery, RecapResponse } from '@mumtaz/contracts';
import type { ServiceContext } from './context.js';
import { sessionsInPeriod, type SessionView } from './attendance/session-query.js';

const KEY_OF = {
  tutor: (row: SessionView) => ({ id: row.tutor_id, label: row.tutor_name }),
  student: (row: SessionView) => ({ id: row.student_id, label: row.student_name }),
  subject: (row: SessionView) => ({ id: row.subject_id, label: row.subject_name }),
} as const;

/**
 * `GET /admin/recap` — agregasi per tutor/siswa/mapel berbasis `lesson_date`.
 * Agregasi di aplikasi memadai untuk volume satu bimbel per bulan.
 */
export async function getRecap(ctx: ServiceContext, query: RecapQuery): Promise<RecapResponse> {
  const rows = await sessionsInPeriod(ctx.db, query.period);
  const keyOf = KEY_OF[query.group_by];
  const groups = new Map<string, RecapGroup>();

  for (const row of rows) {
    const key = keyOf(row);
    const group =
      groups.get(key.id) ??
      ({
        key_id: key.id,
        key_label: key.label,
        total_sessions: 0,
        approved_sessions: 0,
        pending_sessions: 0,
        revision_requested_sessions: 0,
        rejected_sessions: 0,
        approved_duration_minutes: 0,
        session_ids: [],
      } satisfies RecapGroup);

    group.total_sessions += 1;
    group.session_ids.push(row.id);
    switch (row.status) {
      case 'approved':
        group.approved_sessions += 1;
        group.approved_duration_minutes += row.duration_minutes;
        break;
      case 'pending':
        group.pending_sessions += 1;
        break;
      case 'revision_requested':
        group.revision_requested_sessions += 1;
        break;
      case 'rejected':
        group.rejected_sessions += 1;
        break;
    }
    groups.set(key.id, group);
  }

  return {
    period: query.period,
    group_by: query.group_by,
    groups: [...groups.values()]
      .map((group) => ({ ...group, session_ids: [...group.session_ids].sort() }))
      .sort((a, b) => a.key_label.localeCompare(b.key_label) || a.key_id.localeCompare(b.key_id)),
  };
}
