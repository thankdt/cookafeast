import { useState } from 'react';
import type { Nav } from '../App.tsx';
import { useSession } from '../sessionCtx.tsx';

const NAME_KEY = 'cookafeast.myName';

export function Join({ nav }: { nav: Nav }) {
  const s = useSession();
  const [code, setCode] = useState(() => (nav.param ?? '').toUpperCase());
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function join() {
    if (!code.trim() || !name.trim()) return;
    setBusy(true); setErr('');
    try {
      localStorage.setItem(NAME_KEY, name.trim());
      const sess = await s.joinByCode(code.trim().toUpperCase(), { name: name.trim() });
      nav.go('cook', sess.menuInstanceId);
    } catch (e) {
      setErr('Không vào được phòng: ' + (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="back" onClick={() => nav.go('home')}>‹ Trang chủ</button>
        <div className="spacer" />
        <span className="brand">Tham gia nấu</span>
      </div>

      <div className="card warm">
        <p className="kicker">Cùng nấu với gia đình</p>
        <h1>Nhập mã phòng bếp</h1>
        <p className="muted">Bếp trưởng mở phòng và đọc cho bạn mã 6 ký tự (hoặc bạn quét mã QR).</p>
      </div>

      {err && <div className="err">{err}</div>}

      <label className="field">
        <span className="lbl">Mã phòng</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="VD: HJ65QE"
          style={{ letterSpacing: '0.2em', fontWeight: 600, textTransform: 'uppercase' }}
          maxLength={6}
        />
      </label>
      <label className="field">
        <span className="lbl">Tên của bạn</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="vd: Cô Ba" />
      </label>

      <div className="fab-bar"><div className="inner">
        <button className="btn big" disabled={busy || !code.trim() || !name.trim()} onClick={join}>
          {busy ? 'Đang vào phòng…' : 'Vào phòng bếp'}
        </button>
      </div></div>
    </div>
  );
}
