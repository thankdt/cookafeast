import { useEffect, useState } from 'react';
import type { LunarDate, MenuInstance } from '@cookafeast/core';
import type { Nav, View } from '../App.tsx';
import { api } from '../api.ts';
import { countdown, formatDateTime, useNow } from '../util.ts';

const JOURNEY: { view: View; emoji: string; label: string; sub: string }[] = [
  { view: 'menu', emoji: '🍽️', label: 'Thực đơn', sub: 'Xem & chỉnh các món' },
  { view: 'shopping', emoji: '🧺', label: 'Đi chợ', sub: 'Danh sách gộp theo quầy' },
  { view: 'cook', emoji: '⏱️', label: 'Vào bếp', sub: 'Nấu theo giờ, kịp mâm cỗ' },
  { view: 'ritual', emoji: '🕯️', label: 'Thủ tục cúng', sub: 'Bày mâm, thắp hương, khấn' },
];

export function Hub({ nav }: { nav: Nav }) {
  const [menu, setMenu] = useState<MenuInstance | null>(null);
  const [lunar, setLunar] = useState<LunarDate | null>(null);
  const [err, setErr] = useState('');
  const now = useNow(30000);

  useEffect(() => {
    if (!nav.menuId) return;
    api.menu(nav.menuId).then((m) => {
      setMenu(m);
      api.lunar(m.serveAt).then(setLunar).catch(() => {});
    }).catch((e) => setErr(e.message));
  }, [nav.menuId]);

  if (err) return <Frame nav={nav}><div className="err">{err}</div></Frame>;
  if (!menu) return <Frame nav={nav}><div className="loading">Đang tải…</div></Frame>;

  const toServe = menu.serveAt - now;
  const cd = countdown(menu.serveAt, now);
  const reassure =
    toServe <= 0
      ? 'Đã đến giờ cúng. Bạn đã làm được rồi.'
      : toServe < 3 * 3600_000
        ? 'Sắp tới giờ rồi — cứ theo từng bước, bạn đang đi đúng hướng.'
        : 'Còn thời gian thong thả. Mình chuẩn bị dần nhé.';

  return (
    <Frame nav={nav}>
      <div className="card warm">
        <p className="kicker">{menu.title}</p>
        <div className="countdown">
          <div className="t">{cd}</div>
          <div className="lbl">đến giờ cúng · {formatDateTime(menu.serveAt)}</div>
          {lunar && <div className="lbl" style={{ color: 'var(--gold)' }}>🌙 {lunar.text}, năm {lunar.ganzhiYear}</div>}
        </div>
        <div className="reassure" style={{ marginTop: 10 }}>{reassure}</div>
      </div>

      <p className="kicker">Các bước lo cỗ</p>
      {JOURNEY.map((j) => (
        <button key={j.view} className="choice" onClick={() => nav.go(j.view, menu.id)}>
          <span className="em">{j.emoji}</span>
          <span className="grow">
            <div style={{ fontWeight: 600 }}>{j.label}</div>
            <div className="sub">{j.sub}</div>
          </span>
          <span className="muted">›</span>
        </button>
      ))}

      <div className="card flat" style={{ textAlign: 'center' }}>
        <p style={{ margin: '0 0 8px', fontWeight: 500 }}>👨‍👩‍👧‍👦 Có người phụ bếp?</p>
        <button className="btn secondary" onClick={() => nav.go('lobby', menu.id)}>
          Mở phòng bếp — nấu cùng cả nhà
        </button>
      </div>

      <p className="muted small center" style={{ marginTop: 16 }}>
        {menu.dishes.length} món · {menu.scaling.persons} người
        {menu.scaling.fullTrays > 0 && ` (${menu.scaling.fullTrays} mâm${menu.scaling.remainder ? ` + ${menu.scaling.remainder} lẻ` : ''})`}
      </p>
    </Frame>
  );
}

function Frame({ nav, children }: { nav: Nav; children: React.ReactNode }) {
  return (
    <div className="screen">
      <div className="topbar">
        <button className="back" onClick={() => nav.go('home')}>‹ Trang chủ</button>
        <div className="spacer" />
        <span className="brand">cookafeast</span>
      </div>
      {children}
    </div>
  );
}
