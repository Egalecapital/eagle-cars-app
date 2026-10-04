/**
 * ĐỊNH DẠNG NGÀY GIỜ DÙNG CHUNG
 *
 * Thời gian được lưu dạng ISO 8601 (timestamptz), hiển thị LUÔN theo giờ
 * Việt Nam (Asia/Ho_Chi_Minh), không phụ thuộc múi giờ của thiết bị.
 */
import { formatVnDateTime } from '@/utils/vn-time';

/**
 * Ví dụ: "2026-10-10T02:30:00.000Z" → "09:30 • 10/10/2026" (giờ VN).
 */
export function formatDateTime(iso: string): string {
  return formatVnDateTime(iso);
}
