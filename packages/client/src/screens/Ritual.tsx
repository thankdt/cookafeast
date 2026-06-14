import { useEffect, useState } from 'react';
import type { Occasion } from '@cookafeast/core';
import type { Nav } from '../App.tsx';
import { api } from '../api.ts';

interface KhanFields {
  tenNguoiKhan: string;
  ngay: string;
  diaChi: string;
  tenNguoiMat: string;
}

function fillKhan(tpl: string, f: KhanFields): string {
  return tpl
    .replaceAll('{{tenNguoiKhan}}', f.tenNguoiKhan || '…')
    .replaceAll('{{ngay}}', f.ngay || '…')
    .replaceAll('{{diaChi}}', f.diaChi || '…')
    .replaceAll('{{tenNguoiMat}}', f.tenNguoiMat || '…');
}

export function Ritual({ nav }: { nav: Nav }) {
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [err, setErr] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [fields, setFields] = useState<KhanFields>({ tenNguoiKhan: '', ngay: '', diaChi: '', tenNguoiMat: '' });
  const lsKey = `cookafeast.ritual.${nav.menuId}`;

  useEffect(() => {
    if (!nav.menuId) return;
    (async () => {
      const menu = await api.menu(nav.menuId!);
      const { occasion } = await api.occasion(menu.occasionId);
      setOccasion(occasion);
    })().catch((e) => setErr(e.message));
    let local: KhanFields | null = null;
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const saved = JSON.parse(raw) as { checked: string[]; fields: KhanFields };
        setChecked(new Set(saved.checked));
        if (saved.fields) { local = saved.fields; setFields(saved.fields); }
      }
    } catch { /* ignore */ }
    // điền sẵn tên người khấn + địa chỉ từ cấu hình gia đình (dùng lại mọi dịp)
    api.ritualConfig().then((cfg) => {
      setFields((f) => ({
        ...f,
        tenNguoiKhan: f.tenNguoiKhan || cfg.tenNguoiKhan || '',
        diaChi: f.diaChi || cfg.diaChi || '',
      }));
    }).catch(() => {});
    void local;
  }, [nav.menuId]);

  function persist(nextChecked: Set<string>, nextFields: KhanFields) {
    localStorage.setItem(lsKey, JSON.stringify({ checked: [...nextChecked], fields: nextFields }));
  }
  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      persist(next, fields);
      return next;
    });
  }
  function setField(k: keyof KhanFields, v: string) {
    const nf = { ...fields, [k]: v };
    setFields(nf);
    persist(checked, nf);
    // lưu tên người khấn + địa chỉ vào cấu hình gia đình để dịp sau điền sẵn
    if (k === 'tenNguoiKhan' || k === 'diaChi') {
      void api.saveRitualConfig({ tenNguoiKhan: nf.tenNguoiKhan, diaChi: nf.diaChi });
    }
  }

  if (err) return <Frame nav={nav}><div className="err">{err}</div></Frame>;
  if (!occasion) return <Frame nav={nav}><div className="loading">Đang tải…</div></Frame>;

  return (
    <Frame nav={nav}>
      <h1>Thủ tục cúng</h1>
      <p className="muted">
        Cứ làm theo từng bước. Lòng thành là điều quan trọng nhất — không có gì gọi là sai cả.
      </p>

      <div className="card">
        <p className="kicker">Các bước</p>
        {occasion.ritualChecklist.map((rs, i) => (
          <div key={rs.id} className={`ritual-step ${checked.has(rs.id) ? 'done' : ''}`} onClick={() => toggle(rs.id)}>
            <span className="n">{checked.has(rs.id) ? '✓' : i + 1}</span>
            <span className="grow">
              <div style={{ fontWeight: 500 }}>{rs.text}</div>
              {rs.note && <div className="muted small">{rs.note}</div>}
            </span>
          </div>
        ))}
      </div>

      {occasion.khanTemplate && (
        <div className="card">
          <p className="kicker">Văn khấn</p>
          <p className="muted small">Điền vài thông tin, tôi soạn sẵn bài khấn cho bạn đọc.</p>
          <div className="row">
            <label className="field"><span className="lbl">Người khấn</span>
              <input value={fields.tenNguoiKhan} onChange={(e) => setField('tenNguoiKhan', e.target.value)} placeholder="Họ tên bạn" /></label>
            <label className="field"><span className="lbl">Ngày (âm lịch)</span>
              <input value={fields.ngay} onChange={(e) => setField('ngay', e.target.value)} placeholder="vd: rằm tháng Bảy" /></label>
          </div>
          <label className="field"><span className="lbl">Địa chỉ</span>
            <input value={fields.diaChi} onChange={(e) => setField('diaChi', e.target.value)} placeholder="Nơi cúng" /></label>
          <label className="field"><span className="lbl">Người được cúng (nếu có)</span>
            <input value={fields.tenNguoiMat} onChange={(e) => setField('tenNguoiMat', e.target.value)} placeholder="vd: cụ ông…" /></label>
          <div className="khan">{fillKhan(occasion.khanTemplate, fields)}</div>
        </div>
      )}

      <div className="fab-bar">
        <div className="inner">
          <button className="btn" onClick={() => nav.go('done', nav.menuId!)}>Đã xong lễ →</button>
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
        <span className="brand">Thủ tục cúng</span>
      </div>
      {children}
    </div>
  );
}
