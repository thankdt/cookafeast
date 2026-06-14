/**
 * Lắp ráp dữ liệu: nối catalog + engine (generator/scaling/scheduler) thành
 * MenuInstance cụ thể và đầu vào cho scheduler.
 */

import { randomUUID } from 'node:crypto';
import {
  computeScaling,
  generateMenu,
  type GenerateOptions,
  type KitchenResource,
  type MamType,
  type MenuInstance,
  type MenuInstanceDish,
  type MenuTemplate,
  type Person,
  type Recipe,
  type Region,
  type ScaleMode,
  type EventBufferType,
  type SchedulerDishInput,
  type SchedulerInput,
} from '@cookafeast/core';
import { catalog } from './catalog.js';

export interface CreateMenuInput {
  occasionId: string;
  region: Region;
  mamType: MamType;
  templateId?: string;
  serveAt: number;
  title?: string;
  scaling: {
    perTray?: number;
    scaleMode?: ScaleMode;
    bufferType?: EventBufferType;
    trays?: number;
    guestCount?: number;
  };
  /** Nếu truyền dishIds thì dùng đúng các món này; nếu không, generator tự ghép mâm. */
  dishIds?: string[];
  generateOptions?: GenerateOptions;
}

const EMPTY_RECIPE = (dishId: string): Recipe => ({
  id: `r_${dishId}`,
  dishId,
  ingredients: [],
  steps: [],
});

function snapshotDish(dishId: string, required: boolean): MenuInstanceDish | null {
  const dish = catalog.dish(dishId);
  if (!dish) return null;
  const recipe = catalog.recipeForDish(dishId) ?? EMPTY_RECIPE(dishId);
  return {
    id: randomUUID(),
    dishId,
    dishName: dish.name,
    recipeSnapshot: structuredClone(recipe),
    required,
    trayGroup: dish.mamType.includes('CHAY') && !dish.mamType.includes('MAN') ? 'CHAY' : 'TRONG_NHA',
  };
}

/** Tạo MenuInstance từ input. Tự chọn template + generator nếu không truyền dishIds. */
export function createMenuInstance(input: CreateMenuInput): MenuInstance {
  const occasion = catalog.occasion(input.occasionId);
  const scaling = computeScaling({
    perTray: input.scaling.perTray ?? 6,
    scaleMode: input.scaling.scaleMode ?? 'ROUND_UP',
    bufferType: input.scaling.bufferType ?? occasion?.defaultBufferType ?? 'GIA_DINH',
    trays: input.scaling.trays,
    guestCount: input.scaling.guestCount,
  });

  let dishes: MenuInstanceDish[] = [];

  if (input.dishIds && input.dishIds.length) {
    dishes = input.dishIds
      .map((id) => snapshotDish(id, false))
      .filter((d): d is MenuInstanceDish => d != null);
  } else {
    const template = pickTemplate(input);
    if (template) {
      const gen = generateMenu(template, catalog.dishesFor(input.region, input.mamType), input.generateOptions ?? {});
      dishes = gen.choices
        .map((c) => snapshotDish(c.dishId, c.required))
        .filter((d): d is MenuInstanceDish => d != null);
    }
  }

  return {
    id: randomUUID(),
    occasionId: input.occasionId,
    region: input.region,
    mamType: input.mamType,
    serveAt: input.serveAt,
    scaling,
    dishes,
    createdAt: Date.now(),
    title: input.title,
  };
}

/** Thay toàn bộ danh sách món của một mâm (giữ nguyên id, scaling, giờ cúng). */
export function setMenuDishes(menu: MenuInstance, dishIds: string[]): MenuInstance {
  const existingRequired = new Set(menu.dishes.filter((d) => d.required).map((d) => d.dishId));
  const dishes = dishIds
    .map((id) => snapshotDish(id, existingRequired.has(id)))
    .filter((d): d is MenuInstanceDish => d != null);
  return { ...menu, dishes };
}

export function pickTemplate(input: CreateMenuInput): MenuTemplate | undefined {
  if (input.templateId) return catalog.template(input.templateId);
  const templates = catalog.templatesFor(input.occasionId);
  return (
    templates.find((t) => t.region === input.region && t.mamType === input.mamType) ??
    templates.find((t) => t.region === input.region) ??
    templates[0]
  );
}

/** Mặc định tài nguyên bếp gia đình (1 bếp đôi = 2 mặt, 1 lò, 1 hấp, 1 nồi ninh, 1 chảo, 1 nồi cơm). */
export const DEFAULT_RESOURCES: KitchenResource[] = [
  { machine: 'BEP', count: 2 },
  { machine: 'LO', count: 1 },
  { machine: 'HAP', count: 1 },
  { machine: 'NOI_NINH', count: 1 },
  { machine: 'CHAO_CHIEN', count: 1 },
  { machine: 'NOI_COM', count: 1 },
];

export function schedulerInputFor(
  menu: MenuInstance,
  opts: {
    numPeople?: number;
    resources?: KitchenResource[];
    availableFrom?: number;
    now?: number;
    doneTaskIds?: string[];
    people?: Person[];
  } = {},
): SchedulerInput {
  const dishes: SchedulerDishInput[] = menu.dishes
    .filter((d) => d.recipeSnapshot.steps.length > 0)
    .map((d) => ({
      instanceId: d.id,
      dishId: d.dishId,
      dishName: d.dishName,
      steps: d.recipeSnapshot.steps,
    }));
  return {
    serveAt: menu.serveAt,
    dishes,
    numPeople: opts.numPeople ?? (opts.people?.length || 1),
    resources: opts.resources ?? DEFAULT_RESOURCES,
    availableFrom: opts.availableFrom,
    now: opts.now,
    doneTaskIds: opts.doneTaskIds,
    people: opts.people,
  };
}
