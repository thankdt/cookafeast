import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CookSchedule, Machine, MenuInstance, RecipeStep, ScheduledTask, TaskAssignment } from '@cookafeast/core';
import type { Nav } from '../App.tsx';
import { api } from '../api.ts';
import { getCookCtx } from '../cookCtx.ts';
import { countdown, formatTime, useNow } from '../util.ts';
import { CookModeGuide } from '../components/CookModeGuide.tsx';
import { useSession } from '../sessionCtx.tsx';

const MACHINE_LABEL: Partial<Record<Machine, string>> = {
  BEP: 'bếp', LO: 'lò', HAP: 'nồi hấp', NOI_NINH: 'nồi ninh', CHAO_CHIEN: 'chảo chiên', NOI_COM: 'nồi cơm',
};

export function CookMode({ nav }: { nav: Nav }) {
  const s = useSession();
  const collab = !!(s.session && s.session.menuInstanceId === nav.menuId);
  const myId = s.member?.id;

  const [sched, setSched] = useState<CookSchedule | null>(null);
  const [localStates, setLocalStates] = useState<Map<string, TaskAssignment>>(new Map());
  const [menu, setMenu] = useState<MenuInstance | null>(null);
  const [guide, setGuide] = useState<{ step: RecipeStep; dishName: string } | null>(null);
  const [err, setErr] = useState('');
  const now = useNow(15000);

  const load = useCallback(async () => {
    if (!nav.menuId) return;
    const ctx = getCookCtx(nav.menuId);
    const [sc, m] = await Promise.all([
      api.schedule(nav.menuId, { numPeople: ctx.numPeople, availableFrom: ctx.availableFrom }),
      api.menu(nav.menuId),
    ]);
    setSched(sc);
    setMenu(m);
    if (!collab) {
      const st = await api.cookStates(nav.menuId);
      setLocalStates(new Map(st.map((x) => [x.taskId, x])));
    }
  }, [nav.menuId, collab]);

  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);

  const stepIndex = useMemo(() => {
    const m = new Map<string, Map<string, RecipeStep>>();
    for (const d of menu?.dishes ?? []) m.set(d.dishId, new Map(d.recipeSnapshot.steps.map((st) => [st.id, st])));
    return m;
  }, [menu]);
  const lookupStep = (dishId: string, stepId: string) => stepIndex.get(dishId)?.get(stepId);

  // re-plan: khi tập việc-đã-xong đổi → tải lại lịch (server loại việc xong + dời lịch còn lại)
  const doneKey = useMemo(() => {
    const cur = collab ? s.taskStates : localStates;
    return [...cur.entries()].filter(([, v]) => v.status === 'DONE').map(([k]) => k).sort().join(',');
  }, [collab, s.taskStates, localStates]);
  useEffect(() => {
    if (!nav.menuId || !doneKey) return;
    const id = setTimeout(() => {
      const ctx = getCookCtx(nav.menuId!);
      api.schedule(nav.menuId!, { numPeople: ctx.numPeople, availableFrom: ctx.availableFrom })
        .then(setSched).catch(() => { /* giữ lịch cũ nếu lỗi */ });
    }, 1500);
    return () => clearTimeout(id);
  }, [doneKey, nav.menuId]);

  const states = collab ? s.taskStates : localStates;
  const memberName = (id?: string) => s.members.find((m) => m.id === id)?.name;

  const markDone = (taskId: string) => {
    if (collab) { s.setStatus(taskId, 'DONE'); return; }
    void api.setTask(nav.menuId!, taskId, { status: 'DONE', progress: 100 });
    setLocalStates((prev) => {
      const next = new Map(prev);
      next.set(taskId, { taskId, status: 'DONE', progress: 100, version: 0, updatedAt: Date.now() });
      return next;
    });
  };
  const openGuide = (t: ScheduledTask) => {
    const st = lookupStep(t.dishId, t.stepId);
    if (st) setGuide({ step: st, dishName: t.dishName });
  };

  if (err) return <Frame nav={nav}><div className="err">{err}</div></Frame>;
  if (!sched) return <Frame nav={nav}><div className="loading">Đang lập lịch nấu…</div></Frame>;

  const isDone = (t: ScheduledTask) => states.get(t.id)?.status === 'DONE';
  const doneIds = new Set(sched.tasks.filter(isDone).map((t) => t.id));
  const pending = sched.tasks.filter((t) => !isDone(t));
  const available = pending.filter((t) => t.predecessorTaskIds.every((p) => doneIds.has(p)));
  available.sort((a, b) => a.start - b.start || a.slackMin - b.slackMin);
  const allDone = pending.length === 0;
  const camWarn = sched.warnings.find((w) => w.level === 'CAM');
  const recentReject = collab && s.lastReject && now - s.lastReject.at < 6000 ? s.lastReject : null;

  // chế độ 1 người: việc kế tiếp tự động. chế độ nhiều người: việc của tôi + việc có thể nhận.
  const myTasks = collab ? available.filter((t) => states.get(t.id)?.personId === myId) : [];
  const unclaimed = collab ? available.filter((t) => !states.get(t.id)?.personId) : [];
  const current = collab ? myTasks[0] : available[0];

  return (
    <Frame nav={nav}>
      <div className="card warm">
        <div className="countdown">
          <div className="t">{countdown(sched.serveAt, now)}</div>
          <div className="lbl">đến giờ dọn cỗ · {formatTime(sched.serveAt)}</div>
        </div>
        {allDone ? (
          <div className="reassure">Tất cả đã xong. Cả nhà làm tốt lắm — giờ là lúc bày mâm.</div>
        ) : camWarn ? (
          <div className="reassure alert">{camWarn.message}</div>
        ) : (
          <div className="reassure">Đang đúng tiến độ. Cần vào bếp lúc <b>{formatTime(sched.earliestStartOverall)}</b>.</div>
        )}
        {collab && !s.connected && <div className="reassure warn" style={{ marginTop: 8 }}>○ Mất kết nối — thao tác của bạn sẽ tự đồng bộ khi có mạng lại.</div>}
      </div>

      {recentReject && <div className="err">{recentReject.reason}</div>}

      {collab && (
        <div className="card">
          <p className="kicker">Ai đang nấu ({s.members.filter((m) => m.isOnline).length} online)</p>
          {s.members.map((m) => {
            const onTask = sched.tasks.find((t) => states.get(t.id)?.personId === m.id && states.get(t.id)?.status === 'IN_PROGRESS');
            return (
              <div className="dish" key={m.id} style={{ padding: '8px 0' }}>
                <span className={`dot-online ${m.isOnline ? 'on' : ''}`} />
                <span className="grow">
                  <span style={{ fontWeight: 500 }}>{m.name}{m.id === myId ? ' (bạn)' : ''}</span>
                  <div className="muted small">{onTask ? `đang: ${onTask.text}` : 'đang chờ việc'}</div>
                </span>
                {m.role === 'HOST' && <span className="badge req">bếp trưởng</span>}
              </div>
            );
          })}
        </div>
      )}

      {sched.prepAhead.length > 0 && (
        <div className="card">
          <p className="kicker">Chuẩn bị trước ngày cúng</p>
          {sched.prepAhead.map((p) => (
            <div className="dish" key={p.id}>
              <span className="grow"><span className="name">{p.dishName}</span><span className="muted small"> — {p.text}</span></span>
              <span className="badge ahead">trước {p.makeAheadDays} ngày</span>
            </div>
          ))}
        </div>
      )}

      {current && (
        <div className="card task-now">
          <p className="kicker">Việc của bạn ngay bây giờ</p>
          <div className="name">{current.text}</div>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {current.dishName}
            {current.machine && ` · dùng ${MACHINE_LABEL[current.machine] ?? current.machine}`}
            {current.activeMin > 0 && ` · ~${current.activeMin} phút`}
          </p>
          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            {lookupStep(current.dishId, current.stepId) && (
              <button className="btn secondary" onClick={() => openGuide(current)}>Xem hướng dẫn</button>
            )}
            <button className="btn big ok" onClick={() => markDone(current.id)}>✓ Tôi xong việc này</button>
          </div>
        </div>
      )}

      {collab && !current && !allDone && (
        <div className="card"><p className="muted center" style={{ margin: 0 }}>Hãy nhận một việc bên dưới để bắt đầu.</p></div>
      )}

      {collab && unclaimed.length > 0 && (
        <>
          <p className="kicker">Việc có thể nhận</p>
          <div className="card">
            {unclaimed.map((t) => (
              <div className="dish" key={t.id}>
                <span className="grow">
                  <span style={{ fontWeight: 500 }}>{t.text}</span>
                  <div className="muted small">{t.dishName}{t.activeMin > 0 && ` · ~${t.activeMin} phút`}{t.mustFinishHot && ' · nóng sốt'}</div>
                </span>
                <button className="btn secondary small" onClick={() => s.claimTask(t.id, states.get(t.id)?.version)}>Nhận việc</button>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="kicker">Lịch nấu</p>
      <div className="card">
        {sched.tasks.map((t) => {
          const owner = states.get(t.id)?.personId;
          return (
            <div key={t.id} className={`timeline-item ${isDone(t) ? 'done' : ''}`}>
              <span className="time">{formatTime(t.start)}</span>
              <span className="grow">
                <div style={{ fontWeight: 500 }}>{t.text} <span className="muted small">· {t.dishName}</span></div>
                {collab && owner && !isDone(t) && <span className="crit">{memberName(owner) ?? 'ai đó'} đang làm</span>}
                {t.mustFinishHot && <span className="badge hot">nóng sốt</span>}
              </span>
              {isDone(t) && <span className="muted">✓</span>}
            </div>
          );
        })}
      </div>

      {guide && <CookModeGuide step={guide.step} dishName={guide.dishName} onClose={() => setGuide(null)} />}

      <div className="fab-bar"><div className="inner">
        {allDone
          ? <button className="btn" onClick={() => nav.go('ritual', nav.menuId!)}>Bày mâm & làm lễ →</button>
          : <button className="btn secondary" onClick={() => nav.go('ritual', nav.menuId!)}>Xem thủ tục cúng</button>}
      </div></div>
    </Frame>
  );
}

function Frame({ nav, children }: { nav: Nav; children: React.ReactNode }) {
  return (
    <div className="screen">
      <div className="topbar">
        <button className="back" onClick={() => nav.go('hub')}>‹ Tổng quan</button>
        <div className="spacer" />
        <span className="brand">Vào bếp</span>
      </div>
      {children}
    </div>
  );
}
