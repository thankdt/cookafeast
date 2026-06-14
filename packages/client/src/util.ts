import { useEffect, useState } from 'react';

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('vi-VN', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** Đếm ngược dạng "2 giờ 15 phút" / "45 phút" / "đã tới giờ". */
export function countdown(toMs: number, nowMs: number): string {
  const diff = Math.round((toMs - nowMs) / 60000);
  if (diff <= 0) return 'đã tới giờ';
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h > 0) return `${h} giờ ${m} phút`;
  return `${m} phút`;
}

export function formatVnd(n?: number): string {
  if (n == null) return '';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ';
}

export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(n < 1 ? 2 : 1).replace(/\.0$/, '');
}

/** datetime-local string -> epoch ms */
export function dtLocalToMs(s: string): number {
  return new Date(s).getTime();
}

/** epoch ms -> datetime-local value */
export function msToDtLocal(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

/** Hook trả về thời điểm hiện tại, tự cập nhật mỗi `intervalMs`. */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
