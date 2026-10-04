/**
 * QUẦY PHIÊN ĐĂNG NHẬP
 *
 * App chưa có màn đăng nhập. Mỗi thiết bị dùng một user ẩn danh của
 * Supabase (signInAnonymously). User này vẫn có role Postgres
 * `authenticated` và auth.uid() riêng, nên RLS "Đơn của tôi" hoạt động.
 * Sau này có thể nâng cấp lên tài khoản thật mà giữ nguyên user id.
 */

import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export type AppSession = {
  session: Session;
  user: User;
};

export class AuthSessionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AuthSessionError';
  }
}

/**
 * Đảm bảo có phiên đăng nhập: dùng phiên đã lưu nếu có,
 * nếu chưa có thì đăng nhập ẩn danh.
 */
export async function ensureSession(): Promise<AppSession> {
  const { data: existing, error: getSessionError } =
    await supabase.auth.getSession();

  if (getSessionError) {
    throw new AuthSessionError(
      'Không đọc được phiên đăng nhập đã lưu trên thiết bị.',
      { cause: getSessionError }
    );
  }

  if (existing.session) {
    return { session: existing.session, user: existing.session.user };
  }

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    throw new AuthSessionError(
      `Không tạo được phiên ẩn danh với Supabase: ${error.message}. Hãy kiểm tra kết nối mạng và đảm bảo đã bật Anonymous Sign-Ins trong Supabase Dashboard.`,
      { cause: error }
    );
  }

  if (!data.session || !data.user) {
    throw new AuthSessionError(
      'Supabase không trả về phiên đăng nhập sau khi đăng nhập ẩn danh.'
    );
  }

  return { session: data.session, user: data.user };
}
