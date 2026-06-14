import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Nav } from '../App.tsx';
import { api } from '../api.ts';
import { useSession } from '../sessionCtx.tsx';

const NAME_KEY = 'cookafeast.myName';

export function Lobby({ nav }: { nav: Nav }) {
  const s = useSession();
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [qr, setQr] = useState<string>('');
  const [joinUrl, setJoinUrl] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // khi đã có phiên → dựng URL + QR mời người nhà
  useEffect(() => {
    if (!s.session) return;
    api.netinfo()
      .then(({ lanUrl }) => {
        const url = `${lanUrl}/?join=${s.session!.roomCode}`;
        setJoinUrl(url);
        return QRCode.toDataURL(url, { margin: 1, width: 240 });
      })
      .then(setQr)
      .catch(() => { /* QR là phụ */ });
  }, [s.session]);

  async function open() {
    if (!nav.menuId || !name.trim()) return;
    setBusy(true); setErr('');
    try {
      localStorage.setItem(NAME_KEY, name.trim());
      await s.startSession(nav.menuId, { name: name.trim() });
    } catch (e) {
      setErr((e as Error).message); setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="back" onClick={() => nav.go('hub')}>‹ Tổng quan</button>
        <div className="spacer" />
        <span className="brand">Phòng bếp</span>
      </div>

      {err && <div className="err">{err}</div>}

      {!s.session ? (
        <>
          <h1>Nấu cùng cả nhà</h1>
          <p className="muted">Mở một "phòng bếp" để người nhà quét mã tham gia, mỗi người nhận một phần việc.</p>
          <label className="field">
            <span className="lbl">Tên của bạn (bếp trưởng)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="vd: Anh Cả" />
          </label>
          <div className="fab-bar"><div className="inner">
            <button className="btn big" disabled={busy || !name.trim()} onClick={open}>
              {busy ? 'Đang mở phòng…' : 'Mở phòng bếp'}
            </button>
          </div></div>
        </>
      ) : (
        <>
          <div className="card warm center">
            <p className="kicker">Mã phòng</p>
            <div className="bignum" style={{ letterSpacing: '0.15em' }}>{s.session.roomCode}</div>
            {qr && <img src={qr} alt="QR tham gia" style={{ width: 200, height: 200, marginTop: 8 }} />}
            <p className="muted small" style={{ marginTop: 8 }}>
              Người nhà cùng wifi quét mã, hoặc mở <b>{joinUrl || '…'}</b>, hoặc vào app bấm "Tham gia" rồi nhập mã.
            </p>
            <p className="small" style={{ color: s.connected ? 'var(--ok)' : 'var(--warn)' }}>
              {s.connected ? '● Đã kết nối' : '○ Đang kết nối…'}
            </p>
          </div>

          <p className="kicker">Thành viên ({s.members.length})</p>
          <div className="card">
            {s.members.map((m) => (
              <div className="dish" key={m.id} style={{ padding: '8px 0' }}>
                <span className={`dot-online ${m.isOnline ? 'on' : ''}`} />
                <span className="grow" style={{ fontWeight: 500 }}>{m.name}</span>
                {m.role === 'HOST' && <span className="badge req">bếp trưởng</span>}
              </div>
            ))}
          </div>

          <div className="fab-bar"><div className="inner">
            <button className="btn big" onClick={() => nav.go('cook', nav.menuId ?? undefined)}>Bắt đầu nấu →</button>
          </div></div>
        </>
      )}
    </div>
  );
}
