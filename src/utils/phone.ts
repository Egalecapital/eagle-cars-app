/**
 * SỐ ĐIỆN THOẠI VIỆT NAM
 *
 * Chấp nhận: 0912345678, 0912 345 678, 0912.345.678, +84912345678,
 * 84912345678, +84 912 345 678. Chỉ số di động (đầu 3, 5, 7, 8, 9 sau mã
 * quốc gia), 9 chữ số sau +84.
 */

/** Chuẩn E.164 (+84xxxxxxxxx) hoặc undefined nếu không phải số di động VN hợp lệ. */
export function normalizeVnMobile(input: string): string | undefined {
  const trimmed = input.trim();

  if (!/^[0-9\s.+()-]+$/.test(trimmed)) return undefined;

  let digits = trimmed.replace(/\D/g, '');

  if (digits.startsWith('84') && digits.length === 11) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 10) {
    digits = digits.slice(1);
  } else {
    return undefined;
  }

  if (!/^[35789]\d{8}$/.test(digits)) return undefined;

  return `+84${digits}`;
}

/**
 * Hiển thị dạng 0912 345 678. Nhận E.164 (+84…), dạng Supabase Auth lưu
 * (84…), hoặc 0… ; không nhận ra thì trả nguyên chuỗi.
 */
export function formatVnPhone(value: string | null | undefined): string {
  if (!value) return '';

  const e164 = normalizeVnMobile(value.startsWith('84') ? `+${value}` : value);

  if (!e164) return value;

  const local = `0${e164.slice(3)}`;

  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
