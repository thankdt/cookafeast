import { useEffect, useState } from 'react';
import type { Dish, Recipe, RecipeNote } from '@cookafeast/core';
import type { Nav } from '../App.tsx';
import { api } from '../api.ts';
import { StepGuide } from '../components/StepGuide.tsx';

const DIFF_LABEL = ['', 'dễ', 'vừa', 'khó'];

export function RecipeDetail({ nav }: { nav: Nav }) {
  const [data, setData] = useState<{ dish: Dish; recipe: Recipe | null } | null>(null);
  const [notes, setNotes] = useState<RecipeNote[]>([]);
  const [draft, setDraft] = useState('');
  const [explain, setExplain] = useState('');
  const [explaining, setExplaining] = useState(false);
  const [err, setErr] = useState('');
  const dishId = nav.param;

  async function askWhy() {
    if (!dishId) return;
    setExplaining(true);
    try {
      const r = await api.explainDish(dishId);
      setExplain(r.text);
    } catch { /* ignore */ } finally { setExplaining(false); }
  }

  useEffect(() => {
    if (!dishId) return;
    api.dish(dishId).then(setData).catch((e) => setErr(e.message));
    api.recipeNotes(dishId).then(setNotes).catch(() => {});
  }, [dishId]);

  async function addNote() {
    if (!dishId || !draft.trim()) return;
    const n = await api.addRecipeNote(dishId, draft.trim());
    setNotes((prev) => [n, ...prev]);
    setDraft('');
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="back" onClick={() => nav.go('menu')}>‹ Thực đơn</button>
        <div className="spacer" />
        <span className="brand">Công thức</span>
      </div>

      {err && <div className="err">{err}</div>}
      {!data && !err && <div className="loading">Đang tải…</div>}

      {data && (
        <>
          <h1>{data.dish.name}</h1>
          <p className="muted small">
            Độ khó: {DIFF_LABEL[data.dish.difficulty]}
            {data.dish.makeAheadMinutes > 0 && ' · làm trước được'}
            {data.dish.isNearServe && ' · nên nấu sát giờ'}
          </p>
          {explain ? (
            <div className="card flat" style={{ background: '#faf6ee' }}><p style={{ margin: 0 }}>💬 {explain}</p></div>
          ) : (
            <button className="btn ghost small" onClick={askWhy} disabled={explaining}>
              {explaining ? 'Đang hỏi…' : '💬 Vì sao nên có món này?'}
            </button>
          )}

          {data.recipe && data.recipe.ingredients.length > 0 && (
            <div className="card">
              <p className="kicker">Nguyên liệu (cho 1 người — app tự nhân theo số mâm)</p>
              {data.recipe.ingredients.map((ri, i) => (
                <div className="dish" key={i} style={{ padding: '8px 0' }}>
                  <span className="grow">{ri.ingredientId.replace(/_/g, ' ')}</span>
                  <span className="muted small">{ri.note ?? ''}</span>
                </div>
              ))}
            </div>
          )}

          <p className="kicker">Các bước</p>
          {data.recipe?.steps.map((s, i) => (
            <div className="card" key={s.id}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span className="ritual-step-n">{s.emoji ?? i + 1}</span>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{s.text}</div>
                  <div className="muted small">
                    {s.activeMin > 0 && `~${s.activeMin} phút làm`}
                    {s.passiveMin > 0 && ` · ${s.passiveMin} phút chờ`}
                    {s.difficulty && ` · ${DIFF_LABEL[s.difficulty]}`}
                  </div>
                </div>
              </div>
              <StepGuide step={s} />
            </div>
          ))}
          {data.recipe?.tips && data.recipe.tips.length > 0 && (
            <div className="card warm">
              <p className="kicker">Mẹo của cả món</p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {data.recipe.tips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}

          <div className="card warm">
            <p className="kicker">Sổ tay nhà mình</p>
            <p className="muted small" style={{ marginTop: 0 }}>
              Ghi lại cách nhà mình hay nấu món này — "mẹ hay cho thêm…", "bố thích đậm hơn…" — để giữ lại cho sau này.
            </p>
            {notes.map((n) => (
              <div key={n.id} className="dish" style={{ padding: '8px 0' }}>
                <span className="grow">📝 {n.text}</span>
              </div>
            ))}
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Thêm một ghi chú gia đình…" />
              <button className="btn secondary small" disabled={!draft.trim()} onClick={addNote}>Lưu</button>
            </div>
          </div>

          <div className="fab-bar">
            <div className="inner">
              <button className="btn" onClick={() => nav.go('menu', nav.menuId ?? undefined)}>Về thực đơn</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
