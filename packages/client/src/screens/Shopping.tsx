import { useEffect, useState } from 'react';
import type { MarketSection, ShoppingItem, ShoppingList } from '@cookafeast/core';
import type { Nav } from '../App.tsx';
import { api } from '../api.ts';
import { formatQty, formatVnd } from '../util.ts';

const SECTION_ORDER: MarketSection[] = ['THIT_CA', 'RAU_CU', 'DO_KHO_GIA_VI', 'DO_THO_VANG_MA'];
const SECTION_LABEL: Record<MarketSection, string> = {
  THIT_CA: '🥩 Thịt / Cá', RAU_CU: '🥬 Rau củ', DO_KHO_GIA_VI: '🍚 Đồ khô & gia vị', DO_THO_VANG_MA: '🕯️ Đồ thờ & vàng mã',
};

export function Shopping({ nav }: { nav: Nav }) {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');
  const lsKey = `cookafeast.shop.${nav.menuId}`;

  useEffect(() => {
    if (!nav.menuId) return;
    api.shopping(nav.menuId).then(setList).catch((e) => setErr(e.message));
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) setChecked(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, [nav.menuId]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(lsKey, JSON.stringify([...next]));
      return next;
    });
  }

  if (err) return <Frame nav={nav}><div className="err">{err}</div></Frame>;
  if (!list) return <Frame nav={nav}><div className="loading">Đang tính danh sách…</div></Frame>;

  const sections = SECTION_ORDER.map((s) => ({
    section: s,
    items: list.items.filter((i) => i.marketSection === s),
  })).filter((g) => g.items.length > 0);

  const doneCount = list.items.filter((i) => checked.has(i.ingredientId)).length;

  return (
    <Frame nav={nav}>
      <h1>Đi chợ</h1>
      <p className="muted">
        Đã gộp các nguyên liệu trùng và làm tròn theo cách mua thực tế. Tick dần khi bạn mua xong nhé.
      </p>
      <div className="card flat center">
        <span className="muted">{doneCount}/{list.items.length} món đã mua</span>
        {list.totalEstCost != null && <span className="muted"> · ước tính {formatVnd(list.totalEstCost)}</span>}
      </div>

      {sections.map((g) => (
        <div key={g.section} className={`shop-section ${g.section === 'DO_THO_VANG_MA' ? 'votive' : ''}`}>
          <div className="head">{SECTION_LABEL[g.section]}</div>
          {g.items.map((it) => (
            <Item key={it.ingredientId} it={it} on={checked.has(it.ingredientId)} toggle={() => toggle(it.ingredientId)} />
          ))}
        </div>
      ))}

      <div className="fab-bar">
        <div className="inner">
          <button className="btn" onClick={() => nav.go('cook', nav.menuId!)}>Mua xong, vào bếp →</button>
        </div>
      </div>
    </Frame>
  );
}

function Item({ it, on, toggle }: { it: ShoppingItem; on: boolean; toggle: () => void }) {
  return (
    <div className={`shop-item ${on ? 'checked' : ''}`} onClick={toggle}>
      <span className={`cbox ${on ? 'on' : ''}`}>{on ? '✓' : ''}</span>
      <span className="grow">
        <div style={{ fontWeight: 500 }}>{it.name}</div>
        <div className="muted small">cho: {it.usedBy.join(', ')}</div>
      </span>
      <span className="qty">{formatQty(it.purchaseQty)} {it.purchaseUnit}</span>
    </div>
  );
}

function Frame({ nav, children }: { nav: Nav; children: React.ReactNode }) {
  return (
    <div className="screen">
      <div className="topbar">
        <button className="back" onClick={() => nav.go('hub')}>‹ Tổng quan</button>
        <div className="spacer" />
        <span className="brand">Đi chợ</span>
      </div>
      {children}
    </div>
  );
}
