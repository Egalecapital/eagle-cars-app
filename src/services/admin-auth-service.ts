/**
 * PHIÊN ĐĂNG NHẬP ADMIN
 *
 * Admin đăng nhập bằng email + mật khẩu (Supabase Auth). Quyền admin do
 * database quyết định: public.admin_users + public.is_admin() (0003).
 * Mọi kiểm tra ở app chỉ phục vụ giao diện; RLS và RPC mới là lớp bảo mật.
 *
 * Lưu ý: đăng nhập admin thay thế phiên khách ẩn danh trên thiết bị này.
 */

import { isAuthRetryableFetchError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export class AdminAuthError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string, options?: { cause?: unknown }) {
    super(userMessage, options);
    this.name = 'AdminAuthError';
    this.userMessage = userMessage;
  }
}

/** true khi phiên hiện tại là tài khoản (không ẩn danh) có trong admin_users. */
export async function checkIsAdmin(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;

  if (!user || user.is_anonymous) {
    return false;
  }

  const { data: isAdmin, error } = await supabase.rpc('is_admin');

  if (error) {
    throw new AdminAuthError(
      error.code
        ? 'Không kiểm tra được quyền quản trị. Vui lòng thử lại.'
        : 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng.',
      { cause: error }
    );
  }

  return isAdmin === true;
}

/** Email của phiên hiện tại (để hiển thị). */
export async function getCurrentEmail(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();

  return data.session?.user.email ?? undefined;
}

export async function signInAdmin(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw new AdminAuthError(
      isAuthRetryableFetchError(error)
        ? 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng.'
        : 'Email hoặc mật khẩu không đúng.',
      { cause: error }
    );
  }

  if (!(await checkIsAdmin())) {
    await supabase.auth.signOut();
    throw new AdminAuthError('Tài khoản này không có quyền quản trị.');
  }
}

export async function signOutAdmin(): Promise<void> {
  await supabase.auth.signOut();
}
