/**
 * QUẢN LÝ YÊU CẦU ĐẶT XE — ADMIN
 *
 * - Đọc: SELECT booking_requests; policy booking_requests_select_admin (0003)
 *   cho admin thấy mọi đơn. Lịch sử: SELECT booking_status_events (0004).
 * - Tìm đơn, theo dõi thông báo Telegram: RPC 0012 (kiểm tra admin bên trong).
 * - Ghi: CHỈ qua RPC (0005, 0006, 0011, 0012). App không có quyền UPDATE trực tiếp.
 * - Quản trị đội xe (thêm / sửa / ảnh / lưu trữ): fleet-admin-service.ts (0018).
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
import type { ServiceTypeKey } from '@/types/car';

const ADMIN_ERROR_MESSAGES: Record<string, string> = {
  NOT_ADMIN: 'Tài khoản không có quyền quản trị. Vui lòng đăng nhập lại.',
  BOOKING_NOT_FOUND: 'Không tìm thấy đơn này.',
  NOT_PENDING: 'Đơn không còn ở trạng thái Chờ xác nhận. Vui lòng tải lại.',
  PICKUP_IN_PAST:
    'Giờ nhận xe đã qua: đơn chờ xác nhận cần giờ nhận ở tương lai (đơn chờ đã quá giờ hãy từ chối).',
  STALE_BOOKING: 'Đơn vừa được thay đổi ở nơi khác. Hãy mở lại đơn rồi sửa lần nữa.',
  NOT_EDITABLE: 'Chỉ sửa được đơn đang chờ hoặc đã xác nhận.',
  NO_CHANGES: 'Chưa có thay đổi nào để lưu.',
  CAR_NOT_AVAILABLE: 'Xe đang tạm ngừng nhận đặt, không thể xác nhận.',
  INVALID_FINAL_TOTAL: 'Giá chốt không hợp lệ.',
  NOTE_TOO_LONG: 'Ghi chú quá dài (ghi chú cho khách tối đa 500 ký tự, ghi chú đơn tối đa 1000 ký tự).',
  REASON_REQUIRED: 'Vui lòng nhập lý do từ chối (ít nhất 3 ký tự).',
  REASON_TOO_LONG: 'Lý do tối đa 500 ký tự.',
  INVALID_STATUS_TRANSITION: 'Không thể chuyển đơn sang trạng thái này.',
  NOT_CONFIRMED: 'Chỉ đơn đã xác nhận mới thao tác được. Vui lòng tải lại.',
  RENTAL_NOT_STARTED: 'Chưa tới giờ nhận xe, chưa thể hoàn tất đơn.',
  INVALID_PRICE: 'Giá/ngày phải từ 1đ đến 1.000.000.000đ.',
  INVALID_ACTIVE: 'Trạng thái cho thuê không hợp lệ.',
  CAR_NOT_FOUND: 'Không tìm thấy xe này.',
  CAR_ARCHIVED: 'Xe đã lưu trữ (ngừng kinh doanh). Bỏ lưu trữ trong XE & GIÁ trước khi dùng lại.',
  SERVICE_NOT_AVAILABLE: 'Xe này không có hình thức thuê đã chọn. Chọn hình thức khác hoặc bật hình thức đó trong XE & GIÁ.',
  INVALID_QUERY: 'Nhập ít nhất 2 ký tự (hoặc 4 chữ số điện thoại), tối đa 100 ký tự.',
  INVALID_STATUS: 'Bộ lọc trạng thái không hợp lệ.',
  INVALID_SERVICE_TYPE: 'Vui lòng chọn hình thức thuê.',
  INVALID_TIME_RANGE: 'Giờ trả xe phải sau giờ nhận xe.',
  PICKUP_TOO_OLD: 'Giờ nhận xe không được sớm hơn 24 giờ trước thời điểm hiện tại.',
  RENTAL_TOO_LONG: 'Mỗi đơn tối đa 30 ngày. Hãy tách thành nhiều đơn.',
  INVALID_LOCATION: 'Địa điểm nhận/trả cần từ 3 đến 300 ký tự.',
  INVALID_NAME: 'Họ tên khách cần từ 2 đến 100 ký tự.',
  INVALID_PHONE: 'Số điện thoại cần 9–11 chữ số.',
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

export function toAdminError(error: PostgrestError): AdminBookingError {
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

/** Xe để chọn khi admin nhập / sửa đơn. */
export type AdminCar = {
  id: string;
  name: string;
  pricePerDay: number;
  isActive: boolean;
  /** 0018: xe đã lưu trữ không nhận đơn mới. */
  archivedAt: string | null;
  /** 0018: hình thức thuê xe này có (server kiểm tra lại khi lưu đơn). */
  serviceTypes: ServiceTypeKey[];
  updatedAt: string;
};

type AdminCarRow = {
  id: string;
  name: string;
  price_per_day: number;
  is_active: boolean;
  archived_at: string | null;
  service_types: string[];
  updated_at: string;
};

const toAdminCar = (row: AdminCarRow): AdminCar => ({
  id: row.id,
  name: row.name,
  pricePerDay: Number(row.price_per_day),
  isActive: row.is_active,
  archivedAt: row.archived_at,
  serviceTypes: row.service_types as ServiceTypeKey[],
  updatedAt: row.updated_at,
});

/** Tất cả xe, kể cả đang tắt / lưu trữ (policy cars_select_admin, 0011). */
export async function listAdminCars(): Promise<AdminCar[]> {
  const { data, error } = await supabase
    .from('cars')
    .select('id, name, price_per_day, is_active, archived_at, service_types, updated_at')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

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
  actor: 'customer' | 'admin' | 'system' | 'legacy' | 'database';
  is_viewer: boolean;
  reason: string | null;
  created_at: string;
};

/**
 * Lịch sử trạng thái của một đơn, cũ trước mới sau (RPC 0013
 * admin_list_booking_status_events). Người thực hiện tính ở server từ
 * admin_users, nên vẫn đúng khi đơn đã chuyển chủ hoặc tài khoản đã xoá.
 */
export async function listBookingStatusEvents(bookingId: string): Promise<BookingStatusEvent[]> {
  if (!UUID_PATTERN.test(bookingId)) {
    return [];
  }

  const { data, error } = await supabase.rpc('admin_list_booking_status_events', {
    p_booking_id: bookingId,
  });

  if (error) {
    throw toAdminError(error);
  }

  return ((data ?? []) as BookingStatusEventRow[]).map((row) => ({
    id: Number(row.id),
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actor: row.actor === 'admin' && row.is_viewer ? 'admin-self' : row.actor,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

export type BookingAccountKind = 'anonymous' | 'phone' | 'email' | 'deleted';

export type BookingAccount = {
  kind: BookingAccountKind;
  /** Số đã xác thực OTP (dạng 84…), chỉ khi kind = phone. */
  verifiedPhone: string | null;
  /** Đơn đã được chuyển từ phiên ẩn danh sang tài khoản. */
  claimed: boolean;
};

/** Loại tài khoản sở hữu đơn (RPC 0013 admin_booking_account). */
export async function getBookingAccount(bookingId: string): Promise<BookingAccount | undefined> {
  if (!UUID_PATTERN.test(bookingId)) return undefined;

  const { data, error } = await supabase.rpc('admin_booking_account', { p_booking_id: bookingId });

  if (error) {
    throw toAdminError(error);
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { account_kind: BookingAccountKind; verified_phone: string | null; claimed: boolean }
    | undefined;

  return row
    ? { kind: row.account_kind, verifiedPhone: row.verified_phone, claimed: row.claimed }
    : undefined;
}

export type BookingCustomerNotification = {
  id: number;
  kind: string;
  title: string;
  createdAt: string;
  readAt: string | null;
  push?: AdminNotification;
};

type BookingCustomerNotificationRow = {
  id: number;
  kind: string;
  title: string;
  created_at: string;
  read_at: string | null;
  push_id: number | null;
  push_status: NotificationStatus | null;
  push_attempts: number | null;
  push_max_attempts: number | null;
  push_last_error: string | null;
  push_sent_at: string | null;
};

/** Thông báo đã gửi cho khách của một đơn + trạng thái push (RPC 0013). */
export async function listBookingCustomerNotifications(
  booking: { id: string; bookingCode: string }
): Promise<BookingCustomerNotification[]> {
  const { data, error } = await supabase.rpc('admin_list_customer_notifications', {
    p_booking_id: booking.id,
  });

  if (error) {
    throw toAdminError(error);
  }

  return ((data ?? []) as BookingCustomerNotificationRow[]).map((row) => ({
    id: Number(row.id),
    kind: row.kind,
    title: row.title,
    createdAt: row.created_at,
    readAt: row.read_at,
    push:
      row.push_id && row.push_status
        ? {
            id: Number(row.push_id),
            channel: 'push',
            bookingId: booking.id,
            bookingCode: booking.bookingCode,
            subtitle: row.title,
            status: row.push_status,
            attempts: row.push_attempts ?? 0,
            maxAttempts: row.push_max_attempts ?? 0,
            lastAttemptAt: null,
            nextAttemptAt: null,
            lastStatusCode: null,
            lastError: row.push_last_error,
            sentAt: row.push_sent_at,
            createdAt: row.created_at,
          }
        : undefined,
  }));
}

export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export type NotificationChannel = 'telegram' | 'push';

export type NotificationSummary = {
  failed: number;
  pending: number;
  overduePending: number;
  sent: number;
  /** Chỉ push: không có thiết bị / thiết bị đã gỡ app. */
  skipped: number;
};

/**
 * Một dòng outbox: Telegram (notification_outbox, 0010) hoặc push cho khách
 * (push_outbox, 0013). Không có token / chat id / nội dung tin Telegram.
 */
export type AdminNotification = {
  id: number;
  channel: NotificationChannel;
  bookingId: string | null;
  bookingCode: string | null;
  /** Telegram: tên xe; push: tiêu đề thông báo gửi khách. */
  subtitle: string;
  status: NotificationStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
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
  channel: 'telegram',
  bookingId: row.booking_id,
  bookingCode: row.booking_code,
  subtitle: row.car_name,
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
    skipped: 0,
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
export async function retryNotification(
  notification: Pick<AdminNotification, 'id' | 'channel'>
): Promise<void> {
  const { error } = await supabase.rpc(
    notification.channel === 'push' ? 'admin_retry_push' : 'admin_retry_notification',
    { p_outbox_id: notification.id }
  );

  if (error) {
    throw toAdminError(error);
  }
}

type PushOutboxRow = {
  id: number;
  booking_id: string | null;
  booking_code: string | null;
  title: string;
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

/** Đếm push cho khách theo trạng thái (RPC 0013). */
export async function getPushSummary(): Promise<NotificationSummary> {
  const { data, error } = await supabase.rpc('admin_push_outbox_summary');

  if (error) {
    throw toAdminError(error);
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        failed_count: number;
        pending_count: number;
        overdue_pending_count: number;
        sent_count: number;
        skipped_count: number;
      }
    | undefined;

  return {
    failed: row?.failed_count ?? 0,
    pending: row?.pending_count ?? 0,
    overduePending: row?.overdue_pending_count ?? 0,
    sent: row?.sent_count ?? 0,
    skipped: row?.skipped_count ?? 0,
  };
}

/** Push cho khách: thất bại trước, rồi đang chờ, đã gửi, bỏ qua (RPC 0013). */
export async function listPushNotifications(options: {
  status?: NotificationStatus;
  limit?: number;
}): Promise<AdminNotification[]> {
  const { data, error } = await supabase.rpc('admin_list_push_outbox', {
    p_status: options.status ?? null,
    p_limit: options.limit ?? 100,
  });

  if (error) {
    throw toAdminError(error);
  }

  return ((data ?? []) as PushOutboxRow[]).map((row) => ({
    id: Number(row.id),
    channel: 'push',
    bookingId: row.booking_id,
    bookingCode: row.booking_code,
    subtitle: row.title,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastAttemptAt: row.last_attempt_at,
    nextAttemptAt: row.next_attempt_at,
    lastStatusCode: row.last_status_code,
    lastError: row.last_error,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  }));
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
  if (code === 'NO_DEVICE') return 'Khách chưa bật thông báo đẩy trên thiết bị nào (vẫn có thông báo trong app).';
  if (code === 'DEVICE_NOT_REGISTERED') return 'Thiết bị của khách đã gỡ app hoặc tắt thông báo.';
  if (code === 'PARTIAL') return 'Đã gửi tới một phần thiết bị của khách.';
  if (code === 'BAD_RESPONSE') return 'Phản hồi từ Expo không đọc được.';
  if (code === 'TICKET_InvalidCredentials') {
    return 'Chưa cấu hình APNs (iOS) / FCM (Android) cho app trên Expo — xem README.';
  }
  if (code.startsWith('TICKET_')) return `Expo từ chối thông báo (${code.slice(7)}).`;
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

export type AdminBookingInput = {
  carId: string;
  /** Giá trị DB: self_drive | with_driver | wedding. */
  serviceType: 'self_drive' | 'with_driver' | 'wedding';
  pickupAt: string;
  returnAt: string;
  pickupLocation: string;
  returnLocation: string;
  customerName: string;
  customerPhone: string;
  note: string;
  finalTotal: number | null;
  /** true = xác nhận ngay (giữ lịch xe); false = để Chờ xác nhận. */
  confirm: boolean;
};

/**
 * Admin nhập đơn ngoài app (khách gọi điện / đến trực tiếp) — RPC 0014.
 * Mặc định xác nhận ngay để giữ lịch xe; trùng đơn đã xác nhận → BOOKING_CONFLICT.
 */
export async function createAdminBooking(input: AdminBookingInput): Promise<BookingRequest> {
  const { data, error } = await supabase.rpc('admin_create_booking', {
    p_car_id: input.carId,
    p_service_type: input.serviceType,
    p_pickup_at: input.pickupAt,
    p_return_at: input.returnAt,
    p_pickup_location: input.pickupLocation.trim(),
    p_return_location: input.returnLocation.trim() || null,
    p_customer_name: input.customerName.trim(),
    p_customer_phone: input.customerPhone.trim(),
    p_customer_note: input.note.trim() || null,
    p_final_total: input.finalTotal,
    p_confirm: input.confirm,
  });

  if (error) {
    throw toAdminError(error);
  }

  return toBookingRequest(data as BookingRequestRow);
}

/** Số đơn đang chờ xác nhận (cho nhãn bộ lọc). */
export async function countPendingBookings(): Promise<number> {
  const { count, error } = await supabase
    .from('booking_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) {
    throw toAdminError(error);
  }

  return count ?? 0;
}

/**
 * Admin sửa đơn đang chờ / đã xác nhận (RPC 0015). Không đổi trạng thái.
 * expectedUpdatedAt: đúng chuỗi updated_at đã đọc (so khớp từng micro giây)
 * → đơn bị đổi ở nơi khác thì STALE_BOOKING.
 */
export async function updateAdminBooking(
  booking: Pick<BookingRequest, 'id' | 'updatedAt'>,
  input: Omit<AdminBookingInput, 'confirm'>
): Promise<BookingRequest> {
  const { data, error } = await supabase.rpc('admin_update_booking', {
    p_booking_id: booking.id,
    p_expected_updated_at: booking.updatedAt,
    p_car_id: input.carId,
    p_service_type: input.serviceType,
    p_pickup_at: input.pickupAt,
    p_return_at: input.returnAt,
    p_pickup_location: input.pickupLocation.trim(),
    p_return_location: input.returnLocation.trim() || null,
    p_customer_name: input.customerName.trim(),
    p_customer_phone: input.customerPhone.trim(),
    p_customer_note: input.note.trim() || null,
    p_final_total: input.finalTotal,
  });

  if (error) {
    throw toAdminError(error);
  }

  return toBookingRequest(data as BookingRequestRow);
}

export type BookingChange = {
  id: number;
  changedBy: string | null;
  /** Khoá: car, pickup_at, return_at, service_type, final_total ([cũ, mới]); location, customer, note (true). */
  changes: Record<string, unknown>;
  createdAt: string;
};

/** Nhật ký chỉnh sửa của một đơn (bảng booking_change_events, 0015; chỉ admin đọc). */
export async function listBookingChanges(bookingId: string): Promise<BookingChange[]> {
  if (!UUID_PATTERN.test(bookingId)) return [];

  const { data, error } = await supabase
    .from('booking_change_events')
    .select('id, changed_by, changes, created_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(100);

  if (error) {
    throw toAdminError(error);
  }

  return (
    (data ?? []) as { id: number; changed_by: string | null; changes: Record<string, unknown>; created_at: string }[]
  ).map((row) => ({
    id: Number(row.id),
    changedBy: row.changed_by,
    changes: row.changes,
    createdAt: row.created_at,
  }));
}

/**
 * Đơn ĐÃ XÁC NHẬN có giờ nhận trước cuối ngày hôm nay (giờ VN): gồm đơn nhận
 * hôm nay, đang cho thuê, trả hôm nay và quá giờ trả chưa hoàn tất — cho bảng
 * "Hôm nay" của admin (phân nhóm phía app).
 */
export async function listTodayOperations(to: Date): Promise<BookingRequest[]> {
  const { data, error } = await supabase
    .from('booking_requests')
    .select(BOOKING_COLUMNS)
    .eq('status', 'confirmed')
    .lt('pickup_at', to.toISOString())
    .order('pickup_at', { ascending: true })
    .limit(200);

  if (error) {
    throw toAdminError(error);
  }

  return ((data ?? []) as unknown as BookingRequestRow[]).map(toBookingRequest);
}
