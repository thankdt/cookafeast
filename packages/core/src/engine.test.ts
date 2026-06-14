import { describe, expect, it } from 'vitest';
import type {
  Dish,
  Ingredient,
  MenuInstance,
  MenuTemplate,
  Recipe,
  RecipeStep,
} from './domain.js';
import { computeScaling, scaleLineBase, toPurchaseQty } from './scaling.js';
import { buildShoppingList, groupBySection } from './shopping.js';
import { schedule, type SchedulerDishInput } from './scheduler.js';
import { generateMenu } from './generator.js';

const MIN = 60_000;
const T0 = 1_700_000_000_000; // mốc epoch cố định để test ổn định

// ───────────────────────────────────────────────── fixtures nguyên liệu
const ing = (over: Partial<Ingredient> & Pick<Ingredient, 'id' | 'name'>): Ingredient => ({
  divisibility: 'CONTINUOUS',
  baseUnit: 'g',
  purchaseUnit: 'kg',
  unitConvert: 1000,
  purchaseStep: 0.5,
  yield: 1,
  marketSection: 'DO_KHO_GIA_VI',
  ...over,
});

const INGREDIENTS: Ingredient[] = [
  ing({ id: 'ga', name: 'Gà', divisibility: 'DISCRETE', baseUnit: 'con', purchaseUnit: 'con', unitConvert: 1, purchaseStep: 1, marketSection: 'THIT_CA' }),
  ing({ id: 'gao_nep', name: 'Gạo nếp', baseUnit: 'g', purchaseUnit: 'kg', unitConvert: 1000, purchaseStep: 0.5 }),
  ing({ id: 'muoi', name: 'Muối', divisibility: 'SEASONING', baseUnit: 'g', purchaseUnit: 'gói', unitConvert: 500, purchaseStep: 1 }),
  ing({ id: 'mang', name: 'Măng khô', baseUnit: 'g', purchaseUnit: 'kg', unitConvert: 1000, purchaseStep: 0.5, yield: 0.8, marketSection: 'RAU_CU' }),
];
const ingById = new Map(INGREDIENTS.map((i) => [i.id, i]));

describe('computeScaling — quy đổi mâm/người', () => {
  it('ROUND_UP làm tròn lên trọn mâm (14 người, 6/mâm → 18 phần)', () => {
    const s = computeScaling({ perTray: 6, scaleMode: 'ROUND_UP', bufferType: 'GIA_DINH', guestCount: 14 });
    expect(s.persons).toBe(18);
    expect(s.fullTrays).toBe(3);
    expect(s.remainder).toBe(0);
  });
  it('EXACT nấu vừa đủ (14 phần, hiển thị 2 mâm + 2 lẻ)', () => {
    const s = computeScaling({ perTray: 6, scaleMode: 'EXACT', bufferType: 'GIA_DINH', guestCount: 14 });
    expect(s.persons).toBe(14);
    expect(s.fullTrays).toBe(2);
    expect(s.remainder).toBe(2);
  });
  it('nhập theo số mâm → persons = trays × perTray', () => {
    const s = computeScaling({ perTray: 6, scaleMode: 'ROUND_UP', bufferType: 'TRANG_TRONG', trays: 3 });
    expect(s.persons).toBe(18);
  });
  it('ném lỗi khi thiếu cả trays lẫn guestCount', () => {
    expect(() => computeScaling({ perTray: 6, scaleMode: 'EXACT', bufferType: 'VUA_DU' })).toThrow();
  });
});

describe('scaleLineBase — ba nhánh divisibility', () => {
  it('CONTINUOUS nhân số người và buffer', () => {
    const ri = { ingredientId: 'gao_nep', perPerson: 80 };
    expect(scaleLineBase(ri, ingById.get('gao_nep')!, 18, 'GIA_DINH')).toBeCloseTo(80 * 18 * 1.05, 3);
  });
  it('DISCRETE không nhân buffer (1/6 con/người × 18 = 3 con)', () => {
    const ri = { ingredientId: 'ga', perPerson: 1 / 6 };
    expect(scaleLineBase(ri, ingById.get('ga')!, 18, 'TRANG_TRONG')).toBeCloseTo(3, 3);
  });
  it('SEASONING dưới tuyến tính (persons^0.85)', () => {
    const ri = { ingredientId: 'muoi', perPerson: 2 };
    const got = scaleLineBase(ri, ingById.get('muoi')!, 18, 'GIA_DINH');
    expect(got).toBeCloseTo(2 * Math.pow(18, 0.85), 2);
    expect(got).toBeLessThan(2 * 18); // ít hơn tuyến tính
  });
  it('scales=false giữ nguyên lượng', () => {
    const ri = { ingredientId: 'muoi', perPerson: 5, scales: false };
    expect(scaleLineBase(ri, ingById.get('muoi')!, 100, 'TRANG_TRONG')).toBe(5);
  });
});

describe('toPurchaseQty — quy đổi đơn vị mua + yield + làm tròn lên', () => {
  it('1512g gạo nếp → 2 kg (làm tròn lên 0.5)', () => {
    expect(toPurchaseQty(1512, ingById.get('gao_nep')!)).toBe(2);
  });
  it('măng khô tính hao hụt yield 0.8 rồi làm tròn', () => {
    // cần 800g dùng được → mua 800/0.8 = 1000g = 1.0 kg
    expect(toPurchaseQty(800, ingById.get('mang')!)).toBe(1);
  });
});

describe('buildShoppingList — gộp + nhóm theo quầy', () => {
  const mkRecipe = (dishId: string, items: { ingredientId: string; perPerson: number }[]): Recipe => ({
    id: `r_${dishId}`, dishId, ingredients: items, steps: [],
  });
  const menu: MenuInstance = {
    id: 'mi1', occasionId: 'o', region: 'BAC', mamType: 'MAN', serveAt: T0,
    scaling: computeScaling({ perTray: 6, scaleMode: 'ROUND_UP', bufferType: 'GIA_DINH', guestCount: 6 }),
    createdAt: T0,
    dishes: [
      { id: 'd1', dishId: 'ga_luoc', dishName: 'Gà luộc', required: true, trayGroup: 'TRONG_NHA',
        recipeSnapshot: mkRecipe('ga_luoc', [{ ingredientId: 'ga', perPerson: 1 / 6 }, { ingredientId: 'muoi', perPerson: 1 }]) },
      { id: 'd2', dishId: 'xoi', dishName: 'Xôi', required: true, trayGroup: 'TRONG_NHA',
        recipeSnapshot: mkRecipe('xoi', [{ ingredientId: 'gao_nep', perPerson: 80 }, { ingredientId: 'muoi', perPerson: 1 }]) },
    ],
  };
  const list = buildShoppingList(menu, ingById);

  it('gộp muối dùng bởi cả 2 món thành 1 dòng', () => {
    const muoi = list.items.filter((i) => i.ingredientId === 'muoi');
    expect(muoi).toHaveLength(1);
    expect(muoi[0]!.usedBy.sort()).toEqual(['Gà luộc', 'Xôi']);
  });
  it('sắp thịt/cá trước đồ khô', () => {
    const sections = list.items.map((i) => i.marketSection);
    expect(sections.indexOf('THIT_CA')).toBeLessThan(sections.indexOf('DO_KHO_GIA_VI'));
  });
  it('groupBySection trả về đúng các nhóm có hàng', () => {
    const g = groupBySection(list);
    expect(g.map((x) => x.section)).toEqual(['THIT_CA', 'DO_KHO_GIA_VI']);
  });
});

// ───────────────────────────────────────────────── scheduler
const step = (over: Partial<RecipeStep> & Pick<RecipeStep, 'id' | 'text'>): RecipeStep => ({
  activeMin: 0, passiveMin: 0, predecessorIds: [], ...over,
});

describe('schedule — lập lịch theo deadline', () => {
  const dishes: SchedulerDishInput[] = [
    {
      instanceId: 'd1', dishId: 'ga_luoc', dishName: 'Gà luộc',
      steps: [
        step({ id: 'a1', text: 'Sơ chế gà', activeMin: 10 }),
        step({ id: 'a2', text: 'Luộc gà', activeMin: 5, passiveMin: 30, machine: 'BEP', predecessorIds: ['a1'], mustFinishHot: true }),
      ],
    },
    {
      instanceId: 'd2', dishId: 'xoi', dishName: 'Xôi',
      steps: [
        step({ id: 'b1', text: 'Ngâm gạo', activeMin: 5, passiveMin: 60 }),
        step({ id: 'b2', text: 'Đồ xôi', activeMin: 5, passiveMin: 40, machine: 'HAP', predecessorIds: ['b1'] }),
      ],
    },
  ];
  const base = {
    serveAt: T0, dishes, numPeople: 1,
    resources: [{ machine: 'BEP' as const, count: 1 }, { machine: 'HAP' as const, count: 1 }],
  };

  it('khả thi khi không giới hạn giờ vào bếp', () => {
    const r = schedule(base);
    expect(r.feasible).toBe(true);
    expect(r.tasks).toHaveLength(4);
  });

  it('mọi bước xong trước (T0 - đệm nội bộ)', () => {
    const r = schedule(base);
    const effectiveT0 = T0 - 15 * MIN;
    for (const t of r.tasks) expect(t.end).toBeLessThanOrEqual(effectiveT0 + 1);
  });

  it('món nóng (luộc gà) kết thúc sát giờ ăn; đường găng là chuỗi xôi (dài hơn)', () => {
    const r = schedule(base);
    const ga = r.tasks.find((t) => t.stepId === 'a2')!;
    expect(T0 - ga.end).toBeLessThanOrEqual(25 * MIN + 1); // trong ngưỡng freshness
    expect(ga.slackMin).toBeGreaterThan(0); // gà có dư thời gian
    // chuỗi xôi (ngâm 60' + đồ 45') dài nhất → nằm trên đường găng
    expect(r.tasks.find((t) => t.stepId === 'b1')!.onCriticalPath).toBe(true);
    expect(r.tasks.find((t) => t.stepId === 'b2')!.onCriticalPath).toBe(true);
  });

  it('báo không kịp khi giờ vào bếp quá muộn', () => {
    const r = schedule({ ...base, availableFrom: T0 - 20 * MIN });
    expect(r.feasible).toBe(false);
    expect(r.overrunMin).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.level === 'CAM')).toBe(true);
  });

  it('nhiều người → nấu song song → vào bếp muộn hơn', () => {
    const indep: SchedulerDishInput[] = ['m1', 'm2', 'm3'].map((id) => ({
      instanceId: id, dishId: id, dishName: id,
      steps: [step({ id: 's', text: 'việc 30 phút', activeMin: 30 })],
    }));
    const one = schedule({ serveAt: T0, dishes: indep, numPeople: 1, resources: [] });
    const three = schedule({ serveAt: T0, dishes: indep, numPeople: 3, resources: [] });
    // 3 người làm song song nên bắt đầu muộn hơn (gần T0 hơn) so với 1 người nối tiếp
    expect(three.earliestStartOverall).toBeGreaterThan(one.earliestStartOverall);
  });

  it('tách bước làm-trước-ngày-cúng ra khỏi lịch ngày D', () => {
    const withAhead: SchedulerDishInput[] = [
      {
        instanceId: 'dh', dishId: 'dua_hanh', dishName: 'Dưa hành',
        steps: [step({ id: 'm', text: 'Muối dưa hành', activeMin: 20, makeAheadDays: 5 })],
      },
      {
        instanceId: 'gl', dishId: 'ga_luoc', dishName: 'Gà luộc',
        steps: [step({ id: 'l', text: 'Luộc gà', activeMin: 5, passiveMin: 30, machine: 'BEP', mustFinishHot: true })],
      },
    ];
    const r = schedule({ serveAt: T0, dishes: withAhead, numPeople: 1, resources: [{ machine: 'BEP', count: 1 }] });
    expect(r.prepAhead).toHaveLength(1);
    expect(r.prepAhead[0]!.dishName).toBe('Dưa hành');
    // lịch ngày D chỉ còn gà luộc
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks[0]!.dishName).toBe('Gà luộc');
  });

  it('re-plan: task đã xong bị loại khỏi lịch ngày D', () => {
    const r1 = schedule(base);
    const someId = r1.tasks[0]!.id;
    const r2 = schedule({ ...base, doneTaskIds: [someId] });
    expect(r2.tasks.find((t) => t.id === someId)).toBeUndefined();
    expect(r2.tasks.length).toBe(r1.tasks.length - 1);
  });

  it('phân công: việc khó (difficulty 3) giao cho người tay nghề cao', () => {
    const hard: SchedulerDishInput[] = [{
      instanceId: 'hk', dishId: 'mon_kho', dishName: 'Món khó',
      steps: [step({ id: 's', text: 'việc khó', activeMin: 20, difficulty: 3 })],
    }];
    const people = [
      { id: 'p1', name: 'Mới tập', skill: 1 as const, avoid: [] },
      { id: 'p2', name: 'Thạo', skill: 3 as const, avoid: [] },
    ];
    const r = schedule({ serveAt: T0, dishes: hard, numPeople: 2, resources: [], people });
    expect(r.tasks[0]!.assigneeId).toBe('p2'); // chỉ p2 đủ kỹ năng
  });

  it('phát hiện phụ thuộc vòng', () => {
    const bad: SchedulerDishInput[] = [{
      instanceId: 'x', dishId: 'x', dishName: 'x',
      steps: [step({ id: 'p', text: 'p', predecessorIds: ['q'] }), step({ id: 'q', text: 'q', predecessorIds: ['p'] })],
    }];
    expect(() => schedule({ serveAt: T0, dishes: bad, numPeople: 1, resources: [] })).toThrow();
  });
});

// ───────────────────────────────────────────────── generator
describe('generateMenu — ghép mâm cân đối', () => {
  const dish = (over: Partial<Dish> & Pick<Dish, 'id' | 'name' | 'roles'>): Dish => ({
    region: ['BAC'], mamType: ['MAN'], difficulty: 2, mainIngredients: [], cookMethods: [],
    makeAheadMinutes: 0, isNearServe: false, equipment: [], tags: [], recipeId: `r_${over.id}`,
    source: 'SEED', ...over,
  });
  const dishes: Dish[] = [
    dish({ id: 'ga_luoc', name: 'Gà luộc', roles: ['MON_CHINH'], cookMethods: ['LUOC'], mainIngredients: ['ga'], isNearServe: true }),
    dish({ id: 'xoi_gac', name: 'Xôi gấc', roles: ['TINH_BOT'], cookMethods: ['HAP'], mainIngredients: ['gao_nep'] }),
    dish({ id: 'canh_mang', name: 'Canh măng', roles: ['CANH'], cookMethods: ['NINH_HAM'], mainIngredients: ['mang'], makeAheadMinutes: 120 }),
    dish({ id: 'nem', name: 'Nem rán', roles: ['DAU_VI'], cookMethods: ['CHIEN'], difficulty: 3 }),
    dish({ id: 'banh_tet', name: 'Bánh tét', roles: ['TINH_BOT'], region: ['NAM'], mainIngredients: ['gao_nep'] }),
  ];
  const template: MenuTemplate = {
    id: 'tpl1', occasionId: 'gio', region: 'BAC', mamType: 'MAN', name: 'Mâm giỗ Bắc',
    slots: [
      { role: 'MON_CHINH', required: true, anchorDishId: 'ga_luoc' },
      { role: 'TINH_BOT', required: true },
      { role: 'CANH', required: true },
      { role: 'DAU_VI', required: false },
    ],
  };

  it('đặt món neo bắt buộc (gà luộc) vào mâm', () => {
    const m = generateMenu(template, dishes);
    expect(m.choices.find((c) => c.dishId === 'ga_luoc')).toBeTruthy();
  });
  it('không chọn món sai vùng miền (bánh tét miền Nam)', () => {
    const m = generateMenu(template, dishes);
    expect(m.choices.find((c) => c.dishId === 'banh_tet')).toBeFalsy();
    // slot TINH_BOT phải được lấp bằng xôi gấc (Bắc)
    expect(m.choices.find((c) => c.role === 'TINH_BOT')?.dishId).toBe('xoi_gac');
  });
  it('người mới nấu (maxDifficulty=2) né món khó (nem rán độ khó 3)', () => {
    const easy = generateMenu(template, dishes, { maxDifficulty: 2 });
    const nem = easy.choices.find((c) => c.dishId === 'nem');
    // nem vẫn có thể được chọn nếu là ứng viên duy nhất cho slot, nhưng điểm bị phạt
    if (nem) expect(nem.score).toBeLessThan(15);
  });
  it('không lặp món trong cùng mâm', () => {
    const m = generateMenu(template, dishes);
    const ids = m.choices.map((c) => c.dishId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
