/** Repo tầng linh hồn: ghi chú công thức, tưởng nhớ, văn khấn điền sẵn, nhật ký dịp (Phase 6). */

import { randomUUID } from 'node:crypto';
import type { OccasionDiary, RecipeNote, Remembrance, RitualFamilyConfig } from '@cookafeast/core';
import { getDb } from './db.js';

const RITUAL_CONFIG_ID = 'ritual-config';

function rows(type: string, ref?: string): { id: string; data: string; created_at: number }[] {
  const db = getDb();
  return ref != null
    ? (db.prepare('SELECT id, data, created_at FROM family_memory WHERE type = ? AND ref = ? ORDER BY created_at DESC').all(type, ref) as never)
    : (db.prepare('SELECT id, data, created_at FROM family_memory WHERE type = ? ORDER BY created_at DESC').all(type) as never);
}

function save(id: string, type: string, ref: string | null, data: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO family_memory (id, data, created_at, type, ref) VALUES (@id, @data, @created, @type, @ref)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    )
    .run({ id, data: JSON.stringify(data), created: Date.now(), type, ref });
}

export const memoryRepo = {
  // ── ghi chú công thức theo món ──
  recipeNotes(dishId: string): RecipeNote[] {
    return rows('recipe_note', dishId).map((r) => ({ ...(JSON.parse(r.data) as RecipeNote), id: r.id, createdAt: r.created_at }));
  },
  addRecipeNote(dishId: string, text: string): RecipeNote {
    const note: RecipeNote = { id: randomUUID(), dishId, text, createdAt: Date.now() };
    save(note.id, 'recipe_note', dishId, note);
    return note;
  },

  // ── góc tưởng nhớ ──
  remembrances(): Remembrance[] {
    return rows('remembrance').map((r) => ({ ...(JSON.parse(r.data) as Remembrance), id: r.id, createdAt: r.created_at }));
  },
  addRemembrance(r: Omit<Remembrance, 'id' | 'createdAt'>): Remembrance {
    const rem: Remembrance = { ...r, id: randomUUID(), createdAt: Date.now() };
    save(rem.id, 'remembrance', null, rem);
    return rem;
  },

  // ── văn khấn điền sẵn (singleton) ──
  ritualConfig(): RitualFamilyConfig {
    const row = getDb().prepare('SELECT data FROM family_memory WHERE id = ?').get(RITUAL_CONFIG_ID) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as RitualFamilyConfig) : {};
  },
  saveRitualConfig(cfg: RitualFamilyConfig): RitualFamilyConfig {
    save(RITUAL_CONFIG_ID, 'ritual_config', null, cfg);
    return cfg;
  },

  // ── nhật ký dịp ──
  diaries(): OccasionDiary[] {
    return rows('diary').map((r) => ({ ...(JSON.parse(r.data) as OccasionDiary), id: r.id, createdAt: r.created_at }));
  },
  addDiary(d: Omit<OccasionDiary, 'id' | 'createdAt'>): OccasionDiary {
    const diary: OccasionDiary = { ...d, id: randomUUID(), createdAt: Date.now() };
    save(diary.id, 'diary', d.occasionId ?? null, diary);
    return diary;
  },

  remove(id: string): void {
    getDb().prepare('DELETE FROM family_memory WHERE id = ?').run(id);
  },
};
