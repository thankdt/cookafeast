/**
 * Engine gợi ý & ghép mâm cỗ cân đối (docs/DESIGN.md §2a).
 *
 * Triết lý: Greedy + Repair — KHÔNG tối ưu toàn cục, đổi lại nhanh (<50ms) và
 * GIẢI THÍCH ĐƯỢC ("vì sao món này"). Đặt món neo bắt buộc trước, rồi lấp slot
 * còn lại bằng scoreDish = phù-hợp-vai-trò − phạt trùng nguyên liệu/cách chế biến
 * − phạt lặp dịp gần đây − phạt vượt kỹ năng + thưởng make-ahead khớp quỹ thời gian.
 */

import type { Dish, DishRole, MenuTemplate } from './domain.js';

export interface GenerateOptions {
  /** Người mới nấu → giới hạn độ khó tối đa. */
  maxDifficulty?: 1 | 2 | 3;
  /** Món đã nấu ở dịp gần đây (tránh lặp). */
  recentDishIds?: string[];
  /** Ít thời gian → ưu tiên món làm trước được, tránh món phải làm sát giờ. */
  preferMakeAhead?: boolean;
}

export interface MenuChoice {
  dishId: string;
  dishName: string;
  role: DishRole;
  required: boolean;
  /** Lời giải thích vì sao chọn món này (hiện cho người dùng). */
  reason: string;
  score: number;
}

export interface GeneratedMenu {
  templateId: string;
  choices: MenuChoice[];
  /** Các slot không tìm được món phù hợp (để UI báo nhẹ). */
  gaps: { role: DishRole; required: boolean }[];
}

const ROLE_LABEL: Record<DishRole, string> = {
  DAU_VI: 'khai vị',
  XAO: 'món xào',
  CANH: 'canh/bát',
  TINH_BOT: 'xôi/tinh bột',
  NOM_DUA: 'nộm/dưa',
  MON_CHINH: 'món chính',
  TRANG_MIENG: 'tráng miệng',
};

function scoreDish(
  dish: Dish,
  role: DishRole,
  chosen: Dish[],
  opts: GenerateOptions,
): { score: number; reason: string } {
  const reasons: string[] = [];
  let score = 5 + (dish.popularity ?? 0.5) * 10;

  if (dish.roles.includes(role)) {
    score += 10;
    reasons.push(`hợp vai trò ${ROLE_LABEL[role]}`);
  }

  // phạt trùng nguyên liệu chính với món đã chọn
  const chosenIngredients = new Set(chosen.flatMap((d) => d.mainIngredients));
  const dupIng = dish.mainIngredients.filter((i) => chosenIngredients.has(i));
  if (dupIng.length) score -= 3 * dupIng.length;

  // phạt trùng cách chế biến (mâm đỡ nhàm, đỡ tắc bếp)
  const chosenMethods = new Set(chosen.flatMap((d) => d.cookMethods));
  const dupMethod = dish.cookMethods.filter((m) => chosenMethods.has(m));
  if (dupMethod.length) score -= 2 * dupMethod.length;

  // tránh lặp món dịp gần đây
  if (opts.recentDishIds?.includes(dish.id)) {
    score -= 5;
    reasons.push('đổi mới so với lần trước');
  }

  // độ khó
  if (opts.maxDifficulty && dish.difficulty > opts.maxDifficulty) {
    score -= 8;
  } else if (dish.difficulty === 1) {
    reasons.push('dễ làm');
  }

  // quỹ thời gian
  if (opts.preferMakeAhead) {
    if (dish.makeAheadMinutes > 0) {
      score += 3;
      reasons.push('làm trước được');
    }
    if (dish.isNearServe) score -= 2;
  }

  const reason = reasons.length ? reasons.join(', ') : 'cân đối cho mâm';
  return { score, reason };
}

/**
 * Sinh thực đơn từ một khung mâm (MenuTemplate) + danh mục món.
 * Món bắt buộc/anchor được đặt trước; slot còn lại lấp bằng món điểm cao nhất.
 */
export function generateMenu(
  template: MenuTemplate,
  allDishes: Dish[],
  opts: GenerateOptions = {},
): GeneratedMenu {
  // ứng viên phải hợp vùng miền + loại mâm của template
  const candidates = allDishes.filter(
    (d) => d.region.includes(template.region) && d.mamType.includes(template.mamType),
  );
  const byId = new Map(candidates.map((d) => [d.id, d]));

  const chosen: Dish[] = [];
  const choices: MenuChoice[] = [];
  const gaps: { role: DishRole; required: boolean }[] = [];
  const usedIds = new Set<string>();

  // Xử lý slot theo thứ tự: anchor → required → optional (để món neo định hình mâm trước)
  const slots = [...template.slots].sort((a, b) => {
    const rank = (s: typeof a) => (s.anchorDishId ? 0 : s.required ? 1 : 2);
    return rank(a) - rank(b);
  });

  for (const slot of slots) {
    // món neo cố định
    if (slot.anchorDishId) {
      const d = byId.get(slot.anchorDishId);
      if (d && !usedIds.has(d.id)) {
        usedIds.add(d.id);
        chosen.push(d);
        choices.push({
          dishId: d.id,
          dishName: d.name,
          role: slot.role,
          required: true,
          reason: 'món truyền thống không thể thiếu của mâm này',
          score: 999,
        });
        continue;
      }
      // anchor thiếu trong thư viện → coi như slot thường, tìm thay thế
    }

    const pool = candidates.filter((d) => !usedIds.has(d.id) && d.roles.includes(slot.role));
    if (pool.length === 0) {
      gaps.push({ role: slot.role, required: slot.required });
      continue;
    }
    let best: { dish: Dish; score: number; reason: string } | null = null;
    for (const d of pool) {
      const { score, reason } = scoreDish(d, slot.role, chosen, opts);
      if (!best || score > best.score) best = { dish: d, score, reason };
    }
    if (best) {
      usedIds.add(best.dish.id);
      chosen.push(best.dish);
      choices.push({
        dishId: best.dish.id,
        dishName: best.dish.name,
        role: slot.role,
        required: slot.required,
        reason: best.reason,
        score: Math.round(best.score * 10) / 10,
      });
    }
  }

  return { templateId: template.id, choices, gaps };
}

/**
 * Gợi ý các món "thay thế tương đương" cho một món (cùng vai trò, cùng vùng/mâm),
 * sắp theo điểm phù hợp với phần còn lại của mâm.
 */
export function suggestSwaps(
  current: Dish,
  role: DishRole,
  allDishes: Dish[],
  template: MenuTemplate,
  rest: Dish[],
  opts: GenerateOptions = {},
  limit = 5,
): MenuChoice[] {
  return allDishes
    .filter(
      (d) =>
        d.id !== current.id &&
        d.roles.includes(role) &&
        d.region.includes(template.region) &&
        d.mamType.includes(template.mamType),
    )
    .map((d) => {
      const { score, reason } = scoreDish(d, role, rest, opts);
      return {
        dishId: d.id,
        dishName: d.name,
        role,
        required: false,
        reason,
        score: Math.round(score * 10) / 10,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
