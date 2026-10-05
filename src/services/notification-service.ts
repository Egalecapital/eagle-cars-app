/**
 * THÔNG BÁO TRONG APP CỦA KHÁCH (bảng customer_notifications, 0013)
 *
 * - Server tạo thông báo bằng trigger khi trạng thái đơn đổi (xác nhận,
 *   từ chối, huỷ, hết hạn, hoàn tất) — không phụ thuộc app admin đang mở.
 * - Đọc: SELECT, RLS chỉ trả thông báo của chính phiên / tài khoản.
 * - Đánh dấu đã đọc: RPC mark_customer_notifications_read.
 * - Chưa có phiên (chưa từng đặt xe, chưa đăng nhập) → danh sách rỗng,
 *   không tạo phiên mới chỉ để đọc.
 */
import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export type CustomerNotification = {
  id: number;
  bookingId: string | null;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

type CustomerNotificationRow = {
  id: number;
  booking_id: string | null;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export class NotificationError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string, options?: { cause?: unknown }) {
    super(userMessage, options);
    this.name = 'NotificationError';
    this.userMessage = userMessage;
  }
}

function toError(error: PostgrestError): NotificationError {
  return new NotificationError(
    error.code
      ? 'Không tải được thông báo. Vui lòng thử lại sau ít phút.'
      : 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.',
    { cause: error }
  );
}

const listeners = new Set<() => void>();

/** Đăng ký nhận sự kiện "thông báo đã đổi" (đã đọc) để badge cập nhật ngay. */
export function subscribeNotificationChanges(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

async function getSessionUserId(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();

  return data.session?.user.id;
}

/** 100 thông báo mới nhất của chính mình. */
export async function listMyNotifications(): Promise<CustomerNotification[]> {
  const userId = await getSessionUserId();

  if (!userId) return [];

  // Lọc theo user_id: thiết bị admin cũng chỉ thấy thông báo của chính mình.
  const { data, error } = await supabase
    .from('customer_notifications')
    .select('id, booking_id, kind, title, body, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw toError(error);

  return ((data ?? []) as CustomerNotificationRow[]).map((row) => ({
    id: Number(row.id),
    bookingId: row.booking_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

/** Số thông báo chưa đọc (0 khi chưa có phiên hoặc lỗi). */
export async function countUnreadNotifications(): Promise<number> {
  const userId = await getSessionUserId();

  if (!userId) return 0;

  const { count, error } = await supabase
    .from('customer_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  return error ? 0 : (count ?? 0);
}

/** Đánh dấu đã đọc; ids bỏ trống = tất cả. */
export async function markNotificationsRead(ids?: number[]): Promise<void> {
  if (!(await getSessionUserId())) return;

  const { error } = await supabase.rpc('mark_customer_notifications_read', {
    p_ids: ids && ids.length > 0 ? ids : null,
  });

  if (error) throw toError(error);

  emitChange();
}
