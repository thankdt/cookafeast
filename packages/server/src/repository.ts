/** Truy cập dữ liệu người dùng (menu instance, tiến độ nấu) trong SQLite. */

import type { ClaimResult, MenuInstance, TaskAssignment, TaskStatus } from '@cookafeast/core';
import { getDb } from './db.js';

export const menuRepo = {
  save(menu: MenuInstance): void {
    getDb()
      .prepare(
        `INSERT INTO menu_instance (id, data, created_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      )
      .run(menu.id, JSON.stringify(menu), menu.createdAt);
  },
  get(id: string): MenuInstance | undefined {
    const row = getDb().prepare('SELECT data FROM menu_instance WHERE id = ?').get(id) as
      | { data: string }
      | undefined;
    return row ? (JSON.parse(row.data) as MenuInstance) : undefined;
  },
  list(): MenuInstance[] {
    const rows = getDb()
      .prepare('SELECT data FROM menu_instance ORDER BY created_at DESC')
      .all() as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as MenuInstance);
  },
  remove(id: string): void {
    const db = getDb();
    db.prepare('DELETE FROM cook_task_state WHERE menu_id = ?').run(id);
    db.prepare('DELETE FROM menu_instance WHERE id = ?').run(id);
  },
};

export const cookRepo = {
  states(menuId: string): TaskAssignment[] {
    const rows = getDb()
      .prepare('SELECT task_id, status, progress, person_id, version, updated_at FROM cook_task_state WHERE menu_id = ?')
      .all(menuId) as {
      task_id: string;
      status: string;
      progress: number;
      person_id: string | null;
      version: number;
      updated_at: number;
    }[];
    return rows.map((r) => ({
      taskId: r.task_id,
      status: r.status as TaskAssignment['status'],
      progress: r.progress,
      personId: r.person_id ?? undefined,
      version: r.version,
      updatedAt: r.updated_at,
    }));
  },
  upsert(menuId: string, taskId: string, patch: Partial<TaskAssignment>): TaskAssignment {
    const db = getDb();
    const existing = db
      .prepare('SELECT status, progress, person_id, version FROM cook_task_state WHERE menu_id = ? AND task_id = ?')
      .get(menuId, taskId) as
      | { status: string; progress: number; person_id: string | null; version: number }
      | undefined;
    const next: TaskAssignment = {
      taskId,
      status: patch.status ?? (existing?.status as TaskAssignment['status']) ?? 'TODO',
      progress: patch.progress ?? existing?.progress ?? 0,
      personId: patch.personId ?? existing?.person_id ?? undefined,
      version: (existing?.version ?? 0) + 1,
      updatedAt: Date.now(),
    };
    db.prepare(
      `INSERT INTO cook_task_state (menu_id, task_id, status, progress, person_id, version, updated_at)
       VALUES (@menu, @task, @status, @progress, @person, @version, @updated)
       ON CONFLICT(menu_id, task_id) DO UPDATE SET
         status=excluded.status, progress=excluded.progress, person_id=excluded.person_id,
         version=excluded.version, updated_at=excluded.updated_at`,
    ).run({
      menu: menuId,
      task: taskId,
      status: next.status,
      progress: next.progress,
      person: next.personId ?? null,
      version: next.version,
      updated: next.updatedAt,
    });
    return next;
  },

  getState(menuId: string, taskId: string): TaskAssignment | undefined {
    const r = getDb()
      .prepare('SELECT task_id, status, progress, person_id, version, updated_at FROM cook_task_state WHERE menu_id = ? AND task_id = ?')
      .get(menuId, taskId) as
      | { task_id: string; status: string; progress: number; person_id: string | null; version: number; updated_at: number }
      | undefined;
    if (!r) return undefined;
    return {
      taskId: r.task_id,
      status: r.status as TaskStatus,
      progress: r.progress,
      personId: r.person_id ?? undefined,
      version: r.version,
      updatedAt: r.updated_at,
    };
  },

  /** Nhận việc bằng compare-and-set tuần tự (host-authoritative). */
  claim(menuId: string, taskId: string, memberId: string, expectedVersion?: number): ClaimResult {
    const db = getDb();
    const tx = db.transaction((): ClaimResult => {
      const cur = cookRepo.getState(menuId, taskId);
      const owner = cur?.personId;
      if (owner && owner !== memberId) {
        return { ok: false, reason: 'Việc này vừa có người khác nhận rồi.' };
      }
      if (expectedVersion != null && cur && expectedVersion !== cur.version) {
        return { ok: false, reason: 'Trạng thái đã thay đổi, thử lại nhé.' };
      }
      const state = cookRepo.upsert(menuId, taskId, {
        personId: memberId,
        status: cur?.status === 'DONE' ? 'DONE' : 'IN_PROGRESS',
      });
      db.prepare('UPDATE cook_task_state SET claimed_at = ? WHERE menu_id = ? AND task_id = ?')
        .run(state.updatedAt, menuId, taskId);
      return { ok: true, state };
    });
    return tx();
  },

  /** Nhả việc (chỉ chủ sở hữu mới nhả được). Xoá hẳn person_id. */
  release(menuId: string, taskId: string, memberId: string): ClaimResult {
    const cur = cookRepo.getState(menuId, taskId);
    if (cur?.personId && cur.personId !== memberId) {
      return { ok: false, reason: 'Không phải việc của bạn.' };
    }
    const now = Date.now();
    const version = (cur?.version ?? 0) + 1;
    const status: TaskStatus = cur?.status === 'DONE' ? 'DONE' : 'TODO';
    const progress = cur?.progress ?? 0;
    getDb()
      .prepare(
        `INSERT INTO cook_task_state (menu_id, task_id, status, progress, person_id, version, updated_at)
         VALUES (@menu, @task, @status, @progress, NULL, @version, @updated)
         ON CONFLICT(menu_id, task_id) DO UPDATE SET
           status=excluded.status, person_id=NULL, version=excluded.version, updated_at=excluded.updated_at`,
      )
      .run({ menu: menuId, task: taskId, status, progress, version, updated: now });
    return { ok: true, state: { taskId, status, progress, personId: undefined, version, updatedAt: now } };
  },
};
