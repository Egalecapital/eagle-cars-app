/**
 * GIỜ VIỆT NAM (Asia/Ho_Chi_Minh) — dùng chung cho đặt xe và Lịch xe.
 *
 * Việt Nam luôn là UTC+7, không có giờ mùa hè, nên tính trực tiếp bằng UTC
 * (không phụ thuộc múi giờ của thiết bị hay Intl của Hermes).
 * Database lưu timestamptz (thời điểm tuyệt đối); module này chỉ quyết định
 * cách app TẠO thời điểm từ giờ VN và HIỂN THỊ thời điểm theo giờ VN.
 */

export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const pad = (value: number) => String(value).padStart(2, '0');

type VnParts = {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Chủ nhật
};

/** Thành phần ngày giờ của một thời điểm theo giờ VN. */
export function toVnParts(date: Date): VnParts {
  const shifted = new Date(date.getTime() + VN_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** 'YYYY-MM-DD' theo giờ VN. */
export function vnDateKey(date: Date): string {
  const p = toVnParts(date);

  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Thời điểm tuyệt đối của 'YYYY-MM-DD' + 'HH:MM' theo giờ VN. */
export function vnWallTimeToDate(dateKey: string, time: string): Date | undefined {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);

  if ([year, month, day, hour, minute].some((n) => !Number.isFinite(n))) {
    return undefined;
  }

  // Date.UTC tự xử lý giờ âm (vd 05:00 VN = 22:00 UTC ngày hôm trước).
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - VN_OFFSET_MS);
}

/** 00:00 giờ VN của một ngày 'YYYY-MM-DD'. */
export function vnDayStart(dateKey: string): Date {
  return vnWallTimeToDate(dateKey, '00:00') as Date;
}

/** Cộng n ngày vào 'YYYY-MM-DD'. */
export function addDaysToKey(dateKey: string, days: number): string {
  return vnDateKey(new Date(vnDayStart(dateKey).getTime() + days * MS_PER_DAY));
}

/** 'T2', 'CN'… của một ngày 'YYYY-MM-DD'. */
export function vnWeekday(dateKey: string): string {
  return WEEKDAYS[toVnParts(vnDayStart(dateKey)).weekday];
}

/** 'DD/MM' của một ngày 'YYYY-MM-DD'. */
export function vnDayMonth(dateKey: string): string {
  const [, month, day] = dateKey.split('-');

  return `${day}/${month}`;
}

/** 'HH:MM' theo giờ VN. */
export function formatVnTime(date: Date): string {
  const p = toVnParts(date);

  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** 'HH:MM • DD/MM/YYYY' theo giờ VN. */
export function formatVnDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const p = toVnParts(date);

  return `${pad(p.hour)}:${pad(p.minute)} • ${pad(p.day)}/${pad(p.month)}/${p.year}`;
}
