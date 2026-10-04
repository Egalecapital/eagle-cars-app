/**
 * ĐỊNH DẠNG TIỀN VNĐ DÙNG CHUNG CHO TOÀN BỘ APP
 *
 * Giá tiền luôn được lưu dạng số (ví dụ: 4500000).
 * Chỉ khi hiển thị cho khách mới đổi sang dạng chữ.
 */

/**
 * Đổi số tiền thành chữ có dấu chấm ngăn cách hàng nghìn.
 * Ví dụ: 4500000 → "4.500.000đ"
 */
export function formatVnd(amount: number): string {
  const rounded = Math.round(amount);
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${rounded < 0 ? '-' : ''}${digits}đ`;
}

/**
 * Đổi giá thuê theo ngày thành chữ.
 * Ví dụ: 4500000 → "4.500.000đ/ngày"
 */
export function formatPricePerDay(amount: number): string {
  return `${formatVnd(amount)}/ngày`;
}