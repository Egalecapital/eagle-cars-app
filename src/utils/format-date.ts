/**
 * ĐỊNH DẠNG NGÀY GIỜ DÙNG CHUNG
 *
 * Thời gian được lưu dạng ISO 8601, chỉ đổi sang chữ khi hiển thị.
 */

/**
 * Ví dụ: "2026-10-10T02:30:00.000Z" → "09:30 • 10/10/2026" (theo giờ máy).
 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');

  return `${hh}:${min} • ${dd}/${mm}/${date.getFullYear()}`;
}
