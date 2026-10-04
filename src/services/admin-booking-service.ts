/**
 * QUẢN LÝ YÊU CẦU ĐẶT XE — ADMIN
 *
 * - Đọc: SELECT booking_requests; policy booking_requests_select_admin (0003)
 *   cho admin thấy mọi đơn.
 * - Ghi: CHỈ qua RPC 0005 (admin_confirm_booking_request,
 *   admin_reject_booking_request). App không có quyền UPDATE trực tiếp.
 */

import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import {
  BOOKING_COLUMNS,
  type BookingRequestRow,
  toBookingRequest,
  UUID_PATTERN,
} from '@/services/booking-service';
import type { BookingRequest, BookingStatus } from '@/types/booking';

const ADMIN_ERROR_MESSAGES: Record<string, string> = {
  NOT_ADMIN: 'Tài khoản không có quyền quản trị. Vui lòng đăng nhập lại.',
  BOOKING_NOT_FOUND: 'Không tìm thấy đơn này.',
  NOT_PENDING: 'Đơn không còn ở trạng thái Chờ xác nhận. Vui lòng tải lại.',
  PICKUP_IN_PAST: 'Đơn đã quá giờ nhận xe, không thể xác nhận. Hãy từ chối đơn.',
  CAR_NOT_AVAILABLE: 'Xe đang tạm ngừng nhận đặt, không thể xác nhận.',
  INVALID_FINAL_TOTAL: 'Giá chốt không hợp lệ.',
  NOTE_TOO_LONG: 'Ghi chú tối đa 500 ký tự.',
  REASON_REQUIRED: 'Vui lòng nhập lý do từ chối (ít nhất 3 ký tự).',
  REASON_TOO_LONG: 'Lý do tối đa 500 ký tự.',
  INVALID_STATUS_TRANSITION: 'Không thể chuyển đơn sang trạng thái này.',
  NOT_CONFIRMED: 'Chỉ đơn đã xác nhận mới thao tác được. Vui lòng tải lại.',
  RENTAL_NOT_STARTED: 'Chưa tới giờ nhận xe, chưa thể hoàn tất đơn.',
  INVALID_PRICE: 'Giá/ngày phải từ 1đ đến 1.000.000.000đ.',
  INVALID_ACTIVE: 'Trạng thái cho thuê không hợp lệ.',
  CAR_NOT_FOUND: 'Không tìm thấy xe này.',
};

const NETWORK_ERROR_MESSAGE =
  'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.';

const GENERIC_ERROR_MESSAGE = 'Thao tác chưa thành công. Vui lòng thử lại.';

export class AdminBookingError extends Error {
  readonly code?: string;
  readonly userMessage: string;

  constructor(userMessage: string, options?: { code?: string; cause?: unknown }) {
    super(options?.code ?? userMessage, { cause: options?.cause });
    this.name = 'AdminBookingError';
    this.code = options?.code;
    this.userMessage = userMessage;
  }
}

function toAdminError(error: PostgrestError): AdminBookingError {
  if (!error.code) {
    return new AdminBookingError(NETWORK_ERROR_MESSAGE, { cause: error });
  }

  if (error.message === 'BOOKING_CONFLICT') {
    const code = error.details?.match(/EC-[0-9A-Z]{8}/)?.[0];

    return new AdminBookingError(
      code
        ? `Xe đã có đơn ${code} được xác nhận trùng thời gian.`
        : 'Xe đã có đơn khác được xác nhận trùng thời gian.',
      { code: error.message, cause: error }
    );
  }

  const message = ADMIN_ERROR_MESSAGES[error.message];

  if (message) {
    return new AdminBookingError(message, { code: error.message, cause: error });
  }

  if (error.code === '42501') {
    return new AdminBookingError(ADMIN_ERROR_MESSAGES.NOT_ADMIN, {
      code: error.code,
      cause: error,
    });
  }

  return new AdminBookingError(GENERIC_ERROR_MESSAGE, { code: error.code, cause: error });
}

export type AdminStatusFilter = BookingStatus | 'all';

/** Danh sách đơn cho admin: đơn chờ xác nhận lên đầu, sau đó mới nhất trước. */
export async function listAdminBookingRequests(
  filter: AdminStatusFilter
): Promise<BookingRequest[]> {
  await expireStaleBookingRequests();

  let query = supabase
    .from('booking_requests')
    .select(BOOKING_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);

  if (filter !== 'all') {
    query = query.eq('status', filter);
  }

  const { data, error } = await query;

  if (error) {
    throw toAdminError(error);
  }

  const requests = ((data ?? []) as unknown as BookingRequestRow[]).map(toBookingRequest);

  return requests.sort(
    (a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')
  );
}

export async function getAdminBookingRequest(
  id: string
): Promise<BookingRequest | undefined> {
  if (!UUID_PATTERN.test(id)) {
    return undefined;
  }

  const { data, error } = await supabase
    .from('booking_requests')
    .select(BOOKING_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw toAdminError(error);
  }

  return data ? toBookingRequest(data as unknown as BookingRequestRow) : undefined;
}

/**
 * Xác nhận đơn (RPC 0005). finalTotal bỏ trống → server lưu estimated_total.
 * note (tuỳ chọn) khách nhìn thấy.
 */
export async function confirmAdminBookingRequest(
  id: string,
  finalTotal: number | null,
  note: string
): Promise<BookingRequest> {
  const { data, error } = await supabase.rpc('admin_confirm_booking_request', {
    p_booking_id: id,
    p_final_total: finalTotal,
    p_note: note.trim() ? note.trim() : null,
  });

  if (error) {
    throw toAdminError(error);
  }

  return toBookingRequest(data as BookingRequestRow);
}

/** Từ chối đơn (RPC 0005). reason bắt buộc, khách nhìn thấy. */
export async function rejectAdminBookingRequest(
  id: string,
  reason: string
): Promise<BookingRequest> {
  const { data, error } = await supabase.rpc('admin_reject_booking_request', {
    p_booking_id: id,
    p_reason: reason,
  });

  if (error) {
    throw toAdminError(error);
  }

  return toBookingRequest(data as BookingRequestRow);
}

/**
 * Hoàn tất đơn đã xác nhận (RPC 0006). Chỉ khi đã tới giờ nhận xe.
 * note (tuỳ chọn) thay ghi chú hiện có; khách nhìn thấy.
 */
export async function completeAdminBookingRequest(
  id: string,
  note: string
): Promise<BookingRequest> {
  const { data, error } = await supabase.rpc('admin_complete_booking_request', {
    p_booking_id: id,
    p_note: note.trim() ? note.trim() : null,
  });

  if (error) {
    throw toAdminError(error);
  }

  return toBookingRequest(data as BookingRequestRow);
}

/** Huỷ đơn đã xác nhận (RPC 0006). reason bắt buộc, khách nhìn thấy. */
export async function cancelAdminBookingRequest(
  id: string,
  reason: string
): Promise<BookingRequest> {
  const { data, error } = await supabase.rpc('admin_cancel_booking_request', {
    p_booking_id: id,
    p_reason: reason,
  });

  if (error) {
    throw toAdminError(error);
  }

  return toBookingRequest(data as BookingRequestRow);
}

/**
 * Đánh dấu hết hạn các đơn pending đã quá giờ nhận (RPC 0006).
 * Không chặn việc tải danh sách: lỗi (kể cả khi 0006 chưa chạy) bị bỏ qua.
 */
export async function expireStaleBookingRequests(): Promise<void> {
  await supabase.rpc('expire_stale_booking_requests');
}

export type AdminCar = {
  id: string;
  name: string;
  pricePerDay: number;
  isActive: boolean;
  updatedAt: string;
};

type AdminCarRow = {
  id: string;
  name: string;
  price_per_day: number;
  is_active: boolean;
  updated_at: string;
};

const toAdminCar = (row: AdminCarRow): AdminCar => ({
  id: row.id,
  name: row.name,
  pricePerDay: Number(row.price_per_day),
  isActive: row.is_active,
  updatedAt: row.updated_at,
});

/** Tất cả xe, kể cả đang tắt (policy cars_select_admin, 0011). */
export async function listAdminCars(): Promise<AdminCar[]> {
  const { data, error } = await supabase
    .from('cars')
    .select('id, name, price_per_day, is_active, updated_at')
    .order('name', { ascending: true });

  if (error) {
    throw toAdminError(error);
  }

  return ((data ?? []) as AdminCarRow[]).map(toAdminCar);
}

/** Số đơn ĐÃ XÁC NHẬN chưa kết thúc của một xe (để cảnh báo trước khi tắt xe). */
export async function countUpcomingConfirmed(carId: string): Promise<number> {
  const { count, error } = await supabase
    .from('booking_requests')
    .select('id', { count: 'exact', head: true })
    .eq('car_id', carId)
    .eq('status', 'confirmed')
    .gt('return_at', new Date().toISOString());

  if (error) {
    throw toAdminError(error);
  }

  return count ?? 0;
}

/**
 * Đổi giá / bật-tắt xe (RPC 0011). Không ảnh hưởng đơn đã tạo
 * (mỗi đơn lưu price_per_day lúc đặt).
 */
export async function updateAdminCar(
  carId: string,
  pricePerDay: number,
  isActive: boolean
): Promise<AdminCar> {
  const { data, error } = await supabase.rpc('admin_update_car', {
    p_car_id: carId,
    p_price_per_day: pricePerDay,
    p_is_active: isActive,
  });

  if (error) {
    throw toAdminError(error);
  }

  return toAdminCar(data as AdminCarRow);
}

/**
 * Lịch của một xe trong [from, to): đơn confirmed (giữ lịch) và pending
 * (chưa giữ lịch). Admin đọc nhờ policy booking_requests_select_admin (0003).
 */
export async function listCarSchedule(
  carId: string,
  from: Date,
  to: Date
): Promise<BookingRequest[]> {
  const { data, error } = await supabase
    .from('booking_requests')
    .select(BOOKING_COLUMNS)
    .eq('car_id', carId)
    .in('status', ['confirmed', 'pending'])
    .gt('return_at', from.toISOString())
    .lt('pickup_at', to.toISOString())
    .order('pickup_at', { ascending: true })
    .limit(500);

  if (error) {
    throw toAdminError(error);
  }

  return ((data ?? []) as unknown as BookingRequestRow[]).map(toBookingRequest);
}
