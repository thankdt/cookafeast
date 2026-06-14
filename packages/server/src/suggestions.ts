/**
 * Lớp gợi ý thực đơn (Phase 5).
 *  - RuleBased: bắt từ khoá + generator. Chạy 100% offline, là MẶC ĐỊNH và fallback.
 *  - ClaudeBacked: hiểu ngôn ngữ tự nhiên qua Claude API (structured output), CHỈ bật khi
 *    SUGGESTION_PROVIDER=claude và có ANTHROPIC_API_KEY. Mọi kết quả AI đều được VALIDATE
 *    lại bằng catalog (món có thật, đúng miền, đủ món neo) trước khi nhận.
 *  - Lỗi/thiếu key/timeout → im lặng rơi về RuleBased.
 */

import Anthropic from '@anthropic-ai/sdk';
import { generateMenu, type MamType, type MenuSuggestion, type Region } from '@cookafeast/core';
import { catalog } from './catalog.js';
import { pickTemplate } from './assemble.js';

const REGIONS: Region[] = ['BAC', 'TRUNG', 'NAM'];

function detectRegion(t: string): Region {
  if (/(trung|hu[ếe]|quảng|đà n[ẵa]ng|ngh[ệe] an)/i.test(t)) return 'TRUNG';
  if (/(nam|s[àa]i g[òo]n|mi[ềe]n t[âa]y|h[ồo] ch[íi] minh|lục tỉnh)/i.test(t)) return 'NAM';
  return 'BAC';
}
function detectMam(t: string): MamType {
  return /chay/i.test(t) ? 'CHAY' : 'MAN';
}
function detectOccasion(t: string): string {
  const occ = catalog.occasions();
  const lower = t.toLowerCase();
  // ưu tiên khớp tên dịp dài nhất
  const sorted = [...occ].sort((a, b) => b.name.length - a.name.length);
  for (const o of sorted) {
    const key = o.name.toLowerCase().split(/[\s(]/)[0];
    if (key && lower.includes(key)) return o.id;
  }
  if (/t[ếe]t|t[ấa]t ni[êe]n|giao th[ừu]a/i.test(t)) return occ.find((o) => o.group === 'TET')?.id ?? occ[0]!.id;
  if (/r[ằa]m|m[ùu]ng 1|vu lan/i.test(t)) return occ.find((o) => o.group === 'RAM')?.id ?? occ[0]!.id;
  if (/gi[ỗo]|c[úu]ng|49|100/i.test(t)) return occ.find((o) => o.group === 'GIO')?.id ?? occ[0]!.id;
  return occ.find((o) => o.id === 'gio_thuong')?.id ?? occ[0]!.id;
}
function detectGuestCount(t: string): number {
  const mam = t.match(/(\d+)\s*m[âa]m/i);
  if (mam) return Math.max(1, parseInt(mam[1]!, 10)) * 6;
  const ng = t.match(/(\d+)\s*(người|nguoi|khách|khach)/i);
  if (ng) return Math.max(1, parseInt(ng[1]!, 10));
  return 6;
}

function ruleBased(text: string): MenuSuggestion {
  const region = detectRegion(text);
  const mamType = detectMam(text);
  const occasionId = detectOccasion(text);
  const guestCount = detectGuestCount(text);
  const dishIds = dishesFor(occasionId, region, mamType);
  return { occasionId, region, mamType, guestCount, dishIds, explanation: 'Gợi ý theo từ khoá trong mô tả của bạn (chế độ ngoại tuyến).', provider: 'rule' };
}

/** Dùng template + generator để ra danh sách món hợp lệ cho (dịp, miền, loại mâm). */
function dishesFor(occasionId: string, region: Region, mamType: MamType): string[] {
  const template = pickTemplate({ occasionId, region, mamType, serveAt: 0, scaling: {} });
  if (!template) return [];
  const gen = generateMenu(template, catalog.dishesFor(region, mamType));
  return gen.choices.map((c) => c.dishId);
}

const MENU_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['occasionId', 'region', 'mamType', 'guestCount', 'dishIds', 'explanation'],
  properties: {
    occasionId: { type: 'string' },
    region: { enum: REGIONS },
    mamType: { enum: ['MAN', 'CHAY', 'CHUNG_SINH'] },
    guestCount: { type: 'integer' },
    dishIds: { type: 'array', items: { type: 'string' } },
    explanation: { type: 'string' },
  },
};

// rate limit thô (toàn tiến trình) để chặn chi phí AI mất kiểm soát
let aiCalls: number[] = [];
function underRateLimit(): boolean {
  const now = Date.now();
  aiCalls = aiCalls.filter((t) => now - t < 60_000);
  if (aiCalls.length >= 20) return false;
  aiCalls.push(now);
  return true;
}

async function claudeBacked(text: string): Promise<MenuSuggestion> {
  if (!underRateLimit()) throw new Error('rate-limited');
  const client = new Anthropic(); // đọc ANTHROPIC_API_KEY từ env
  const occList = catalog
    .occasions()
    .map((o) => `${o.id} — ${o.name} [${o.group}; mâm: ${o.mamTypes.join('/')}]`)
    .join('\n');
  const dishList = catalog
    .all()
    .dishes.map((d) => `${d.id} — ${d.name} [miền:${d.region.join(',')}; mâm:${d.mamType.join(',')}; vai:${d.roles.join(',')}]`)
    .join('\n');

  const params = {
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: MENU_SCHEMA } },
    system:
      'Bạn là chuyên gia cỗ bàn Việt Nam. Từ mô tả của người dùng, chọn DỊP, MIỀN, LOẠI MÂM, số người, và danh sách MÓN phù hợp phong tục. ' +
      'CHỈ dùng occasionId và dishId có trong danh sách được cung cấp. Tôn trọng món neo bắt buộc theo vùng (Bắc: gà luộc+xôi; Nam: thịt kho hột vịt+bánh tét). ' +
      'explanation viết tiếng Việt, ấm áp, ngắn gọn.',
    messages: [
      {
        role: 'user',
        content: `Mô tả của người dùng: "${text}"\n\n=== DỊP CÓ THỂ CHỌN ===\n${occList}\n\n=== MÓN CÓ THỂ CHỌN ===\n${dishList}`,
      },
    ],
  };
  // SDK type cho output_config có thể chưa khai báo — cast để qua typecheck
  const res = await client.messages.create(params as never);
  const block = (res as { content: { type: string; text?: string }[] }).content.find((b) => b.type === 'text');
  if (!block?.text) throw new Error('no content');
  const raw = JSON.parse(block.text) as MenuSuggestion;

  // ── VALIDATE chống ảo giác ──
  const region = REGIONS.includes(raw.region) ? raw.region : 'BAC';
  const mamType: MamType = ['MAN', 'CHAY', 'CHUNG_SINH'].includes(raw.mamType) ? raw.mamType : 'MAN';
  const occasionId = catalog.occasion(raw.occasionId) ? raw.occasionId : detectOccasion(text);
  const valid = new Set(catalog.dishesFor(region, mamType).map((d) => d.id));
  let dishIds = (raw.dishIds ?? []).filter((id) => valid.has(id));
  // đảm bảo đủ món neo bắt buộc: gộp với danh sách generator sinh ra
  const required = dishesFor(occasionId, region, mamType);
  const anchorRequired = required.slice(0, 4); // các slot bắt buộc đầu (gà/xôi/canh/khai vị)
  for (const id of anchorRequired) if (!dishIds.includes(id) && valid.has(id)) dishIds.push(id);
  if (dishIds.length === 0) dishIds = required;

  return {
    occasionId,
    region,
    mamType,
    guestCount: raw.guestCount > 0 ? raw.guestCount : detectGuestCount(text),
    dishIds,
    explanation: raw.explanation || 'Gợi ý bởi trợ lý AI.',
    provider: 'claude',
  };
}

function aiEnabled(): boolean {
  return process.env.SUGGESTION_PROVIDER === 'claude' && !!process.env.ANTHROPIC_API_KEY;
}

/** Gợi ý mâm từ ngôn ngữ tự nhiên. Thử AI nếu bật, lỗi thì rơi về luật. */
export async function suggestMenu(text: string): Promise<MenuSuggestion> {
  if (aiEnabled()) {
    try {
      return await claudeBacked(text);
    } catch (e) {
      console.warn('[suggest] AI lỗi, dùng luật:', (e as Error).message);
    }
  }
  return ruleBased(text);
}

/** Giải thích vì sao một món hợp với mâm (AI nếu bật, fallback mô tả luật). */
export async function explainDish(dishId: string, occasionId?: string): Promise<string> {
  const dish = catalog.dish(dishId);
  if (!dish) return 'Không tìm thấy món này.';
  if (aiEnabled() && underRateLimit()) {
    try {
      const client = new Anthropic();
      const occ = occasionId ? catalog.occasion(occasionId)?.name : undefined;
      const res = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 400,
        system: 'Bạn là chuyên gia ẩm thực cỗ Việt. Trả lời 2-3 câu tiếng Việt, ấm áp, vì sao món này hợp với mâm cỗ.',
        messages: [{ role: 'user', content: `Món: ${dish.name}${occ ? `, dịp: ${occ}` : ''}. Vì sao nên có món này trong mâm?` }],
      });
      const block = res.content.find((b) => b.type === 'text') as { text?: string } | undefined;
      if (block?.text) return block.text;
    } catch {
      /* rơi về luật */
    }
  }
  return `${dish.name} là món ${dish.roles.includes('MON_CHINH') ? 'chính' : 'góp mặt'} quen thuộc trong mâm cỗ ${dish.region.includes('BAC') ? 'miền Bắc' : dish.region.includes('NAM') ? 'miền Nam' : 'miền Trung'}, hợp phong tục và cân đối với các món khác.`;
}
