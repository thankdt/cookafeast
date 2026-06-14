/**
 * Engine quy đổi khẩu phần (scaling).
 *
 * Nguyên tắc vàng (docs/DESIGN.md §3.3): mọi tính toán bám theo `persons`
 * (1 phần = 1 người ăn). "Mâm" chỉ là lớp hiển thị. Thứ tự áp hệ số:
 *   persons → DISCRETE giữ nguyên (làm tròn ở khâu mua) → CONTINUOUS nhân buffer
 *   → SEASONING lũy thừa 0.85. Quy đổi đơn vị mua + làm tròn purchaseStep MỘT LẦN
 *   ở cuối (trong shopping.ts), sau khi đã gộp các dòng trùng.
 */

import type {
  EventBufferType,
  Ingredient,
  RecipeIngredient,
  ScaleMode,
  ScalingProfile,
} from './domain.js';

const EPS = 1e-9;

/** Hệ số dự phòng theo tính chất sự kiện (cỗ trang trọng nấu dư hơn). */
export const BUFFER_MULTIPLIER: Record<EventBufferType, number> = {
  TRANG_TRONG: 1.15,
  GIA_DINH: 1.05,
  VUA_DU: 1.0,
};

/** Số mũ dưới-tuyến-tính cho gia vị (mẻ lớn cần ít gia vị tương đối hơn). */
export const SEASONING_EXPONENT = 0.85;

export interface ScalingInput {
  /** Số người / 1 mâm (mặc định 6). */
  perTray: number;
  scaleMode: ScaleMode;
  bufferType: EventBufferType;
  /** Nhập theo số mâm... */
  trays?: number;
  /** ...hoặc theo số khách (đúng một trong hai). */
  guestCount?: number;
}

function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step - EPS) * step;
}

function roundTo(value: number, decimals = 3): number {
  const f = Math.pow(10, decimals);
  return Math.round((value + EPS) * f) / f;
}

/**
 * Tính ScalingProfile từ đầu vào người dùng.
 * - ROUND_UP: làm tròn lên trọn mâm (mặc định cỗ trang trọng).
 * - EXACT: nấu vừa đủ số người.
 * - HYBRID: nấu vừa đủ số người nhưng hiển thị "X mâm + Y lẻ".
 */
export function computeScaling(input: ScalingInput): ScalingProfile {
  const perTray = input.perTray > 0 ? input.perTray : 6;
  if (input.trays == null && input.guestCount == null) {
    throw new Error('computeScaling: cần nhập trays hoặc guestCount');
  }
  const rawPersons =
    input.trays != null ? input.trays * perTray : (input.guestCount as number);
  if (rawPersons <= 0) throw new Error('computeScaling: số người phải > 0');

  let persons: number;
  let fullTrays: number;
  let remainder: number;

  switch (input.scaleMode) {
    case 'ROUND_UP': {
      const traysNeeded = Math.ceil(rawPersons / perTray - EPS);
      persons = traysNeeded * perTray;
      fullTrays = traysNeeded;
      remainder = 0;
      break;
    }
    case 'EXACT':
    case 'HYBRID': {
      persons = rawPersons;
      fullTrays = Math.floor(rawPersons / perTray + EPS);
      remainder = rawPersons - fullTrays * perTray;
      break;
    }
    default: {
      const _exhaustive: never = input.scaleMode;
      throw new Error(`scaleMode không hợp lệ: ${String(_exhaustive)}`);
    }
  }

  return {
    perTray,
    trays: input.trays,
    guestCount: input.guestCount,
    scaleMode: input.scaleMode,
    bufferType: input.bufferType,
    persons,
    fullTrays,
    remainder,
  };
}

/**
 * Scale MỘT dòng nguyên liệu của công thức ra lượng theo baseUnit cho cả mâm.
 * KHÔNG quy đổi đơn vị mua, KHÔNG làm tròn purchaseStep ở đây — việc đó làm
 * một lần ở cuối sau khi gộp (xem buildShoppingList).
 */
export function scaleLineBase(
  ri: RecipeIngredient,
  ingredient: Ingredient,
  persons: number,
  bufferType: EventBufferType,
): number {
  if (ri.scales === false) {
    // Lượng cố định, không nhân theo số người (vd "1 nhúm để trang trí").
    return roundTo(ri.perPerson);
  }
  const buffer = BUFFER_MULTIPLIER[bufferType];
  switch (ingredient.divisibility) {
    case 'CONTINUOUS':
      return roundTo(ri.perPerson * persons * buffer);
    case 'SEASONING':
      // Dưới-tuyến-tính: gia vị không scale thẳng theo số người.
      return roundTo(ri.perPerson * Math.pow(persons, SEASONING_EXPONENT));
    case 'DISCRETE':
      // Không nhân buffer; việc làm tròn lên đơn vị mua (purchaseStep) đã là đệm.
      return roundTo(ri.perPerson * persons);
    default: {
      const _exhaustive: never = ingredient.divisibility;
      throw new Error(`divisibility không hợp lệ: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Quy đổi lượng baseUnit (đã gộp) sang lượng cần MUA theo purchaseUnit,
 * có tính hao hụt sơ chế (yield) và làm tròn lên theo purchaseStep.
 */
export function toPurchaseQty(baseQty: number, ingredient: Ingredient): number {
  const yieldRatio = ingredient.yield > 0 ? ingredient.yield : 1;
  const buyBase = baseQty / yieldRatio;
  const rawPurchase = buyBase / ingredient.unitConvert;
  const step = ingredient.purchaseStep > 0 ? ingredient.purchaseStep : 1;
  return roundTo(ceilTo(rawPurchase, step), 3);
}

export { roundTo, ceilTo };
