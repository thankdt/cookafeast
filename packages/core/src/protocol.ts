/**
 * Giao thức đồng bộ cộng tác LAN (Phase 2) — dùng chung server + client.
 *
 * Host-authoritative: client gửi MUTATE (optimistic), host là trọng tài duy nhất,
 * áp vào SQLite, cấp `seq` tăng dần, ghi event-log, rồi broadcast EVENT cho cả phòng.
 * Mỗi mutation mang `clientMutationId` để replay an toàn (idempotent) khi reconnect.
 */

import type {
  CookAvoid,
  CookSession,
  CookSessionMember,
  TaskAssignment,
  TaskStatus,
} from './domain.js';

export type MutationType = 'CLAIM_TASK' | 'RELEASE_TASK' | 'UPDATE_PROGRESS' | 'SET_STATUS';

export interface Mutation {
  /** UUID v4 do client sinh — idempotency key. */
  clientMutationId: string;
  type: MutationType;
  taskId: string;
  /** version client tin là hiện tại (CAS optimistic), tuỳ chọn. */
  expectedVersion?: number;
  progress?: number;
  status?: TaskStatus;
}

/** Một sự kiện đã được host đánh số — client áp theo thứ tự `seq`. */
export interface CookEvent {
  seq: number;
  kind: 'TASK' | 'PRESENCE' | 'SESSION';
  /** kind=TASK: trạng thái task mới (upsert vào map cục bộ). */
  taskState?: TaskAssignment;
  /** kind=PRESENCE: danh sách thành viên + trạng thái online. */
  members?: CookSessionMember[];
  /** kind=SESSION: phiên thay đổi (vd status, host mới). */
  session?: CookSession;
}

// ── Client → Server ──
export type ClientMessage =
  | {
      t: 'HELLO';
      sessionId: string;
      memberId?: string;
      name?: string;
      skill?: 1 | 2 | 3;
      avoid?: CookAvoid[];
      /** seq cuối client đã thấy (để replay phần thiếu khi reconnect). */
      lastSeq?: number;
    }
  | { t: 'HEARTBEAT' }
  | { t: 'MUTATE'; mutation: Mutation };

// ── Server → Client ──
export type ServerMessage =
  | {
      t: 'WELCOME';
      member: CookSessionMember;
      session: CookSession;
      taskStates: TaskAssignment[];
      seq: number;
    }
  | { t: 'EVENT'; event: CookEvent }
  | {
      t: 'ACK';
      clientMutationId: string;
      ok: boolean;
      state?: TaskAssignment;
      error?: string;
    }
  | { t: 'ERROR'; code: string; message: string };
