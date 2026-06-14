/** Bối cảnh nấu (số người phụ bếp, giờ vào bếp) lưu cục bộ theo từng mâm. */
export interface CookContext {
  numPeople: number;
  availableFrom?: number;
}

const key = (menuId: string) => `cookafeast.ctx.${menuId}`;

export function getCookCtx(menuId: string): CookContext {
  try {
    const raw = localStorage.getItem(key(menuId));
    if (raw) return JSON.parse(raw) as CookContext;
  } catch {
    /* ignore */
  }
  return { numPeople: 1 };
}

export function setCookCtx(menuId: string, ctx: CookContext): void {
  localStorage.setItem(key(menuId), JSON.stringify(ctx));
}
