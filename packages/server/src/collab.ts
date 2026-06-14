/** Repository cho phiên cộng tác + event-log (Phase 2). Host-authoritative. */

import { randomUUID } from 'node:crypto';
import type {
  CookAvoid,
  CookEvent,
  CookRole,
  CookSession,
  CookSessionMember,
  SessionStatus,
} from '@cookafeast/core';
import { getDb } from './db.js';

/** Thành viên được coi là online nếu heartbeat trong vòng 30 giây. */
export const ONLINE_WINDOW_MS = 30_000;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ ký tự dễ nhầm (I,O,0,1)
function roomCode(): string {
  // randomUUID là nguồn ngẫu nhiên duy nhất được phép trong môi trường này
  const hex = randomUUID().replace(/-/g, '');
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[parseInt(hex.slice(i * 2, i * 2 + 2), 16) % CODE_ALPHABET.length];
  }
  return out;
}

interface MemberRow {
  id: string; session_id: string; name: string; skill: number; avoid: string;
  role: string; joined_at: number; last_heartbeat: number;
}

function rowToMember(r: MemberRow, now: number): CookSessionMember {
  return {
    id: r.id, name: r.name, skill: r.skill as 1 | 2 | 3,
    avoid: JSON.parse(r.avoid) as CookAvoid[],
    role: r.role as CookRole,
    isOnline: now - r.last_heartbeat <= ONLINE_WINDOW_MS,
    lastHeartbeat: r.last_heartbeat, joinedAt: r.joined_at,
  };
}

export const sessionRepo = {
  create(menuId: string): CookSession {
    const id = randomUUID();
    const now = Date.now();
    let code = roomCode();
    // tránh trùng mã phòng (cực hiếm)
    const exists = getDb().prepare('SELECT 1 FROM cook_session WHERE room_code = ?');
    while (exists.get(code)) code = roomCode();
    getDb()
      .prepare('INSERT INTO cook_session (id, menu_id, room_code, host_member_id, status, created_at) VALUES (?,?,?,?,?,?)')
      .run(id, menuId, code, null, 'LOBBY', now);
    return { id, menuInstanceId: menuId, roomCode: code, hostMemberId: '', status: 'LOBBY', createdAt: now, members: [] };
  },

  get(id: string): CookSession | undefined {
    const s = getDb().prepare('SELECT * FROM cook_session WHERE id = ?').get(id) as
      | { id: string; menu_id: string; room_code: string; host_member_id: string | null; status: string; created_at: number }
      | undefined;
    if (!s) return undefined;
    return {
      id: s.id, menuInstanceId: s.menu_id, roomCode: s.room_code,
      hostMemberId: s.host_member_id ?? '', status: s.status as SessionStatus,
      createdAt: s.created_at, members: sessionRepo.members(s.id),
    };
  },

  getByRoom(code: string): CookSession | undefined {
    const row = getDb().prepare('SELECT id FROM cook_session WHERE room_code = ?').get(code.toUpperCase()) as { id: string } | undefined;
    return row ? sessionRepo.get(row.id) : undefined;
  },

  getByMenu(menuId: string): CookSession | undefined {
    const row = getDb().prepare('SELECT id FROM cook_session WHERE menu_id = ? ORDER BY created_at DESC LIMIT 1').get(menuId) as { id: string } | undefined;
    return row ? sessionRepo.get(row.id) : undefined;
  },

  members(sessionId: string): CookSessionMember[] {
    const now = Date.now();
    const rows = getDb().prepare('SELECT * FROM cook_session_member WHERE session_id = ? ORDER BY joined_at').all(sessionId) as MemberRow[];
    return rows.map((r) => rowToMember(r, now));
  },

  addMember(sessionId: string, m: { name: string; skill?: 1 | 2 | 3; avoid?: CookAvoid[]; role?: CookRole }): CookSessionMember {
    const id = randomUUID();
    const now = Date.now();
    const role: CookRole = m.role ?? 'MEMBER';
    getDb()
      .prepare('INSERT INTO cook_session_member (id, session_id, name, skill, avoid, role, joined_at, last_heartbeat) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, sessionId, m.name, m.skill ?? 2, JSON.stringify(m.avoid ?? []), role, now, now);
    // người đầu tiên → host
    const isFirst = (getDb().prepare('SELECT COUNT(*) c FROM cook_session_member WHERE session_id = ?').get(sessionId) as { c: number }).c === 1;
    if (isFirst) {
      getDb().prepare('UPDATE cook_session SET host_member_id = ? WHERE id = ?').run(id, sessionId);
      getDb().prepare('UPDATE cook_session_member SET role = ? WHERE id = ?').run('HOST', id);
    }
    return rowToMember(getDb().prepare('SELECT * FROM cook_session_member WHERE id = ?').get(id) as MemberRow, now);
  },

  touchMember(memberId: string): void {
    getDb().prepare('UPDATE cook_session_member SET last_heartbeat = ? WHERE id = ?').run(Date.now(), memberId);
  },

  getMember(memberId: string): CookSessionMember | undefined {
    const r = getDb().prepare('SELECT * FROM cook_session_member WHERE id = ?').get(memberId) as MemberRow | undefined;
    return r ? rowToMember(r, Date.now()) : undefined;
  },

  setStatus(sessionId: string, status: SessionStatus): void {
    getDb().prepare('UPDATE cook_session SET status = ? WHERE id = ?').run(status, sessionId);
  },

  promoteHost(sessionId: string, memberId: string): void {
    getDb().prepare('UPDATE cook_session SET host_member_id = ? WHERE id = ?').run(memberId, sessionId);
    getDb().prepare('UPDATE cook_session_member SET role = ? WHERE id = ?').run('HOST', memberId);
  },
};

export const eventRepo = {
  nextSeq(menuId: string): number {
    const r = getDb().prepare('SELECT MAX(seq) m FROM cook_event_log WHERE menu_id = ?').get(menuId) as { m: number | null };
    return (r.m ?? 0) + 1;
  },
  append(menuId: string, event: CookEvent): void {
    getDb()
      .prepare('INSERT INTO cook_event_log (menu_id, seq, kind, data, created_at) VALUES (?,?,?,?,?)')
      .run(menuId, event.seq, event.kind, JSON.stringify(event), Date.now());
  },
  since(menuId: string, seq: number): CookEvent[] {
    const rows = getDb().prepare('SELECT data FROM cook_event_log WHERE menu_id = ? AND seq > ? ORDER BY seq').all(menuId, seq) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as CookEvent);
  },
};
