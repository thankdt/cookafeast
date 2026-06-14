/**
 * Hub kết nối realtime (in-memory). Giữ các kết nối đang sống theo phiên,
 * broadcast event cho cả phòng, tính presence. Tách khỏi thư viện WS cụ thể
 * (chỉ cần một hàm `send`) để sau này thay LAN→cloud relay không phải sửa logic.
 */

import type { CookEvent, ServerMessage } from '@cookafeast/core';

export interface Conn {
  memberId: string;
  send: (msg: ServerMessage) => void;
}

class CookSessionHub {
  private bySession = new Map<string, Set<Conn>>();
  private sessionMenu = new Map<string, string>();
  private menuSessions = new Map<string, Set<string>>();

  register(sessionId: string, menuId: string, conn: Conn): void {
    if (!this.bySession.has(sessionId)) this.bySession.set(sessionId, new Set());
    this.bySession.get(sessionId)!.add(conn);
    this.sessionMenu.set(sessionId, menuId);
    if (!this.menuSessions.has(menuId)) this.menuSessions.set(menuId, new Set());
    this.menuSessions.get(menuId)!.add(sessionId);
  }

  unregister(sessionId: string, conn: Conn): void {
    this.bySession.get(sessionId)?.delete(conn);
  }

  /** memberId của những người ĐANG có kết nối sống trong phiên. */
  onlineMemberIds(sessionId: string): Set<string> {
    const set = new Set<string>();
    for (const c of this.bySession.get(sessionId) ?? []) set.add(c.memberId);
    return set;
  }

  hasSession(menuId: string): boolean {
    const s = this.menuSessions.get(menuId);
    return !!s && s.size > 0;
  }

  broadcastToSession(sessionId: string, msg: ServerMessage): void {
    for (const c of this.bySession.get(sessionId) ?? []) {
      try { c.send(msg); } catch { /* socket chết — bỏ qua, close handler sẽ dọn */ }
    }
  }

  /** Broadcast một event tới mọi phiên gắn với menu này. */
  broadcastEventByMenu(menuId: string, event: CookEvent): void {
    for (const sid of this.menuSessions.get(menuId) ?? []) {
      this.broadcastToSession(sid, { t: 'EVENT', event });
    }
  }
}

export const hub = new CookSessionHub();
