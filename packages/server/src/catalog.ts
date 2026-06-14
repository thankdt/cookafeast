/**
 * Load catalog (dữ liệu seed read-only) từ data/seed/*.json vào bộ nhớ.
 * Cung cấp các hàm tra cứu cho routes.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Catalog,
  Dish,
  Ingredient,
  MenuTemplate,
  Occasion,
  Recipe,
  Region,
  MamType,
} from '@cookafeast/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
// data/seed nằm ở gốc repo: packages/server/src -> ../../../data/seed
const SEED_DIR = process.env.COOKAFEAST_SEED ?? join(__dirname, '..', '..', '..', 'data', 'seed');

function loadJson<T>(file: string, fallback: T): T {
  const p = join(SEED_DIR, file);
  if (!existsSync(p)) {
    console.warn(`[catalog] thiếu file seed: ${p} — dùng rỗng`);
    return fallback;
  }
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

let _catalog: Catalog | null = null;
let _index: {
  dishById: Map<string, Dish>;
  recipeByDishId: Map<string, Recipe>;
  ingredientById: Map<string, Ingredient>;
  occasionById: Map<string, Occasion>;
  templatesByOccasion: Map<string, MenuTemplate[]>;
} | null = null;

export function loadCatalog(): Catalog {
  if (_catalog) return _catalog;
  _catalog = {
    occasions: loadJson<Occasion[]>('occasions.json', []),
    dishes: loadJson<Dish[]>('dishes.json', []),
    recipes: loadJson<Recipe[]>('recipes.json', []),
    ingredients: loadJson<Ingredient[]>('ingredients.json', []),
    menuTemplates: loadJson<MenuTemplate[]>('menu-templates.json', []),
  };
  _index = {
    dishById: new Map(_catalog.dishes.map((d) => [d.id, d])),
    recipeByDishId: new Map(_catalog.recipes.map((r) => [r.dishId, r])),
    ingredientById: new Map(_catalog.ingredients.map((i) => [i.id, i])),
    occasionById: new Map(_catalog.occasions.map((o) => [o.id, o])),
    templatesByOccasion: groupBy(_catalog.menuTemplates, (t) => t.occasionId),
  };
  console.log(
    `[catalog] đã nạp: ${_catalog.occasions.length} dịp, ${_catalog.dishes.length} món, ` +
      `${_catalog.recipes.length} công thức, ${_catalog.ingredients.length} nguyên liệu, ` +
      `${_catalog.menuTemplates.length} khung mâm`,
  );
  return _catalog;
}

function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    const list = m.get(k);
    if (list) list.push(item);
    else m.set(k, [item]);
  }
  return m;
}

function idx() {
  if (!_index) loadCatalog();
  return _index!;
}

export const catalog = {
  all: () => loadCatalog(),
  occasions: () => loadCatalog().occasions,
  occasion: (id: string) => idx().occasionById.get(id),
  templatesFor: (occasionId: string) => idx().templatesByOccasion.get(occasionId) ?? [],
  template: (id: string) => loadCatalog().menuTemplates.find((t) => t.id === id),
  dish: (id: string) => idx().dishById.get(id),
  recipeForDish: (dishId: string) => idx().recipeByDishId.get(dishId),
  ingredient: (id: string) => idx().ingredientById.get(id),
  ingredientMap: () => idx().ingredientById,
  dishesFor: (region?: Region, mamType?: MamType) =>
    loadCatalog().dishes.filter(
      (d) =>
        (!region || d.region.includes(region)) && (!mamType || d.mamType.includes(mamType)),
    ),
};
