import type {
  CookSchedule,
  CookSession,
  Dish,
  LunarDate,
  MenuInstance,
  MenuSuggestion,
  MenuTemplate,
  Occasion,
  OccasionDiary,
  Recipe,
  RecipeNote,
  Remembrance,
  RitualFamilyConfig,
  ShoppingList,
  TaskAssignment,
} from '@cookafeast/core';

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Lỗi ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface CreateMenuPayload {
  occasionId: string;
  region: string;
  mamType: string;
  templateId?: string;
  serveAt: number;
  title?: string;
  scaling: {
    perTray?: number;
    scaleMode?: string;
    bufferType?: string;
    trays?: number;
    guestCount?: number;
  };
  dishIds?: string[];
  generateOptions?: { maxDifficulty?: number; preferMakeAhead?: boolean; recentDishIds?: string[] };
}

export const api = {
  netinfo: () => http<{ lanUrl: string; port: number }>('/api/netinfo'),
  occasions: () => http<Occasion[]>('/api/occasions'),
  occasion: (id: string) => http<{ occasion: Occasion; templates: MenuTemplate[] }>(`/api/occasions/${id}`),
  dishes: (region?: string, mamType?: string) => {
    const q = new URLSearchParams();
    if (region) q.set('region', region);
    if (mamType) q.set('mamType', mamType);
    return http<Dish[]>(`/api/dishes?${q}`);
  },
  dish: (id: string) => http<{ dish: Dish; recipe: Recipe | null }>(`/api/dishes/${id}`),

  createMenu: (payload: CreateMenuPayload) =>
    http<MenuInstance>('/api/menus', { method: 'POST', body: JSON.stringify(payload) }),
  menus: () => http<MenuInstance[]>('/api/menus'),
  menu: (id: string) => http<MenuInstance>(`/api/menus/${id}`),
  updateDishes: (id: string, dishIds: string[]) =>
    http<MenuInstance>(`/api/menus/${id}/dishes`, { method: 'PUT', body: JSON.stringify({ dishIds }) }),
  deleteMenu: (id: string) => http<{ ok: boolean }>(`/api/menus/${id}`, { method: 'DELETE' }),
  shopping: (id: string) => http<ShoppingList>(`/api/menus/${id}/shopping`),
  schedule: (id: string, body: { numPeople?: number; availableFrom?: number }) =>
    http<CookSchedule>(`/api/menus/${id}/schedule`, { method: 'POST', body: JSON.stringify(body) }),
  cookStates: (id: string) => http<TaskAssignment[]>(`/api/menus/${id}/cook`),
  setTask: (id: string, taskId: string, patch: { status?: string; progress?: number; personId?: string }) =>
    http<TaskAssignment>(`/api/menus/${id}/cook/${encodeURIComponent(taskId)}`, {
      method: 'POST',
      body: JSON.stringify(patch),
    }),

  // cộng tác (Phase 2)
  createSession: (menuId: string) => http<CookSession>(`/api/menus/${menuId}/session`, { method: 'POST' }),
  sessionByRoom: (code: string) => http<CookSession>(`/api/sessions/by-room/${encodeURIComponent(code)}`),
  session: (id: string) => http<CookSession>(`/api/sessions/${id}`),

  // tầng linh hồn (Phase 6)
  recipeNotes: (dishId: string) => http<RecipeNote[]>(`/api/dishes/${dishId}/notes`),
  addRecipeNote: (dishId: string, text: string) =>
    http<RecipeNote>(`/api/dishes/${dishId}/notes`, { method: 'POST', body: JSON.stringify({ text }) }),
  remembrances: () => http<Remembrance[]>('/api/family/remembrances'),
  addRemembrance: (r: Omit<Remembrance, 'id' | 'createdAt'>) =>
    http<Remembrance>('/api/family/remembrances', { method: 'POST', body: JSON.stringify(r) }),
  ritualConfig: () => http<RitualFamilyConfig>('/api/family/ritual-config'),
  saveRitualConfig: (cfg: RitualFamilyConfig) =>
    http<RitualFamilyConfig>('/api/family/ritual-config', { method: 'PUT', body: JSON.stringify(cfg) }),
  diaries: () => http<OccasionDiary[]>('/api/family/diary'),
  addDiary: (d: Omit<OccasionDiary, 'id' | 'createdAt'>) =>
    http<OccasionDiary>('/api/family/diary', { method: 'POST', body: JSON.stringify(d) }),
  deleteMemory: (id: string) => http<{ ok: boolean }>(`/api/family/memory/${id}`, { method: 'DELETE' }),
  lunar: (at?: number) => http<LunarDate>(`/api/lunar${at ? `?at=${at}` : ''}`),

  // gợi ý AI (Phase 5)
  suggestMenu: (text: string) =>
    http<MenuSuggestion>('/api/suggest/menu', { method: 'POST', body: JSON.stringify({ text }) }),
  explainDish: (dishId: string, occasionId?: string) =>
    http<{ text: string }>(`/api/dishes/${dishId}/explain`, { method: 'POST', body: JSON.stringify({ occasionId }) }),
};
