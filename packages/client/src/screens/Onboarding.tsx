import { useEffect, useMemo, useState } from 'react';
import type { MamType, Occasion, Region } from '@cookafeast/core';
import type { Nav } from '../App.tsx';
import { api } from '../api.ts';
import { setCookCtx } from '../cookCtx.ts';
import { msToDtLocal, dtLocalToMs } from '../util.ts';

const REGION_LABEL: Record<Region, string> = { BAC: 'Miền Bắc', TRUNG: 'Miền Trung', NAM: 'Miền Nam' };
const MAM_LABEL: Record<MamType, string> = { MAN: 'Mâm mặn', CHAY: 'Mâm chay', CHUNG_SINH: 'Mâm chúng sinh' };
const GROUP_EMOJI: Record<string, string> = { TET: '🎍', GIO: '🕯️', RAM: '🌕', DOI_NGUOI: '🎎', LE_HOI: '🏮' };

// giờ cúng mặc định: 11:00 hôm nay
function defaultServeAt(): number {
  const d = new Date();
  d.setHours(11, 0, 0, 0);
  return d.getTime();
}

export function Onboarding({ nav }: { nav: Nav }) {
  const [step, setStep] = useState(0);
  const [occasions, setOccasions] = useState<Occasion[] | null>(null);
  const [occasionId, setOccasionId] = useState<string>('');
  const [region, setRegion] = useState<Region>('BAC');
  const [mamType, setMamType] = useState<MamType>('MAN');
  const [byTray, setByTray] = useState(false);
  const [count, setCount] = useState(6);
  const [perTray, setPerTray] = useState(6);
  const [numPeople, setNumPeople] = useState(1);
  const [serveAt, setServeAt] = useState(defaultServeAt());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.occasions().then(setOccasions).catch((e) => setErr(e.message));
  }, []);

  const occasion = useMemo(() => occasions?.find((o) => o.id === occasionId), [occasions, occasionId]);

  useEffect(() => {
    if (occasion) {
      setMamType(occasion.mamTypes[0] ?? 'MAN');
    }
  }, [occasion]);

  const steps = ['Dịp', 'Phong cách', 'Số lượng', 'Giờ cúng'];

  async function create() {
    setBusy(true);
    setErr('');
    try {
      const menu = await api.createMenu({
        occasionId,
        region,
        mamType,
        serveAt,
        title: occasion ? `${occasion.name}` : 'Mâm cỗ',
        scaling: byTray ? { perTray, trays: count } : { perTray, guestCount: count },
      });
      setCookCtx(menu.id, { numPeople });
      nav.go('hub', menu.id);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="back" onClick={() => (step === 0 ? nav.go('home') : setStep(step - 1))}>
          ‹ Quay lại
        </button>
        <div className="spacer" />
        <span className="muted small">{steps[step]}</span>
      </div>

      <div className="steps-strip">
        {steps.map((_, i) => (
          <div key={i} className={`dot ${i < step ? 'done' : i === step ? 'cur' : ''}`} />
        ))}
      </div>

      {err && <div className="err">{err}</div>}

      {step === 0 && (
        <>
          <h1>Bạn đang lo dịp gì?</h1>
          <p className="muted">Chọn dịp, tôi sẽ chuẩn bị sẵn mâm cỗ phù hợp với phong tục.</p>
          {occasions === null && <div className="loading">Đang tải…</div>}
          {occasions?.map((o) => (
            <button
              key={o.id}
              className={`choice ${occasionId === o.id ? 'sel' : ''}`}
              onClick={() => setOccasionId(o.id)}
            >
              <span className="em">{GROUP_EMOJI[o.group] ?? '🍲'}</span>
              <span className="grow">
                <div style={{ fontWeight: 600 }}>{o.name}</div>
                {o.lunarHint && <div className="sub">{o.lunarHint}</div>}
              </span>
            </button>
          ))}
          <div className="fab-bar">
            <div className="inner">
              <button className="btn big" disabled={!occasionId} onClick={() => setStep(1)}>
                Tiếp tục
              </button>
            </div>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h1>Mâm cỗ theo phong cách nào?</h1>
          <label className="field">
            <span className="lbl">Vùng miền</span>
            <div className="chips">
              {(['BAC', 'TRUNG', 'NAM'] as Region[]).map((r) => (
                <button key={r} className={`chip ${region === r ? 'sel' : ''}`} onClick={() => setRegion(r)}>
                  {REGION_LABEL[r]}
                </button>
              ))}
            </div>
          </label>
          <label className="field">
            <span className="lbl">Loại mâm</span>
            <div className="chips">
              {(occasion?.mamTypes ?? ['MAN']).map((m) => (
                <button key={m} className={`chip ${mamType === m ? 'sel' : ''}`} onClick={() => setMamType(m)}>
                  {MAM_LABEL[m]}
                </button>
              ))}
            </div>
          </label>
          {occasion?.regionNotes?.[region] && (
            <div className="card flat"><p className="muted small" style={{ margin: 0 }}>💡 {occasion.regionNotes[region]}</p></div>
          )}
          <div className="fab-bar">
            <div className="inner">
              <button className="btn big" onClick={() => setStep(2)}>Tiếp tục</button>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Bao nhiêu người ăn?</h1>
          <label className="field">
            <span className="lbl">Tính theo</span>
            <div className="chips">
              <button className={`chip ${!byTray ? 'sel' : ''}`} onClick={() => setByTray(false)}>Số người</button>
              <button className={`chip ${byTray ? 'sel' : ''}`} onClick={() => setByTray(true)}>Số mâm</button>
            </div>
          </label>
          <div className="row">
            <label className="field">
              <span className="lbl">{byTray ? 'Số mâm' : 'Số người'}</span>
              <input type="number" min={1} value={count} onChange={(e) => setCount(Math.max(1, +e.target.value))} />
            </label>
            <label className="field">
              <span className="lbl">Người / mâm</span>
              <input type="number" min={1} value={perTray} onChange={(e) => setPerTray(Math.max(1, +e.target.value))} />
            </label>
          </div>
          <label className="field">
            <span className="lbl">Mấy người cùng nấu? (gồm cả bạn)</span>
            <input type="number" min={1} value={numPeople} onChange={(e) => setNumPeople(Math.max(1, +e.target.value))} />
            <span className="muted small">Tôi sẽ chia việc và canh giờ dựa trên số người này.</span>
          </label>
          <div className="fab-bar">
            <div className="inner">
              <button className="btn big" onClick={() => setStep(3)}>Tiếp tục</button>
            </div>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h1>Mấy giờ dọn cỗ?</h1>
          <p className="muted">Đây là mốc tôi sẽ canh để mọi món xong đúng lúc, nóng sốt.</p>
          <label className="field">
            <span className="lbl">Ngày & giờ cúng</span>
            <input
              type="datetime-local"
              value={msToDtLocal(serveAt)}
              onChange={(e) => setServeAt(dtLocalToMs(e.target.value))}
            />
          </label>
          <div className="card warm">
            <p style={{ margin: 0 }}>Đã đủ rồi. Để tôi lo phần sắp xếp cho bạn.</p>
          </div>
          <div className="fab-bar">
            <div className="inner">
              <button className="btn big" disabled={busy} onClick={create}>
                {busy ? 'Đang chuẩn bị mâm cỗ…' : 'Dựng mâm cỗ giúp tôi'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
