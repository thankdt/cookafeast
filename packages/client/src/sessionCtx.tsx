import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type {
  CookAvoid,
  CookEvent,
  CookSession,
  CookSessionMember,
  Mutation,
  TaskAssignment,
  TaskStatus,
} from '@cookafeast/core';
import { CookSocket } from './socket.ts';
import { api } from './api.ts';

/** id idempotency không cần secure-context (crypto.randomUUID không có trên http LAN). */
function genId(): string {
  return `m-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export interface JoinInfo {
  name: string;
  skill?: 1 | 2 | 3;
  avoid?: CookAvoid[];
}

interface SessionContextValue {
  session: CookSession | null;
  member: CookSessionMember | null;
  members: CookSessionMember[];
  taskStates: Map<string, TaskAssignment>;
  connected: boolean;
  lastReject: { reason: string; at: number } | null;
  isHost: boolean;
  startSession: (menuId: string, info: JoinInfo) => Promise<CookSession>;
  joinByCode: (code: string, info: JoinInfo) => Promise<CookSession>;
  leave: () => void;
  claimTask: (taskId: string, expectedVersion?: number) => void;
  releaseTask: (taskId: string) => void;
  updateProgress: (taskId: string, progress: number) => void;
  setStatus: (taskId: string, status: TaskStatus) => void;
}

const Ctx = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession phải nằm trong <SessionProvider>');
  return v;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CookSession | null>(null);
  const [member, setMember] = useState<CookSessionMember | null>(null);
  const [members, setMembers] = useState<CookSessionMember[]>([]);
  const [taskStates, setTaskStates] = useState<Map<string, TaskAssignment>>(new Map());
  const [connected, setConnected] = useState(false);
  const [lastReject, setLastReject] = useState<{ reason: string; at: number } | null>(null);
  const socketRef = useRef<CookSocket | null>(null);

  const applyEvent = useCallback((e: CookEvent) => {
    if (e.kind === 'TASK' && e.taskState) {
      setTaskStates((prev) => {
        const next = new Map(prev);
        next.set(e.taskState!.taskId, e.taskState!);
        return next;
      });
    } else if (e.kind === 'PRESENCE' && e.members) {
      setMembers(e.members);
    } else if (e.kind === 'SESSION' && e.session) {
      setSession(e.session);
    }
  }, []);

  const connect = useCallback(
    (sess: CookSession, info: JoinInfo) => {
      socketRef.current?.close();
      setSession(sess);
      const sock = new CookSocket(
        sess.id,
        info,
        {
          onWelcome: (s, me, states) => {
            setSession(s);
            setMember(me);
            setMembers(s.members);
            setTaskStates(new Map(states.map((t) => [t.taskId, t])));
          },
          onEvent: applyEvent,
          onAck: (_id, ok, error) => {
            if (!ok && error) setLastReject({ reason: error, at: Date.now() });
          },
          onStatus: setConnected,
        },
        `cookafeast.member.${sess.id}`,
      );
      socketRef.current = sock;
      sock.connect();
    },
    [applyEvent],
  );

  const startSession = useCallback(
    async (menuId: string, info: JoinInfo) => {
      const sess = await api.createSession(menuId);
      connect(sess, info);
      return sess;
    },
    [connect],
  );

  const joinByCode = useCallback(
    async (code: string, info: JoinInfo) => {
      const sess = await api.sessionByRoom(code);
      connect(sess, info);
      return sess;
    },
    [connect],
  );

  const leave = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setSession(null);
    setMember(null);
    setMembers([]);
    setTaskStates(new Map());
    setConnected(false);
  }, []);

  const mutate = useCallback((m: Omit<Mutation, 'clientMutationId'>) => {
    const sock = socketRef.current;
    if (!sock) return;
    void sock.mutate({ clientMutationId: genId(), ...m });
  }, []);

  const value: SessionContextValue = {
    session,
    member,
    members,
    taskStates,
    connected,
    lastReject,
    isHost: !!member && !!session && session.hostMemberId === member.id,
    startSession,
    joinByCode,
    leave,
    claimTask: (taskId, expectedVersion) => mutate({ type: 'CLAIM_TASK', taskId, expectedVersion }),
    releaseTask: (taskId) => mutate({ type: 'RELEASE_TASK', taskId }),
    updateProgress: (taskId, progress) => mutate({ type: 'UPDATE_PROGRESS', taskId, progress }),
    setStatus: (taskId, status) => mutate({ type: 'SET_STATUS', taskId, status }),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
