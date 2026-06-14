import { useCallback, useEffect, useState } from 'react';
import type { MenuInstance } from '@cookafeast/core';
import { api } from './api.ts';
import { formatDateTime } from './util.ts';
import { Onboarding } from './screens/Onboarding.tsx';
import { Hub } from './screens/Hub.tsx';
import { MenuScreen } from './screens/MenuScreen.tsx';
import { Shopping } from './screens/Shopping.tsx';
import { CookMode } from './screens/CookMode.tsx';
import { Ritual } from './screens/Ritual.tsx';
import { Done } from './screens/Done.tsx';
import { RecipeDetail } from './screens/RecipeDetail.tsx';
import { Lobby } from './screens/Lobby.tsx';
import { Join } from './screens/Join.tsx';
import { FamilySoul } from './screens/FamilySoul.tsx';
import { SessionProvider } from './sessionCtx.tsx';

export type View = 'home' | 'onboarding' | 'hub' | 'menu' | 'shopping' | 'cook' | 'ritual' | 'done' | 'recipeDetail' | 'lobby' | 'join' | 'family';

export interface Nav {
  go: (view: View, menuId?: string, param?: string) => void;
  menuId: string | null;
  /** Tham số phụ cho màn hiện tại (vd dishId cho màn công thức). */
  param: string | null;
}

const LS_KEY = 'cookafeast.activeMenu';

export function App() {
  const joinCode = new URLSearchParams(location.search).get('join');
  const [view, setView] = useState<View>(joinCode ? 'join' : 'home');
  const [menuId, setMenuId] = useState<string | null>(() => localStorage.getItem(LS_KEY));
  const [param, setParam] = useState<string | null>(joinCode);

  const go = useCallback((v: View, id?: string, p?: string) => {
    if (id !== undefined) {
      setMenuId(id);
      localStorage.setItem(LS_KEY, id);
    }
    setParam(p ?? null);
    setView(v);
    window.scrollTo(0, 0);
  }, []);

  const nav: Nav = { go, menuId, param };

  return (
    <SessionProvider>
      <div className="app">
        {view === 'home' && <Home nav={nav} />}
        {view === 'onboarding' && <Onboarding nav={nav} />}
        {view === 'hub' && <Hub nav={nav} />}
        {view === 'menu' && <MenuScreen nav={nav} />}
        {view === 'shopping' && <Shopping nav={nav} />}
        {view === 'cook' && <CookMode nav={nav} />}
        {view === 'ritual' && <Ritual nav={nav} />}
        {view === 'done' && <Done nav={nav} />}
        {view === 'recipeDetail' && <RecipeDetail nav={nav} />}
        {view === 'lobby' && <Lobby nav={nav} />}
        {view === 'join' && <Join nav={nav} />}
        {view === 'family' && <FamilySoul nav={nav} />}
      </div>
    </SessionProvider>
  );
}

function Home({ nav }: { nav: Nav }) {
  const [menus, setMenus] = useState<MenuInstance[] | null>(null);
  const [nl, setNl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.menus().then(setMenus).catch(() => setMenus([]));
  }, []);

  async function suggestAndCreate() {
    if (!nl.trim()) return;
    setBusy(true); setErr('');
    try {
      const s = await api.suggestMenu(nl.trim());
      const d = new Date(); d.setHours(11, 0, 0, 0);
      const menu = await api.createMenu({
        occasionId: s.occasionId, region: s.region, mamType: s.mamType,
        serveAt: d.getTime(), title: 'Mâm theo mô tả',
        scaling: { perTray: 6, scaleMode: 'ROUND_UP', guestCount: s.guestCount },
        dishIds: s.dishIds,
      });
      nav.go('hub', menu.id);
    } catch (e) {
      setErr((e as Error).message); setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <span className="brand">🍲 cookafeast</span>
      </div>
      <div className="card warm">
        <p className="kicker">Lo cỗ, nhẹ lòng</p>
        <h1>Để tôi lo cùng bạn.</h1>
        <p className="muted">
          Từ chọn món, đi chợ, đến nấu sao cho kịp giờ cúng và làm lễ cho đúng — bạn không phải nhớ hết một mình.
        </p>
        <button className="btn big" onClick={() => nav.go('onboarding')}>
          Bắt đầu lo một dịp
        </button>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => nav.go('join')}>
          Tham gia phòng bếp (có mã)
        </button>
      </div>

      <div className="card">
        <p className="kicker">✨ Tả bằng lời</p>
        <p className="muted small" style={{ marginTop: 0 }}>
          Vd: "mâm giỗ bố ở Huế, 3 mâm, mẹ thích cá" — tôi sẽ gợi ý mâm phù hợp.
        </p>
        {err && <div className="err">{err}</div>}
        <textarea
          value={nl}
          onChange={(e) => setNl(e.target.value)}
          rows={2}
          placeholder="Mô tả mâm bạn muốn lo…"
          style={{ width: '100%', fontFamily: 'inherit', fontSize: '1rem', padding: 12, border: '1.5px solid var(--line)', borderRadius: 12 }}
        />
        <button className="btn secondary" style={{ marginTop: 8 }} disabled={busy || !nl.trim()} onClick={suggestAndCreate}>
          {busy ? 'Đang gợi ý…' : 'Gợi ý giúp tôi'}
        </button>
      </div>

      <button className="choice" onClick={() => nav.go('family')}>
        <span className="em">🕊️</span>
        <span className="grow">
          <div style={{ fontWeight: 600 }}>Góc gia đình</div>
          <div className="sub">Tưởng nhớ người thân · sổ công thức · nhật ký các dịp</div>
        </span>
        <span className="muted">›</span>
      </button>

      {menus === null && <div className="loading">Đang tải…</div>}
      {menus && menus.length > 0 && (
        <>
          <p className="kicker" style={{ marginTop: 18 }}>Đang lo dở</p>
          {menus.map((m) => (
            <button key={m.id} className="choice" onClick={() => nav.go('hub', m.id)}>
              <span className="em">📋</span>
              <span className="grow">
                <div style={{ fontWeight: 600 }}>{m.title ?? 'Mâm cỗ'}</div>
                <div className="sub">{formatDateTime(m.serveAt)} · {m.dishes.length} món</div>
              </span>
              <span className="muted">›</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
