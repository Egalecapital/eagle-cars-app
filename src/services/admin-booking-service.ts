/**
 * QUẢN LÝ YÊU CẦU ĐẶT XE — ADMIN
 *
 * - Đọc: SELECT booking_requests; policy booking_requests_select_admin (0003)
 *   cho admin thấy mọi đơn. Lịch sử: SELECT booking_status_events (0004).
 * - Tìm đơn, theo dõi thông báo Telegram: RPC 0012 (kiểm tra admin bên trong).
 * - Ghi: CHỈ qua RPC (0005, 0006, 0011, 0012). App không có quyền UPDATE trực tiếp.
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
  INVALID_QUERY: 'Nhập ít nhất 2 ký tự (hoặc 4 chữ số điện thoại), tối đa 100 ký tự.',
  INVALID_STATUS: 'Bộ lọc trạng thái không hợp lệ.',
  NOTIFICATION_NOT_FOUND: 'Không tìm thấy thông báo này.',
  NOTIFICATION_NOT_FAILED: 'Thông báo không còn ở trạng thái thất bại. Vui lòng tải lại.',
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

export const SEARCH_RESULT_LIMIT = 20;

/**
 * Chuỗi tìm hợp lệ theo cùng quy tắc với RPC 0012 (2..100 ký tự; chuỗi
 * dạng số điện thoại cần ≥ 4 chữ số). Chỉ để không gọi server vô ích.
 */
export function isSearchableQuery(term: string): boolean {
  const value = term.trim();

  if (value.length < 2 || value.length > 100) return false;

  if (/^[0-9\s.+()-]+$/.test(value)) {
    return value.replace(/\D/g, '').length >= 4;
  }

  return true;
}

/**
 * Tìm đơn theo mã EC, số điện thoại (mọi định dạng, cả 4 số đuôi) hoặc tên
 * khách (RPC 0012). Mọi trạng thái, mới nhất trước, tối đa SEARCH_RESULT_LIMIT.
 */
export async function searchAdminBookingRequests(term: string): Promise<BookingRequest[]> {
  const { data, error } = await supabase.rpc('admin_search_booking_requests', {
    p_query: term.trim(),
    p_limit: SEARCH_RESULT_LIMIT,
  });

  if (error) {
    throw toAdminError(error);
  }

  return ((data ?? []) as BookingRequestRow[]).map(toBookingRequest);
}

/** Ai gây ra một thay đổi trạng thái (suy từ booking_status_events). */
export type BookingEventActor =
  | 'customer'
  | 'admin-self'
  | 'admin'
  | 'system'
  | 'legacy'
  | 'database';

export type BookingStatusEvent = {
  id: number;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actor: BookingEventActor;
  reason: string | null;
  createdAt: string;
};

type BookingStatusEventRow = {
  id: number;
  from_status: BookingStatus | null;
  to_status: BookingStatus;
  changed_by: string | null;
  actor_role: string;
  reason: string | null;
  created_at: string;
};

function toEventActor(
  row: BookingStatusEventRow,
  customerId: string | undefined,
  viewerId: string | undefined
): BookingEventActor {
  // Hết hạn luôn là quy tắc tự động (cron 0012, hoặc khi ai đó mở app — 0006).
  if (row.to_status === 'expired') return 'system';
  if (row.actor_role === 'migration_0004') return 'legacy';
  if (!row.changed_by) return 'database';
  if (customerId && row.changed_by === customerId) return 'customer';
  if (viewerId && row.changed_by === viewerId) return 'admin-self';

  // Chỉ chủ đơn hoặc admin đổi được trạng thái qua RPC.
  return 'admin';
}

/**
 * Lịch sử trạng thái của một đơn, cũ trước mới sau. Admin đọc nhờ policy
 * booking_status_events_select_admin (0004); khách không đọc được.
 */
export async function listBookingStatusEvents(bookingId: string): Promise<BookingStatusEvent[]> {
  if (!UUID_PATTERN.test(bookingId)) {
    return [];
  }

  const [eventsResult, bookingResult, sessionResult] = await Promise.all([
    supabase
      .from('booking_status_events')
      .select('id, from_status, to_status, changed_by, actor_role, reason, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(100),
    supabase.from('booking_requests').select('user_id').eq('id', bookingId).maybeSingle(),
    supabase.auth.getSession(),
  ]);

  if (eventsResult.error) {
    throw toAdminError(eventsResult.error);
  }

  if (bookingResult.error) {
    throw toAdminError(bookingResult.error);
  }

  const customerId = (bookingResult.data as { user_id: string } | null)?.user_id;
  const viewerId = sessionResult.data.session?.user.id;

  return ((eventsResult.data ?? []) as BookingStatusEventRow[]).map((row) => ({
    id: Number(row.id),
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actor: toEventActor(row, customerId, viewerId),
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

export type NotificationStatus = 'pending' | 'sent' | 'failed';

export type NotificationSummary = {
  failed: number;
  pending: number;
  overduePending: number;
  sent: number;
};

/** Một dòng notification_outbox (0010) — không có token / chat id / nội dung tin. */
export type AdminNotification = {
  id: number;
  bookingId: string;
  bookingCode: string;
  carName: string;
  status: NotificationStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string;
  lastStatusCode: number | null;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
};

type AdminNotificationRow = {
  id: number;
  booking_id: string;
  booking_code: string;
  car_name: string;
  status: NotificationStatus;
  attempts: number;
  max_attempts: number;
  last_attempt_at: string | null;
  next_attempt_at: string;
  last_status_code: number | null;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
};

const toAdminNotification = (row: AdminNotificationRow): AdminNotification => ({
  id: Number(row.id),
  bookingId: row.booking_id,
  bookingCode: row.booking_code,
  carName: row.car_name,
  status: row.status,
  attempts: row.attempts,
  maxAttempts: row.max_attempts,
  lastAttemptAt: row.last_attempt_at,
  nextAttemptAt: row.next_attempt_at,
  lastStatusCode: row.last_status_code,
  lastError: row.last_error,
  sentAt: row.sent_at,
  createdAt: row.created_at,
});

/** Đếm thông báo Telegram theo trạng thái (RPC 0012). */
export async function getNotificationSummary(): Promise<NotificationSummary> {
  const { data, error } = await supabase.rpc('admin_notification_outbox_summary');

  if (error) {
    throw toAdminError(error);
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        failed_count: number;
        pending_count: number;
        overdue_pending_count: number;
        sent_count: number;
      }
    | undefined;

  return {
    failed: row?.failed_count ?? 0,
    pending: row?.pending_count ?? 0,
    overduePending: row?.overdue_pending_count ?? 0,
    sent: row?.sent_count ?? 0,
  };
}

/**
 * Thông báo Telegram: thất bại trước, rồi đang chờ, rồi đã gửi (RPC 0012).
 * status undefined = tất cả; bookingId lọc theo một đơn.
 */
export async function listNotifications(options: {
  status?: NotificationStatus;
  bookingId?: string;
  limit?: number;
}): Promise<AdminNotification[]> {
  const { data, error } = await supabase.rpc('admin_list_notification_outbox', {
    p_status: options.status ?? null,
    p_booking_id: options.bookingId ?? null,
    p_limit: options.limit ?? 100,
  });

  if (error) {
    throw toAdminError(error);
  }

  return ((data ?? []) as AdminNotificationRow[]).map(toAdminNotification);
}

/**
 * Gửi lại thông báo đã thất bại (RPC 0012): đưa về hàng đợi, pg_cron gửi
 * trong vòng khoảng 1 phút. Có thể trùng tin nếu Telegram thật ra đã nhận.
 */
export async function retryNotification(id: number): Promise<void> {
  const { error } = await supabase.rpc('admin_retry_notification', { p_outbox_id: id });

  if (error) {
    throw toAdminError(error);
  }
}

/** Mã lỗi cố định trong outbox (0010/0012) → mô tả cho admin. */
export function describeNotificationError(code: string | null): string | undefined {
  if (!code) return undefined;

  if (code === 'MANUAL_RETRY') return 'Đã yêu cầu gửi lại, chờ lượt gửi kế tiếp (≤ 1 phút).';
  if (code === 'CONFIG_INVALID') return 'Cấu hình Telegram trong Supabase Vault thiếu hoặc sai.';
  if (code === 'NO_RESPONSE') return 'Không nhận được phản hồi từ Telegram.';
  if (code === 'TIMEOUT') return 'Hết thời gian chờ Telegram phản hồi.';
  if (code === 'NETWORK_ERROR') return 'Lỗi mạng khi gọi Telegram.';
  if (code === 'TELEGRAM_NOT_OK') return 'Telegram từ chối tin nhắn.';
  if (code === 'RATE_LIMITED') return 'Telegram tạm giới hạn tần suất gửi.';
  if (code === 'MAX_ATTEMPTS') return 'Đã hết số lần thử tự động.';
  if (code.startsWith('SEND_ERROR_')) return `Lỗi khi gửi (mã ${code.slice(11)}).`;
  if (code.startsWith('PROCESS_ERROR_')) return `Lỗi xử lý hàng đợi (mã ${code.slice(14)}).`;

  const http = /^HTTP_(\d{3})$/.exec(code);

  if (http) {
    const status = Number(http[1]);

    if (status === 401 || status === 403 || status === 404) {
      return `Telegram trả lỗi ${status} — thường do bot token sai hoặc bot bị chặn.`;
    }

    if (status === 400) return 'Telegram trả lỗi 400 — thường do chat id sai.';

    return status >= 500 ? `Máy chủ Telegram lỗi (${status}).` : `Telegram trả lỗi ${status}.`;
  }

  return code;
}
