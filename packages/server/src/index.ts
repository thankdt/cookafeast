/**
 * cookafeast server — Fastify + SQLite.
 *  - Serve client PWA (static) + SPA fallback.
 *  - REST API cho catalog, mâm cỗ, đi chợ, lập lịch, tiến độ nấu.
 *  - In URL mạng LAN + QR để mở trên điện thoại trong wifi nhà.
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import qrcode from 'qrcode-terminal';
import { buildShoppingList, schedule } from '@cookafeast/core';
import { catalog, loadCatalog } from './catalog.js';
import {
  createMenuInstance,
  schedulerInputFor,
  setMenuDishes,
  type CreateMenuInput,
} from './assemble.js';
import { cookRepo, menuRepo } from './repository.js';
import { sessionRepo } from './collab.js';
import { registerWebSocket } from './ws.js';
import { memoryRepo } from './family.js';
import { toLunarVi } from './lunar.js';
import { suggestMenu, explainDish } from './suggestions.js';
import type { Remembrance, RitualFamilyConfig, OccasionDiary } from '@cookafeast/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = join(__dirname, '..', '..', 'client', 'dist');
const PORT = Number(process.env.PORT ?? 8088);

function lanIp(): string {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}

async function main() {
  loadCatalog(); // nạp + log catalog ngay khi khởi động
  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket);

  // ───────────── API ─────────────
  app.get('/api/health', async () => ({ ok: true, ts: Date.now() }));

  /** URL mạng LAN của host — client dùng để dựng link/QR mời người nhà tham gia. */
  app.get('/api/netinfo', async () => ({ lanUrl: `http://${lanIp()}:${PORT}`, port: PORT }));

  // ── Cộng tác (Phase 2) ──
  app.post<{ Params: { id: string } }>('/api/menus/:id/session', async (req, reply) => {
    const menu = menuRepo.get(req.params.id);
    if (!menu) return reply.code(404).send({ error: 'Không tìm thấy mâm' });
    // tái dùng phiên đang mở nếu có, tránh tạo trùng
    const existing = sessionRepo.getByMenu(menu.id);
    return reply.code(201).send(existing ?? sessionRepo.create(menu.id));
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    const s = sessionRepo.get(req.params.id);
    if (!s) return reply.code(404).send({ error: 'Không tìm thấy phiên' });
    return s;
  });

  app.get<{ Params: { code: string } }>('/api/sessions/by-room/:code', async (req, reply) => {
    const s = sessionRepo.getByRoom(req.params.code);
    if (!s) return reply.code(404).send({ error: 'Mã phòng không đúng' });
    return s;
  });

  app.get('/api/occasions', async () => catalog.occasions());

  app.get<{ Params: { id: string } }>('/api/occasions/:id', async (req, reply) => {
    const occasion = catalog.occasion(req.params.id);
    if (!occasion) return reply.code(404).send({ error: 'Không tìm thấy dịp' });
    return { occasion, templates: catalog.templatesFor(req.params.id) };
  });

  app.get<{ Querystring: { region?: string; mamType?: string } }>('/api/dishes', async (req) => {
    return catalog.dishesFor(req.query.region as never, req.query.mamType as never);
  });

  app.get<{ Params: { id: string } }>('/api/dishes/:id', async (req, reply) => {
    const dish = catalog.dish(req.params.id);
    if (!dish) return reply.code(404).send({ error: 'Không tìm thấy món' });
    return { dish, recipe: catalog.recipeForDish(req.params.id) ?? null };
  });

  // ── Tầng linh hồn (Phase 6) ──
  app.get<{ Params: { id: string } }>('/api/dishes/:id/notes', async (req) => memoryRepo.recipeNotes(req.params.id));
  app.post<{ Params: { id: string }; Body: { text: string } }>('/api/dishes/:id/notes', async (req, reply) => {
    if (!req.body?.text?.trim()) return reply.code(400).send({ error: 'Ghi chú trống' });
    return reply.code(201).send(memoryRepo.addRecipeNote(req.params.id, req.body.text.trim()));
  });
  app.get('/api/family/remembrances', async () => memoryRepo.remembrances());
  app.post<{ Body: Omit<Remembrance, 'id' | 'createdAt'> }>('/api/family/remembrances', async (req, reply) =>
    reply.code(201).send(memoryRepo.addRemembrance(req.body)));
  app.get('/api/family/ritual-config', async () => memoryRepo.ritualConfig());
  app.put<{ Body: RitualFamilyConfig }>('/api/family/ritual-config', async (req) => memoryRepo.saveRitualConfig(req.body ?? {}));
  app.get('/api/family/diary', async () => memoryRepo.diaries());
  app.post<{ Body: Omit<OccasionDiary, 'id' | 'createdAt'> }>('/api/family/diary', async (req, reply) =>
    reply.code(201).send(memoryRepo.addDiary(req.body)));
  app.delete<{ Params: { id: string } }>('/api/family/memory/:id', async (req) => {
    memoryRepo.remove(req.params.id);
    return { ok: true };
  });
  app.get<{ Querystring: { at?: string } }>('/api/lunar', async (req) =>
    toLunarVi(req.query.at ? Number(req.query.at) : Date.now()));

  // ── Gợi ý AI (Phase 5) — off-by-default, có fallback luật ──
  app.post<{ Body: { text: string } }>('/api/suggest/menu', async (req, reply) => {
    if (!req.body?.text?.trim()) return reply.code(400).send({ error: 'Hãy mô tả mâm bạn muốn' });
    return suggestMenu(req.body.text.trim());
  });
  app.post<{ Params: { id: string }; Body: { occasionId?: string } }>('/api/dishes/:id/explain', async (req) => {
    return { text: await explainDish(req.params.id, req.body?.occasionId) };
  });

  // tạo mâm cỗ (generator tự ghép nếu không truyền dishIds)
  app.post<{ Body: CreateMenuInput }>('/api/menus', async (req, reply) => {
    try {
      const menu = createMenuInstance(req.body);
      menuRepo.save(menu);
      return reply.code(201).send(menu);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.get('/api/menus', async () => menuRepo.list());

  app.get<{ Params: { id: string } }>('/api/menus/:id', async (req, reply) => {
    const menu = menuRepo.get(req.params.id);
    if (!menu) return reply.code(404).send({ error: 'Không tìm thấy mâm' });
    return menu;
  });

  app.delete<{ Params: { id: string } }>('/api/menus/:id', async (req) => {
    menuRepo.remove(req.params.id);
    return { ok: true };
  });

  // thay danh sách món (đổi/bỏ/thêm trong màn thực đơn)
  app.put<{ Params: { id: string }; Body: { dishIds: string[] } }>(
    '/api/menus/:id/dishes',
    async (req, reply) => {
      const menu = menuRepo.get(req.params.id);
      if (!menu) return reply.code(404).send({ error: 'Không tìm thấy mâm' });
      const updated = setMenuDishes(menu, req.body?.dishIds ?? []);
      menuRepo.save(updated);
      return updated;
    },
  );

  app.get<{ Params: { id: string } }>('/api/menus/:id/shopping', async (req, reply) => {
    const menu = menuRepo.get(req.params.id);
    if (!menu) return reply.code(404).send({ error: 'Không tìm thấy mâm' });
    return buildShoppingList(menu, catalog.ingredientMap());
  });

  app.post<{
    Params: { id: string };
    Body: { numPeople?: number; availableFrom?: number; resources?: never };
  }>('/api/menus/:id/schedule', async (req, reply) => {
    const menu = menuRepo.get(req.params.id);
    if (!menu) return reply.code(404).send({ error: 'Không tìm thấy mâm' });
    // re-plan: loại việc đã xong + dùng thành viên phiên (nếu có) để phân công
    const states = cookRepo.states(menu.id);
    const doneTaskIds = states.filter((s) => s.status === 'DONE').map((s) => s.taskId);
    const session = sessionRepo.getByMenu(menu.id);
    const people = session?.members.map((m) => ({ id: m.id, name: m.name, skill: m.skill, avoid: m.avoid }));
    const input = schedulerInputFor(menu, {
      numPeople: req.body?.numPeople,
      availableFrom: req.body?.availableFrom,
      resources: req.body?.resources,
      now: Date.now(),
      doneTaskIds,
      people: people && people.length ? people : undefined,
    });
    const result = schedule(input);
    result.menuInstanceId = menu.id;
    return result;
  });

  app.get<{ Params: { id: string } }>('/api/menus/:id/cook', async (req) => {
    return cookRepo.states(req.params.id);
  });

  app.post<{
    Params: { id: string; taskId: string };
    Body: { status?: string; progress?: number; personId?: string };
  }>('/api/menus/:id/cook/:taskId', async (req) => {
    return cookRepo.upsert(req.params.id, req.params.taskId, {
      status: req.body?.status as never,
      progress: req.body?.progress,
      personId: req.body?.personId,
    });
  });

  // ───────────── WebSocket cộng tác ─────────────
  registerWebSocket(app);

  // ───────────── Client PWA (static + SPA fallback) ─────────────
  if (existsSync(CLIENT_DIST)) {
    await app.register(fastifyStatic, { root: CLIENT_DIST, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  } else {
    app.get('/', async () => ({
      message:
        'Chưa có bản build client. Chạy "npm run build" ở gốc repo, hoặc "npm run dev" trong packages/client để phát triển.',
    }));
  }

  await app.listen({ port: PORT, host: '0.0.0.0' });

  const url = `http://${lanIp()}:${PORT}`;
  console.log('\n  🍲 cookafeast đang chạy!\n');
  console.log(`  Trên máy này:   http://localhost:${PORT}`);
  console.log(`  Trên điện thoại (cùng wifi): ${url}\n`);
  qrcode.generate(url, { small: true }, (qr) => console.log(qr));
  console.log(`  Quét QR trên để mở bằng điện thoại.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
