import type { BookingRequest } from '@/types/booking';
import { formatVnd } from '@/utils/format-price';

export type BookingPriceView = {
  label: string;
  amount: number;
  note: string;
};

/**
 * Cách hiển thị giá cho khách. "Giá chính thức" CHỈ khi đơn đã xác nhận /
 * hoàn tất — admin có thể ghi giá cho đơn đang chờ (0014/0015), lúc đó vẫn
 * chưa phải giá đã xác nhận.
 */
export function bookingPriceView(
  request: Pick<BookingRequest, 'status' | 'finalTotal' | 'estimatedTotal'>
): BookingPriceView {
  const { status, finalTotal, estimatedTotal } = request;

  if (finalTotal !== null && (status === 'confirmed' || status === 'completed')) {
    return {
      label: 'Giá chính thức',
      amount: finalTotal,
      note: `Đã được Eagle Capital xác nhận. Tổng dự kiến ban đầu: ${formatVnd(estimatedTotal)}.`,
    };
  }

  if (finalTotal !== null && status === 'pending') {
    return {
      label: 'Giá Eagle Capital báo',
      amount: finalTotal,
      note: 'Đơn chưa được xác nhận. Giá chính thức được chốt khi Eagle Capital xác nhận đơn.',
    };
  }

  if (finalTotal !== null) {
    return {
      label: 'Giá đã chốt',
      amount: finalTotal,
      note: 'Đơn không còn hiệu lực.',
    };
  }

  return {
    label: 'Tổng dự kiến',
    amount: estimatedTotal,
    note: 'Giá dự kiến. Eagle Capital sẽ xác nhận giá chính thức khi liên hệ.',
  };
}
