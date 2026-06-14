/** CookSocket: kết nối WS tới host, reconnect backoff, heartbeat, replay outbox. */
import type {
  ClientMessage,
  CookAvoid,
  CookEvent,
  CookSession,
  CookSessionMember,
  Mutation,
  ServerMessage,
  TaskAssignment,
} from '@cookafeast/core';
import { outbox } from './outbox.ts';

export interface SocketCallbacks {
  onWelcome: (session: CookSession, member: CookSessionMember, taskStates: TaskAssignment[]) => void;
  onEvent: (event: CookEvent) => void;
  onAck: (clientMutationId: string, ok: boolean, error?: string) => void;
  onStatus: (connected: boolean) => void;
}

export interface HelloInfo {
  name: string;
  skill?: 1 | 2 | 3;
  avoid?: CookAvoid[];
}

export class CookSocket {
  private ws: WebSocket | null = null;
  private seq = 0;
  private hb: ReturnType<typeof setInterval> | null = null;
  private backoff = 1000;
  private closed = false;

  constructor(
    private sessionId: string,
    private hello: HelloInfo,
    private cbs: SocketCallbacks,
    private memberKey: string,
  ) {}

  connect(): void {
    this.closed = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/socket`);
    this.ws = ws;
    ws.onopen = () => {
      const memberId = localStorage.getItem(this.memberKey) ?? undefined;
      this.sendRaw({
        t: 'HELLO', sessionId: this.sessionId, memberId,
        name: this.hello.name, skill: this.hello.skill, avoid: this.hello.avoid, lastSeq: this.seq,
      });
    };
    ws.onmessage = (ev) => {
      let m: ServerMessage;
      try { m = JSON.parse(ev.data as string); } catch { return; }
      this.onMessage(m);
    };
    ws.onclose = () => {
      this.cbs.onStatus(false);
      this.stopHb();
      if (!this.closed) {
        this.backoff = Math.min(this.backoff * 1.6, 15000);
        setTimeout(() => { if (!this.closed) this.connect(); }, this.backoff);
      }
    };
    ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
  }

  private onMessage(m: ServerMessage): void {
    if (m.t === 'WELCOME') {
      this.backoff = 1000;
      localStorage.setItem(this.memberKey, m.member.id);
      this.seq = Math.max(this.seq, m.seq);
      this.cbs.onStatus(true);
      this.cbs.onWelcome(m.session, m.member, m.taskStates);
      this.startHb();
      void this.flushOutbox();
    } else if (m.t === 'EVENT') {
      this.seq = Math.max(this.seq, m.event.seq);
      this.cbs.onEvent(m.event);
    } else if (m.t === 'ACK') {
      if (m.ok) void outbox.remove(m.clientMutationId);
      this.cbs.onAck(m.clientMutationId, m.ok, m.error);
    } else if (m.t === 'ERROR') {
      console.warn('[ws]', m.code, m.message);
    }
  }

  private async flushOutbox(): Promise<void> {
    for (const row of await outbox.all()) this.sendRaw({ t: 'MUTATE', mutation: row.mutation });
  }

  /** Gửi một mutation (optimistic): lưu outbox trước, rồi gửi nếu đang kết nối. */
  async mutate(mutation: Mutation): Promise<void> {
    await outbox.add(mutation);
    this.sendRaw({ t: 'MUTATE', mutation });
  }

  private sendRaw(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
  private startHb(): void {
    this.stopHb();
    this.hb = setInterval(() => this.sendRaw({ t: 'HEARTBEAT' }), 15000);
  }
  private stopHb(): void {
    if (this.hb) clearInterval(this.hb);
    this.hb = null;
  }
  close(): void {
    this.closed = true;
    this.stopHb();
    try { this.ws?.close(); } catch { /* noop */ }
  }
}
