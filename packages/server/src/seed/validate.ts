/**
 * Kiểm tra tính toàn vẹn seed + chạy thử một mâm qua các engine.
 * Chạy: node --import tsx packages/server/src/seed/validate.ts
 */

import { buildShoppingList, schedule } from '@cookafeast/core';
import { catalog, loadCatalog } from '../catalog.js';
import { createMenuInstance, schedulerInputFor } from '../assemble.js';

const errors: string[] = [];
const warns: string[] = [];

function main() {
  const c = loadCatalog();
  const ingIds = new Set(c.ingredients.map((i) => i.id));
  const dishIds = new Set(c.dishes.map((d) => d.id));
  const recipeByDish = new Map(c.recipes.map((r) => [r.dishId, r]));
  const occIds = new Set(c.occasions.map((o) => o.id));

  // dish <-> recipe
  for (const d of c.dishes) {
    const r = recipeByDish.get(d.id);
    if (!r) errors.push(`Dish "${d.id}" thiếu recipe (dishId=${d.id})`);
    else if (r.id !== d.recipeId) warns.push(`Dish "${d.id}".recipeId=${d.recipeId} ≠ recipe.id=${r.id}`);
    if (d.roles.length === 0) warns.push(`Dish "${d.id}" không có roles`);
  }
  for (const r of c.recipes) {
    if (!dishIds.has(r.dishId)) errors.push(`Recipe "${r.id}" trỏ tới dishId không tồn tại: ${r.dishId}`);
    for (const ri of r.ingredients) {
      if (!ingIds.has(ri.ingredientId)) errors.push(`Recipe "${r.id}" dùng ingredient không tồn tại: ${ri.ingredientId}`);
    }
    const stepIds = new Set(r.steps.map((s) => s.id));
    for (const s of r.steps) {
      for (const p of s.predecessorIds) {
        if (!stepIds.has(p)) errors.push(`Recipe "${r.id}" step "${s.id}" predecessor không tồn tại: ${p}`);
      }
    }
    if (r.steps.length === 0) warns.push(`Recipe "${r.id}" không có bước nấu (sẽ không vào lịch)`);
  }
  // templates
  for (const t of c.menuTemplates) {
    if (!occIds.has(t.occasionId)) errors.push(`Template "${t.id}" trỏ occasion không tồn tại: ${t.occasionId}`);
    for (const s of t.slots) {
      if (s.anchorDishId && !dishIds.has(s.anchorDishId)) {
        errors.push(`Template "${t.id}" anchorDishId không tồn tại: ${s.anchorDishId}`);
      }
    }
  }
  // mỗi occasion nên có ≥1 template
  for (const o of c.occasions) {
    if (catalog.templatesFor(o.id).length === 0) warns.push(`Occasion "${o.id}" chưa có template`);
  }

  console.log('\n=== TOÀN VẸN SEED ===');
  console.log(`Lỗi: ${errors.length}, Cảnh báo: ${warns.length}`);
  errors.slice(0, 40).forEach((e) => console.log('  ❌ ' + e));
  warns.slice(0, 25).forEach((w) => console.log('  ⚠️  ' + w));

  // chạy thử một mâm: chọn dịp giỗ đầu tiên
  const gio = c.occasions.find((o) => o.group === 'GIO') ?? c.occasions[0];
  if (gio) {
    console.log(`\n=== CHẠY THỬ MÂM: ${gio.name} (6 người, miền Bắc) ===`);
    const serveAt = Date.now() + 5 * 3600_000;
    const menu = createMenuInstance({
      occasionId: gio.id, region: 'BAC', mamType: 'MAN', serveAt,
      scaling: { perTray: 6, scaleMode: 'ROUND_UP', guestCount: 6 },
    });
    console.log(`Món (${menu.dishes.length}): ${menu.dishes.map((d) => d.dishName).join(', ') || '(trống)'}`);

    const shopping = buildShoppingList(menu, catalog.ingredientMap());
    console.log(`Đi chợ: ${shopping.items.length} mục${shopping.totalEstCost ? `, ~${shopping.totalEstCost}đ` : ''}`);

    const sched = schedule(schedulerInputFor(menu, { numPeople: 2 }));
    console.log(`Lịch: ${sched.tasks.length} bước, kịp giờ: ${sched.feasible ? 'CÓ' : 'KHÔNG'}, ` +
      `vào bếp lúc ${new Date(sched.earliestStartOverall).toLocaleTimeString('vi-VN')}`);
    console.log(`Cảnh báo lịch: ${sched.warnings.length}`);
    sched.warnings.slice(0, 5).forEach((w) => console.log(`  [${w.level}] ${w.message}`));
    if (menu.dishes.length === 0) errors.push('Generator không sinh được món nào cho mâm giỗ — kiểm tra template/dish region.');
    if (sched.tasks.length === 0) warns.push('Lịch rỗng — các recipe có thể thiếu steps.');
  }

  console.log('');
  if (errors.length) {
    console.error(`THẤT BẠI: ${errors.length} lỗi toàn vẹn.`);
    process.exit(1);
  }
  console.log('✓ Seed hợp lệ.');
}

main();
