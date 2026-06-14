/**
 * Lớp service host-authoritative: MỌI mutation (từ WS hoặc REST) đi qua đây.
 * Áp vào SQLite (CAS cho claim), ghi event-log, broadcast cho phòng. Giữ một
 * đường ghi duy nhất để sau này thay transport (cloud) không phải sửa logic.
 */

import type { CookEvent, Mutation, TaskAssignment } from '@cookafeast/core';
import { cookRepo } from './repository.js';
import { eventRepo, sessionRepo } from './collab.js';
import { hub } from './hub.js';

export interface MutationResult {
  ok: boolean;
  state?: TaskAssignment;
  reason?: string;
}

export const cookService = {
  /** Áp một mutation lên trạng thái nấu của mâm. memberId = người thực hiện (rỗng nếu chế độ 1 người). */
  applyMutation(menuId: string, mutation: Mutation, memberId: string): MutationResult {
    let res: MutationResult;
    switch (mutation.type) {
      case 'CLAIM_TASK':
        res = cookRepo.claim(menuId, mutation.taskId, memberId, mutation.expectedVersion);
        break;
      case 'RELEASE_TASK':
        res = cookRepo.release(menuId, mutation.taskId, memberId);
        break;
      case 'UPDATE_PROGRESS':
        res = {
          ok: true,
          state: cookRepo.upsert(menuId, mutation.taskId, {
            progress: mutation.progress,
            ...(memberId ? { personId: memberId } : {}),
          }),
        };
        break;
      case 'SET_STATUS':
        res = {
          ok: true,
          state: cookRepo.upsert(menuId, mutation.taskId, {
            status: mutation.status,
            ...(memberId ? { personId: memberId } : {}),
          }),
        };
        break;
      default:
        return { ok: false, reason: 'Loại thao tác không hợp lệ.' };
    }

    if (!res.ok || !res.state) return res;

    // chỉ ghi log + broadcast khi mâm này có phiên cộng tác (chế độ 1 người thì bỏ qua)
    if (sessionRepo.getByMenu(menuId)) {
      const event: CookEvent = { seq: eventRepo.nextSeq(menuId), kind: 'TASK', taskState: res.state };
      eventRepo.append(menuId, event);
      hub.broadcastEventByMenu(menuId, event);
    }
    return res;
  },

  /** Broadcast presence (ai đang online) cho cả phòng. */
  broadcastPresence(sessionId: string): void {
    const session = sessionRepo.get(sessionId);
    if (!session) return;
    const online = hub.onlineMemberIds(sessionId);
    const members = session.members.map((m) => ({ ...m, isOnline: online.has(m.id) }));
    const event: CookEvent = {
      seq: eventRepo.nextSeq(session.menuInstanceId),
      kind: 'PRESENCE',
      members,
    };
    // presence không cần lưu lâu nhưng vẫn đánh seq để client áp đúng thứ tự
    eventRepo.append(session.menuInstanceId, event);
    hub.broadcastToSession(sessionId, { t: 'EVENT', event });
  },
};
