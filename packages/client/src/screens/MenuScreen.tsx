import { useEffect, useMemo, useState } from 'react';
import type { Dish, DishRole, MenuInstance } from '@cookafeast/core';
import type { Nav } from '../App.tsx';
import { api } from '../api.ts';

const ROLE_LABEL: Record<DishRole, string> = {
  MON_CHINH: 'Món chính', TINH_BOT: 'Xôi / Tinh bột', CANH: 'Canh / Bát',
  XAO: 'Món xào', DAU_VI: 'Khai vị', NOM_DUA: 'Nộm / Dưa', TRANG_MIENG: 'Tráng miệng',
};
const ROLE_ORDER: DishRole[] = ['MON_CHINH', 'TINH_BOT', 'CANH', 'XAO', 'DAU_VI', 'NOM_DUA', 'TRANG_MIENG'];

function primaryRole(d?: Dish): DishRole {
  return d?.roles[0] ?? 'MON_CHINH';
}

export function MenuScreen({ nav }: { nav: Nav }) {
  const [menu, setMenu] = useState<MenuInstance | null>(null);
  const [catalog, setCatalog] = useState<Dish[]>([]);
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [regionNote, setRegionNote] = useState<string>('');
  const [err, setErr] = useState('');

  async function load() {
    if (!nav.menuId) return;
    const m = await api.menu(nav.menuId);
    setMenu(m);
    setCatalog(await api.dishes(m.region, m.mamType));
    try {
      const { occasion } = await api.occasion(m.occasionId);
      setRegionNote(occasion.regionNotes?.[m.region] ?? '');
    } catch { /* ignore */ }
  }
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [nav.menuId]);

  const dishById = useMemo(() => new Map(catalog.map((d) => [d.id, d])), [catalog]);

  if (err) return <Frame nav={nav}><div className="err">{err}</div></Frame>;
  if (!menu) return <Frame nav={nav}><div className="loading">Đang tải…</div></Frame>;

  const currentIds = menu.dishes.map((d) => d.dishId);

  async function replace(oldDishId: string, newDishId: string) {
    if (!menu) return;
    const ids = currentIds.map((id) => (id === oldDishId ? newDishId : id));
    setSwapFor(null);
    setMenu(await api.updateDishes(menu.id, ids));
  }
  async function remove(dishId: string) {
    if (!menu) return;
    setMenu(await api.updateDishes(menu.id, currentIds.filter((id) => id !== dishId)));
  }

  // gom theo vai trò
  const grouped = ROLE_ORDER.map((role) => ({
    role,
    dishes: menu.dishes.filter((md) => primaryRole(dishById.get(md.dishId)) === role),
  })).filter((g) => g.dishes.length > 0);

  return (
    <Frame nav={nav}>
      <h1>Mâm cỗ gợi ý</h1>
      <p className="muted">Đây là mâm tôi đã chuẩn bị theo phong tục. Bạn có thể đổi hoặc bớt món tuỳ ý.</p>
      {regionNote && (
        <div className="card flat"><p className="muted small" style={{ margin: 0 }}>💡 {regionNote}</p></div>
      )}

      {grouped.map((g) => (
        <div className="card" key={g.role}>
          <p className="kicker">{ROLE_LABEL[g.role]}</p>
          {g.dishes.map((md) => {
            const d = dishById.get(md.dishId);
            const steps = md.recipeSnapshot.steps;
            const makeAhead = steps.some((s) => (s.makeAheadDays ?? 0) > 0);
            const hot = steps.some((s) => s.mustFinishHot);
            return (
              <div key={md.id}>
                <div className="dish">
                  <span className="grow">
                    <span className="name">{md.dishName}</span>
                    {md.required && <span className="badge req">không thể thiếu</span>}
                    {makeAhead && <span className="badge ahead">làm trước được</span>}
                    {hot && <span className="badge hot">nấu sát giờ</span>}
                    {d && d.difficulty === 1 && <span className="badge">dễ làm</span>}
                  </span>
                </div>
                <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                  <button className="btn ghost small" onClick={() => nav.go('recipeDetail', menu.id, md.dishId)}>
                    Xem công thức
                  </button>
                  <button className="btn ghost small" onClick={() => setSwapFor(swapFor === md.dishId ? null : md.dishId)}>
                    {swapFor === md.dishId ? 'Đóng' : 'Đổi món'}
                  </button>
                  {!md.required && (
                    <button className="btn ghost small" onClick={() => remove(md.dishId)}>Bỏ</button>
                  )}
                </div>
                {swapFor === md.dishId && (
                  <div className="card flat" style={{ background: '#faf6ee' }}>
                    <p className="muted small">Đổi sang món cùng nhóm:</p>
                    {catalog
                      .filter((alt) => primaryRole(alt) === g.role && !currentIds.includes(alt.id))
                      .slice(0, 8)
                      .map((alt) => (
                        <button key={alt.id} className="choice" onClick={() => replace(md.dishId, alt.id)}>
                          <span className="grow">{alt.name}</span>
                          <span className="muted small">{alt.difficulty === 1 ? 'dễ' : alt.difficulty === 3 ? 'khó' : ''}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="fab-bar">
        <div className="inner row">
          <button className="btn secondary" onClick={() => nav.go('shopping', menu.id)}>Đi chợ →</button>
          <button className="btn" onClick={() => nav.go('hub', menu.id)}>Xong, về tổng quan</button>
        </div>
      </div>
    </Frame>
  );
}

function Frame({ nav, children }: { nav: Nav; children: React.ReactNode }) {
  return (
    <div className="screen">
      <div className="topbar">
        <button className="back" onClick={() => nav.go('hub')}>‹ Tổng quan</button>
        <div className="spacer" />
        <span className="brand">Thực đơn</span>
      </div>
      {children}
    </div>
  );
}
