import { useEffect, useState } from 'react';
import type { OccasionDiary, Remembrance } from '@cookafeast/core';
import type { Nav } from '../App.tsx';
import { api } from '../api.ts';
import { formatDateTime } from '../util.ts';

export function FamilySoul({ nav }: { nav: Nav }) {
  const [tab, setTab] = useState<'remember' | 'diary'>('remember');
  const [rems, setRems] = useState<Remembrance[]>([]);
  const [diaries, setDiaries] = useState<OccasionDiary[]>([]);
  const [form, setForm] = useState({ name: '', relation: '', favoriteDishes: '', message: '' });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.remembrances().then(setRems).catch(() => {});
    api.diaries().then(setDiaries).catch(() => {});
  }, []);

  async function addRem() {
    if (!form.name.trim()) return;
    const r = await api.addRemembrance({
      name: form.name.trim(),
      relation: form.relation.trim() || undefined,
      favoriteDishes: form.favoriteDishes.trim() || undefined,
      message: form.message.trim() || undefined,
    });
    setRems((prev) => [r, ...prev]);
    setForm({ name: '', relation: '', favoriteDishes: '', message: '' });
    setAdding(false);
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="back" onClick={() => nav.go('home')}>‹ Trang chủ</button>
        <div className="spacer" />
        <span className="brand">Góc gia đình</span>
      </div>

      <div className="card warm">
        <p className="kicker">Nếp nhà</p>
        <h1>Giữ lại cho mai sau</h1>
        <p className="muted" style={{ margin: 0 }}>Nơi lưu những người mình thương nhớ và những dịp mình đã lo — để truyền thống không phai.</p>
      </div>

      <div className="chips" style={{ marginBottom: 14 }}>
        <button className={`chip ${tab === 'remember' ? 'sel' : ''}`} onClick={() => setTab('remember')}>Tưởng nhớ</button>
        <button className={`chip ${tab === 'diary' ? 'sel' : ''}`} onClick={() => setTab('diary')}>Nhật ký dịp</button>
      </div>

      {tab === 'remember' && (
        <>
          {rems.map((r) => (
            <div className="card" key={r.id}>
              <div style={{ fontWeight: 600, fontFamily: 'Lora, serif', fontSize: '1.1rem' }}>
                {r.name}{r.relation ? ` · ${r.relation}` : ''}
              </div>
              {r.favoriteDishes && <p className="muted small" style={{ margin: '4px 0 0' }}>Món thích: {r.favoriteDishes}</p>}
              {r.message && <p style={{ marginTop: 8, fontStyle: 'italic' }}>"{r.message}"</p>}
            </div>
          ))}
          {adding ? (
            <div className="card">
              <label className="field"><span className="lbl">Tên người</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="vd: Bố" /></label>
              <label className="field"><span className="lbl">Quan hệ</span>
                <input value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} placeholder="vd: cha" /></label>
              <label className="field"><span className="lbl">Món thích</span>
                <input value={form.favoriteDishes} onChange={(e) => setForm({ ...form, favoriteDishes: e.target.value })} placeholder="vd: thịt đông, canh măng" /></label>
              <label className="field"><span className="lbl">Lời nhắn (riêng tư)</span>
                <input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="đôi lời gửi gắm" /></label>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn ghost" onClick={() => setAdding(false)}>Huỷ</button>
                <button className="btn" disabled={!form.name.trim()} onClick={addRem}>Lưu</button>
              </div>
            </div>
          ) : (
            <button className="btn secondary" onClick={() => setAdding(true)}>+ Thêm người để tưởng nhớ</button>
          )}
        </>
      )}

      {tab === 'diary' && (
        <>
          {diaries.length === 0 && <div className="empty">Chưa có dịp nào được lưu. Sau khi lo xong một dịp, ở màn "Nhìn lại" bạn có thể lưu kỷ niệm.</div>}
          {diaries.map((d) => (
            <div className="card" key={d.id}>
              <div style={{ fontWeight: 600 }}>{d.title}</div>
              <div className="muted small">{formatDateTime(d.serveAt)}</div>
              {d.note && <p style={{ marginTop: 8 }}>{d.note}</p>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
