/**
 * Engine lập lịch nấu theo deadline (docs/DESIGN.md §5) — trái tim cookafeast.
 *
 * Nấu cỗ kịp giờ = bài toán RCPSP bếp: món = job, bước nấu = task,
 * mặt bếp/lò/nồi/người = tài nguyên hữu hạn, giờ cúng = deadline cứng (T0).
 *
 * Ba pha:
 *   A) Build graph: gộp mọi bước của mọi món thành một DAG task toàn cục.
 *   B) Backward CPM (bỏ qua tài nguyên): tính slack & đường găng.
 *   C) Serial SGS ALAP có ràng buộc tài nguyên: xếp mỗi task MUỘN NHẤT có thể
 *      mà vẫn đủ người + thiết bị → giữ món tươi/nóng, biết "phải vào bếp lúc mấy giờ".
 *
 * Chìa khoá nấu song song: NGƯỜI chỉ bị giữ trong activeMin; trong passiveMin
 * (hầm/ngâm/để nguội) thiết bị vẫn bận nhưng người rảnh đi làm việc khác.
 */

import type {
  CookSchedule,
  KitchenResource,
  Machine,
  Person,
  PersonTaskQueue,
  PrepAheadTask,
  RecipeStep,
  ScheduledTask,
  ScheduleWarning,
} from './domain.js';

const MS_PER_MIN = 60_000;

export interface SchedulerDishInput {
  /** Id duy nhất của món trong mâm (MenuInstanceDish.id). */
  instanceId: string;
  dishId: string;
  dishName: string;
  steps: RecipeStep[];
}

export interface SchedulerInput {
  /** Giờ cúng / giờ ăn (epoch ms) = T0. */
  serveAt: number;
  dishes: SchedulerDishInput[];
  resources: KitchenResource[];
  /** Số người nấu (>=1). Chế độ 1 người = 1. */
  numPeople: number;
  /** Sớm nhất có thể vào bếp (epoch ms). Nếu lịch đòi sớm hơn → cảnh báo không kịp. */
  availableFrom?: number;
  /** Món ăn nóng nên xong trong vòng X phút trước T0 (mặc định 25). */
  freshnessMarginMin?: number;
  /** Đệm an toàn: mọi thứ xong trước T0 X phút (mặc định 15). */
  internalBufferMin?: number;

  // ── Re-plan động (Phase 3) ──
  /** Thời điểm hiện tại (epoch ms). Nếu có, dùng làm sàn "không xếp vào quá khứ". */
  now?: number;
  /** Các task ĐÃ XONG — loại khỏi lịch, giải phóng tài nguyên, thoả mãn phụ thuộc. */
  doneTaskIds?: string[];
  /** Danh sách người nấu — nếu có, gán mỗi việc cho một người theo kỹ năng + cân tải. */
  people?: Person[];
}

interface Node {
  id: string;
  dishId: string;
  dishName: string;
  stepId: string;
  text: string;
  active: number;
  passive: number;
  dur: number;
  machine: Machine | null;
  needsPeople: number;
  mustFinishHot: boolean;
  makeAhead: boolean;
  makeAheadDays: number;
  difficulty: number;
  predIds: string[];
  succIds: string[];
  // CPM (phút, project bắt đầu = 0)
  es: number;
  ef: number;
  ls: number;
  lf: number;
  slack: number;
  tail: number; // đường dài nhất từ đầu task tới đích
  critical: boolean;
  // SGS (phút tính từ origin)
  startMin: number;
  endMin: number;
  activeEndMin: number;
}

function topoSort(nodes: Map<string, Node>): Node[] {
  const order: Node[] = [];
  const indeg = new Map<string, number>();
  for (const n of nodes.values()) indeg.set(n.id, n.predIds.length);
  const queue: string[] = [];
  for (const [id, d] of indeg) if (d === 0) queue.push(id);
  while (queue.length) {
    const id = queue.shift()!;
    const n = nodes.get(id)!;
    order.push(n);
    for (const s of n.succIds) {
      const d = (indeg.get(s) ?? 0) - 1;
      indeg.set(s, d);
      if (d === 0) queue.push(s);
    }
  }
  if (order.length !== nodes.size) {
    throw new Error('Lịch nấu có phụ thuộc vòng (cycle) — kiểm tra predecessorIds.');
  }
  return order;
}

/** Lập lịch nấu. Trả về CookSchedule với thời gian tuyệt đối (epoch ms). */
export function schedule(input: SchedulerInput): CookSchedule {
  const freshMargin = input.freshnessMarginMin ?? 25;
  const internalBuffer = input.internalBufferMin ?? 15;
  const peopleCap = Math.max(1, input.numPeople | 0);
  const effectiveT0 = input.serveAt - internalBuffer * MS_PER_MIN;
  // re-plan: nếu biết "bây giờ", coi đó là sàn giờ vào bếp (cảnh báo nếu đã trễ)
  const availableFrom = input.availableFrom ?? input.now;

  // ── PHA A: build graph ────────────────────────────────────────────────
  const allNodes = new Map<string, Node>();
  input.dishes.forEach((d, i) => {
    const prefix = `t${i}`;
    for (const step of d.steps) {
      const id = `${prefix}:${step.id}`;
      const makeAheadDays = step.makeAheadDays ?? 0;
      allNodes.set(id, {
        id,
        dishId: d.dishId,
        dishName: d.dishName,
        stepId: step.id,
        text: step.text,
        active: Math.max(0, step.activeMin),
        passive: Math.max(0, step.passiveMin),
        dur: Math.max(0, step.activeMin) + Math.max(0, step.passiveMin),
        machine: step.machine ?? null,
        needsPeople: Math.max(1, step.needsPeople ?? 1),
        mustFinishHot: step.mustFinishHot ?? false,
        makeAhead: makeAheadDays > 0,
        makeAheadDays,
        difficulty: step.difficulty ?? 1,
        predIds: step.predecessorIds.map((p) => `${prefix}:${p}`),
        succIds: [],
        es: 0, ef: 0, ls: 0, lf: 0, slack: 0, tail: 0, critical: false,
        startMin: 0, endMin: 0, activeEndMin: 0,
      });
    }
  });

  // Re-plan: task ĐÃ XONG bị loại khỏi lịch (giải phóng tài nguyên + thoả mãn phụ thuộc).
  const doneSet = new Set(input.doneTaskIds ?? []);

  // Tách bước làm-trước-ngày-cúng (dưa hành, giò, bánh chưng, thịt đông...) ra danh sách riêng.
  const prepAhead: PrepAheadTask[] = [];
  for (const n of allNodes.values()) {
    if (n.makeAhead && !doneSet.has(n.id)) {
      prepAhead.push({
        id: n.id, dishId: n.dishId, dishName: n.dishName, stepId: n.stepId, text: n.text,
        makeAheadDays: n.makeAheadDays, activeMin: n.active, passiveMin: n.passive,
      });
    }
  }
  prepAhead.sort((a, b) => b.makeAheadDays - a.makeAheadDays || a.dishName.localeCompare(b.dishName, 'vi'));

  // Đồ thị NGÀY CÚNG: bỏ bước làm-trước VÀ bước đã xong; cạnh trỏ tới chúng coi như đã thoả.
  const nodes = new Map<string, Node>();
  for (const [id, n] of allNodes) if (!n.makeAhead && !doneSet.has(id)) nodes.set(id, n);
  for (const n of nodes.values()) {
    n.predIds = n.predIds.filter((p) => nodes.has(p));
    n.succIds = [];
  }
  for (const n of nodes.values()) for (const p of n.predIds) nodes.get(p)!.succIds.push(n.id);

  const order = topoSort(nodes); // preds trước succs

  // ── PHA B: CPM ────────────────────────────────────────────────────────
  // forward (ASAP)
  for (const n of order) {
    n.es = 0;
    for (const p of n.predIds) n.es = Math.max(n.es, nodes.get(p)!.ef);
    n.ef = n.es + n.dur;
  }
  const projectDuration = Math.max(0, ...[...nodes.values()].map((n) => n.ef));
  // backward (anchor finish = projectDuration) + tail
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i]!;
    if (n.succIds.length === 0) {
      n.lf = projectDuration;
      n.tail = n.dur;
    } else {
      n.lf = Math.min(...n.succIds.map((s) => nodes.get(s)!.ls));
      n.tail = n.dur + Math.max(...n.succIds.map((s) => nodes.get(s)!.tail));
    }
    n.ls = n.lf - n.dur;
    n.slack = n.ls - n.es;
    n.critical = n.slack <= 0.0001;
  }

  // ── PHA C: Serial SGS ALAP có ràng buộc tài nguyên ────────────────────
  // Cận trên horizon đủ rộng cho trường hợp mọi thứ phải nối tiếp trên 1 tài nguyên.
  const totalDur = [...nodes.values()].reduce((s, n) => s + n.dur, 0);
  const H = Math.min(36 * 60, totalDur + projectDuration + 120);
  const originMs = effectiveT0 - H * MS_PER_MIN;

  const macCap = new Map<Machine, number>();
  for (const r of input.resources) macCap.set(r.machine, Math.max(1, r.count));
  const machineUse = new Map<Machine, Int16Array>();
  const ensureMachine = (m: Machine): Int16Array => {
    let arr = machineUse.get(m);
    if (!arr) {
      if (!macCap.has(m)) macCap.set(m, 1); // tài nguyên chưa khai báo → mặc định 1
      arr = new Int16Array(H);
      machineUse.set(m, arr);
    }
    return arr;
  };
  const people = new Int16Array(H);

  const findLatestStart = (
    sHi: number,
    dur: number,
    active: number,
    mac: Machine | null,
    needP: number,
  ): number | null => {
    let s = Math.min(sHi, H - dur);
    while (s >= 0) {
      let conflict = -1;
      if (mac && dur > 0) {
        const arr = ensureMachine(mac);
        const cap = macCap.get(mac)!;
        for (let m = s + dur - 1; m >= s; m--) {
          if (arr[m]! >= cap) { conflict = m; break; }
        }
      }
      if (conflict === -1 && active > 0) {
        for (let m = s + active - 1; m >= s; m--) {
          if (people[m]! + needP > peopleCap) { conflict = m; break; }
        }
      }
      if (conflict === -1) return s;
      s = Math.min(s - 1, conflict - dur); // dời cửa sổ xuống dưới phút xung đột
    }
    return null;
  };

  // Xếp theo thứ tự đảo topo (succs trước preds) để biết cận trên = start sớm nhất của succs.
  let infeasibleResource = false;
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i]!;
    let lfCap = H; // task cuối: xong trước effectiveT0
    for (const s of n.succIds) lfCap = Math.min(lfCap, nodes.get(s)!.startMin);
    const sHi = lfCap - n.dur;
    let start = findLatestStart(sHi, n.dur, n.active, n.machine, n.needsPeople);
    if (start == null) {
      infeasibleResource = true;
      start = 0; // best-effort: nhét sớm nhất có thể
    }
    n.startMin = start;
    n.endMin = start + n.dur;
    n.activeEndMin = start + n.active;
    if (n.machine && n.dur > 0) {
      const arr = ensureMachine(n.machine);
      for (let m = start; m < start + n.dur; m++) arr[m]! += 1;
    }
    if (n.active > 0) {
      for (let m = start; m < start + n.active; m++) people[m]! += n.needsPeople;
    }
  }

  // ── Kết xuất ──────────────────────────────────────────────────────────
  const toMs = (min: number) => originMs + min * MS_PER_MIN;
  const tasks: ScheduledTask[] = order.map((n) => ({
    id: n.id,
    dishId: n.dishId,
    dishName: n.dishName,
    stepId: n.stepId,
    text: n.text,
    start: toMs(n.startMin),
    activeEnd: toMs(n.activeEndMin),
    end: toMs(n.endMin),
    activeMin: n.active,
    passiveMin: n.passive,
    machine: n.machine,
    needsPeople: n.needsPeople,
    latestStart: effectiveT0 - n.tail * MS_PER_MIN,
    slackMin: Math.round(n.slack),
    onCriticalPath: n.critical,
    mustFinishHot: n.mustFinishHot,
    predecessorTaskIds: n.predIds,
  }));
  tasks.sort((a, b) => a.start - b.start || b.slackMin - a.slackMin);

  // Phân công theo kỹ năng + cân tải (Phase 3): mỗi việc gợi ý cho người đủ kỹ năng, ít việc nhất.
  if (input.people && input.people.length > 0) {
    const people = input.people;
    const load = new Map<string, number>(people.map((p) => [p.id, 0]));
    for (const t of tasks) {
      const diff = nodes.get(t.id)?.difficulty ?? 1;
      const eligible = people.filter((p) => p.skill >= diff);
      const pool = eligible.length ? eligible : people;
      let best = pool[0]!;
      for (const p of pool) if ((load.get(p.id) ?? 0) < (load.get(best.id) ?? 0)) best = p;
      t.assigneeId = best.id;
      load.set(best.id, (load.get(best.id) ?? 0) + Math.max(1, t.activeMin));
    }
  }

  const earliestStartOverall = tasks.length
    ? Math.min(...tasks.map((t) => t.start))
    : input.serveAt;

  // ── Cảnh báo (tông điềm tĩnh, không gắt) ──────────────────────────────
  const warnings: ScheduleWarning[] = [];
  let feasible = true;
  let overrunMin: number | undefined;

  if (availableFrom != null && earliestStartOverall < availableFrom) {
    feasible = false;
    overrunMin = Math.round((availableFrom - earliestStartOverall) / MS_PER_MIN);
    warnings.push({
      level: 'CAM',
      message:
        `Nếu bắt đầu từ giờ dự kiến thì lịch cần thêm khoảng ${overrunMin} phút. ` +
        `Bình tĩnh nhé — có thể bớt một món phụ, mua sẵn giò/chả, hoặc lùi giờ cúng một chút.`,
    });
  }
  if (infeasibleResource) {
    feasible = false;
    warnings.push({
      level: 'CAM',
      message: 'Thiếu bếp/lò/người cho một số bước cùng lúc — cân nhắc thêm người phụ hoặc giãn món.',
    });
  }
  // món nóng xong quá sớm so với giờ ăn → sẽ nguội
  for (const t of tasks) {
    if (t.mustFinishHot && input.serveAt - t.end > freshMargin * MS_PER_MIN) {
      const m = Math.round((input.serveAt - t.end) / MS_PER_MIN);
      warnings.push({
        level: 'VANG',
        taskId: t.id,
        message: `"${t.dishName}" dự kiến xong sớm ~${m} phút trước giờ ăn — nên giữ ấm hoặc làm sát giờ hơn.`,
      });
    }
  }

  return {
    menuInstanceId: '',
    serveAt: input.serveAt,
    scheduledAt: input.now,
    tasks,
    prepAhead,
    earliestStartOverall,
    feasible,
    overrunMin,
    warnings,
  };
}

/** Gom lịch thành hàng đợi việc của từng người (theo assigneeId). */
export function buildTaskQueues(schedule: CookSchedule, people: Person[]): PersonTaskQueue[] {
  return people.map((p) => ({
    personId: p.id,
    personName: p.name,
    tasks: schedule.tasks.filter((t) => t.assigneeId === p.id),
  }));
}
