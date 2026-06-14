/** Đăng ký WebSocket /socket — kênh cộng tác realtime (Phase 2). */

import type { FastifyInstance } from 'fastify';
import type { ClientMessage, ServerMessage } from '@cookafeast/core';
import { eventRepo, sessionRepo } from './collab.js';
import { hub, type Conn } from './hub.js';
import { cookService } from './service.js';
import { cookRepo } from './repository.js';

export function registerWebSocket(app: FastifyInstance): void {
  app.get('/socket', { websocket: true }, (socket: import('ws').WebSocket) => {
    let conn: Conn | null = null;
    let sessionId = '';
    let menuId = '';
    let memberId = '';

    const send = (msg: ServerMessage) => {
      try { socket.send(JSON.stringify(msg)); } catch { /* socket đã đóng */ }
    };

    socket.on('message', (raw: unknown) => {
      let msg: ClientMessage;
      try { msg = JSON.parse(String(raw)); } catch { return; }

      if (msg.t === 'HELLO') {
        const session = sessionRepo.get(msg.sessionId);
        if (!session) {
          send({ t: 'ERROR', code: 'NO_SESSION', message: 'Phiên không tồn tại.' });
          socket.close();
          return;
        }
        sessionId = session.id;
        menuId = session.menuInstanceId;

        let member = msg.memberId ? sessionRepo.getMember(msg.memberId) : undefined;
        if (!member) {
          member = sessionRepo.addMember(session.id, {
            name: msg.name ?? 'Người nấu', skill: msg.skill, avoid: msg.avoid,
          });
        } else {
          sessionRepo.touchMember(member.id);
        }
        memberId = member.id;
        conn = { memberId, send };
        hub.register(sessionId, menuId, conn);

        const seq = Math.max(0, eventRepo.nextSeq(menuId) - 1);
        send({
          t: 'WELCOME',
          member,
          session: sessionRepo.get(sessionId)!,
          taskStates: cookRepo.states(menuId),
          seq,
        });
        if (msg.lastSeq != null && msg.lastSeq < seq) {
          for (const e of eventRepo.since(menuId, msg.lastSeq)) send({ t: 'EVENT', event: e });
        }
        cookService.broadcastPresence(sessionId);
        return;
      }

      if (!conn) {
        send({ t: 'ERROR', code: 'NO_HELLO', message: 'Cần gửi HELLO trước.' });
        return;
      }

      if (msg.t === 'HEARTBEAT') {
        sessionRepo.touchMember(memberId);
        return;
      }

      if (msg.t === 'MUTATE') {
        const r = cookService.applyMutation(menuId, msg.mutation, memberId);
        send({
          t: 'ACK',
          clientMutationId: msg.mutation.clientMutationId,
          ok: r.ok,
          state: r.state,
          error: r.reason,
        });
        return;
      }
    });

    socket.on('close', () => {
      if (conn) {
        hub.unregister(sessionId, conn);
        cookService.broadcastPresence(sessionId);
      }
    });
  });
}
