/**
 * Builder danh sách đi chợ.
 *
 * Ba bước (docs/DESIGN.md §2a):
 *  1) explode mỗi món ra dòng nguyên liệu đã scale (theo baseUnit);
 *  2) GỘP theo ingredientId (cộng dồn ở mức baseUnit);
 *  3) quy về đơn vị mua + làm tròn purchaseStep MỘT LẦN ở cuối.
 *
 * Kết quả nhóm theo quầy chợ thực tế, đẩy mục ĐỒ THỜ/VÀNG MÃ lên cuối-nổi-bật.
 */

import type {
  Ingredient,
  MenuInstance,
  MarketSection,
  ShoppingItem,
  ShoppingList,
} from './domain.js';
import { roundTo, scaleLineBase, toPurchaseQty } from './scaling.js';

/** Thứ tự quầy khi hiển thị (đồ thờ/vàng mã để cuối cho nổi bật, dễ nhớ). */
export const MARKET_SECTION_ORDER: MarketSection[] = [
  'THIT_CA',
  'RAU_CU',
  'DO_KHO_GIA_VI',
  'DO_THO_VANG_MA',
];

export const MARKET_SECTION_LABEL: Record<MarketSection, string> = {
  THIT_CA: 'Thịt / Cá',
  RAU_CU: 'Rau củ',
  DO_KHO_GIA_VI: 'Đồ khô & gia vị',
  DO_THO_VANG_MA: 'Đồ thờ & vàng mã',
};

interface Accum {
  baseQty: number;
  usedBy: Set<string>;
}

/**
 * Sinh danh sách đi chợ cho một MenuInstance.
 * @param menu  mâm cụ thể đã chốt (có recipeSnapshot trong từng món)
 * @param ingredientById  tra cứu nguyên liệu trong thư viện
 */
export function buildShoppingList(
  menu: MenuInstance,
  ingredientById: Map<string, Ingredient>,
): ShoppingList {
  const persons = menu.scaling.persons;
  const bufferType = menu.scaling.bufferType;
  const acc = new Map<string, Accum>();

  // (1)+(2): explode & gộp theo baseUnit
  for (const mid of menu.dishes) {
    for (const ri of mid.recipeSnapshot.ingredients) {
      const ing = ingredientById.get(ri.ingredientId);
      if (!ing) continue; // nguyên liệu thiếu trong thư viện — bỏ qua an toàn
      const qty = scaleLineBase(ri, ing, persons, bufferType);
      const cur = acc.get(ri.ingredientId) ?? { baseQty: 0, usedBy: new Set() };
      cur.baseQty += qty;
      cur.usedBy.add(mid.dishName);
      acc.set(ri.ingredientId, cur);
    }
  }

  // (3): quy đổi đơn vị mua + làm tròn purchaseStep một lần
  const items: ShoppingItem[] = [];
  let totalEstCost = 0;
  let hasCost = false;

  for (const [ingredientId, a] of acc) {
    const ing = ingredientById.get(ingredientId)!;
    const baseQty = roundTo(a.baseQty);
    const purchaseQty = toPurchaseQty(baseQty, ing);
    let estCost: number | undefined;
    if (ing.unitPrice != null) {
      estCost = roundTo(purchaseQty * ing.unitPrice, 0);
      totalEstCost += estCost;
      hasCost = true;
    }
    items.push({
      ingredientId,
      name: ing.name,
      marketSection: ing.marketSection,
      baseQty,
      baseUnit: ing.baseUnit,
      purchaseQty,
      purchaseUnit: ing.purchaseUnit,
      estCost,
      usedBy: [...a.usedBy].sort(),
      checked: false,
    });
  }

  // Sắp xếp theo quầy (đúng thứ tự đi chợ), trong quầy sắp theo tên.
  const sectionRank = new Map(MARKET_SECTION_ORDER.map((s, i) => [s, i]));
  items.sort((x, y) => {
    const rx = sectionRank.get(x.marketSection) ?? 99;
    const ry = sectionRank.get(y.marketSection) ?? 99;
    if (rx !== ry) return rx - ry;
    return x.name.localeCompare(y.name, 'vi');
  });

  return {
    menuInstanceId: menu.id,
    items,
    totalEstCost: hasCost ? roundTo(totalEstCost, 0) : undefined,
  };
}

/** Gom danh sách đi chợ theo quầy để hiển thị (giữ đúng thứ tự MARKET_SECTION_ORDER). */
export function groupBySection(
  list: ShoppingList,
): { section: MarketSection; label: string; items: ShoppingItem[] }[] {
  return MARKET_SECTION_ORDER.map((section) => ({
    section,
    label: MARKET_SECTION_LABEL[section],
    items: list.items.filter((i) => i.marketSection === section),
  })).filter((g) => g.items.length > 0);
}
