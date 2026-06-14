/** Quy đổi dương → âm lịch, định dạng tiếng Việt (Phase 6). */
import { Solar } from 'lunar-javascript';
import type { LunarDate } from '@cookafeast/core';

const MONTH_VI = ['', 'Giêng', 'Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín', 'Mười', 'Một', 'Chạp'];

export function toLunarVi(epochMs: number): LunarDate {
  const d = new Date(epochMs);
  const lunar = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()).getLunar();
  const day = lunar.getDay();
  const raw = lunar.getMonth();
  const isLeap = raw < 0;
  const month = Math.abs(raw);
  const dayText = day === 15 ? 'rằm' : day <= 10 ? `mùng ${day}` : `ngày ${day}`;
  const monthName = MONTH_VI[month] ?? String(month);
  return {
    day,
    month,
    isLeap,
    text: `${dayText} tháng ${monthName}${isLeap ? ' (nhuận)' : ''}`,
    ganzhiYear: lunar.getYearInGanZhi(),
  };
}
