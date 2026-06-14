import { useEffect, useState } from 'react';
import type { MenuInstance } from '@cookafeast/core';
import type { Nav } from '../App.tsx';
import { api } from '../api.ts';

export function Done({ nav }: { nav: Nav }) {
  const [menu, setMenu] = useState<MenuInstance | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (nav.menuId) api.menu(nav.menuId).then(setMenu).catch(() => {});
  }, [nav.menuId]);

  async function saveReflection() {
    if (!menu) return;
    await api.addDiary({
      menuId: menu.id, occasionId: menu.occasionId, title: menu.title ?? 'Mâm cỗ',
      serveAt: menu.serveAt, note: note.trim() || undefined,
    });
    setSaved(true);
  }

  return (
    <div className="screen">
      <div className="topbar">
        <div className="spacer" />
        <span className="brand">cookafeast</span>
      </div>

      <div className="card warm center" style={{ paddingTop: 28, paddingBottom: 28 }}>
        <div style={{ fontSize: '3rem' }}>🕯️</div>
        <h1>Bạn đã làm được.</h1>
        <p className="muted">
          Mâm cỗ đã tươm tất, lễ đã xong. Cha mẹ, ông bà hẳn cũng ấm lòng khi thấy bạn giữ trọn nếp nhà.
        </p>
      </div>

      {menu && (
        <div className="card">
          <p className="kicker">Đã lo</p>
          <div style={{ fontWeight: 600 }}>{menu.title}</div>
          <p className="muted small" style={{ marginTop: 4 }}>
            {menu.dishes.length} món · {menu.scaling.persons} người. Mâm này đã được lưu để năm sau bạn không phải bắt đầu lại từ đầu.
          </p>
        </div>
      )}

      <div className="card">
        <p className="kicker">Đôi dòng nhìn lại</p>
        {saved ? (
          <p className="reassure" style={{ margin: 0 }}>Đã lưu vào nhật ký gia đình. Năm sau mở lại sẽ thấy.</p>
        ) : (
          <>
            <p className="muted small" style={{ marginTop: 0 }}>Ghi lại một điều cho lần sau — món nào cần nhiều hơn, ai khen món gì, điều gì muốn nhớ…</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              style={{ width: '100%', fontFamily: 'inherit', fontSize: '1rem', padding: 12, border: '1.5px solid var(--line)', borderRadius: 12 }}
              placeholder="vd: Năm sau làm thêm 1 đĩa nem, cả nhà ăn hết sạch…"
            />
            <button className="btn secondary" style={{ marginTop: 8 }} onClick={saveReflection}>Lưu kỷ niệm</button>
          </>
        )}
      </div>

      <div className="card flat">
        <p className="muted small" style={{ margin: 0 }}>
          Lần giỗ sau, mở lại cookafeast là có sẵn mâm cũ để dùng lại hoặc chỉnh. Bạn không phải nhớ một mình nữa.
        </p>
      </div>

      <div className="fab-bar">
        <div className="inner">
          <button className="btn" onClick={() => nav.go('home')}>Về trang chủ</button>
        </div>
      </div>
    </div>
  );
}
