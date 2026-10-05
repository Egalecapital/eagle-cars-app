/**
 * TÀI KHOẢN KHÁCH — đăng nhập bằng số điện thoại (OTP qua SMS, Supabase Auth)
 *
 * - Chưa đăng nhập: khách vẫn đặt xe bằng phiên ẩn danh như trước.
 * - Đăng nhập: signInWithOtp({ phone }) → verifyOtp({ type: 'sms' }).
 *   Cùng số điện thoại trên máy khác → cùng tài khoản → cùng "Đơn của tôi".
 * - Mang đơn cũ theo: TRƯỚC khi xác thực OTP, phiên ẩn danh đang mở tạo mã
 *   một lần (RPC create_account_link_token). Sau khi đăng nhập, tài khoản mới
 *   dùng mã đó để nhận đơn (RPC claim_anonymous_bookings). Bằng chứng sở hữu
 *   là việc đang giữ phiên ẩn danh trên máy này — không dùng số điện thoại
 *   hay mã EC, nên không ai chiếm được đơn của người khác.
 * - Quyền admin do database quyết định (admin_users); đăng nhập khách không
 *   bao giờ có quyền admin.
 * - Gửi SMS cần bật Phone provider + nhà cung cấp SMS trong Supabase
 *   Dashboard. Chưa bật → lỗi PHONE_PROVIDER_DISABLED, app báo rõ.
 */
import { AuthError, isAuthRetryableFetchError, type PostgrestError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { unregisterPush } from '@/services/push-service';

export type AccountState =
  | { kind: 'none' }
  | { kind: 'anonymous'; userId: string }
  | { kind: 'phone'; userId: string; phone: string }
  | { kind: 'email'; userId: string; email: string };

export class AccountError extends Error {
  readonly code?: string;
  readonly userMessage: string;

  constructor(userMessage: string, options?: { code?: string; cause?: unknown }) {
    super(options?.code ?? userMessage, { cause: options?.cause });
    this.name = 'AccountError';
    this.code = options?.code;
    this.userMessage = userMessage;
  }
}

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.';

const AUTH_MESSAGES: Record<string, string> = {
  phone_provider_disabled:
    'Đăng nhập bằng số điện thoại chưa được bật. Vui lòng liên hệ Eagle Capital hoặc thử lại sau.',
  sms_send_failed: 'Chưa gửi được tin nhắn mã OTP. Vui lòng thử lại sau ít phút.',
  over_sms_send_rate_limit: 'Bạn đã yêu cầu mã quá nhiều lần. Vui lòng thử lại sau ít phút.',
  over_request_rate_limit: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  otp_expired: 'Mã OTP không đúng hoặc đã hết hạn. Vui lòng kiểm tra hoặc gửi lại mã.',
  otp_disabled: 'Đăng nhập bằng mã OTP đang tạm tắt. Vui lòng thử lại sau.',
  validation_failed: 'Số điện thoại chưa đúng định dạng.',
  user_banned: 'Tài khoản đang bị tạm khoá. Vui lòng liên hệ Eagle Capital.',
};

const RPC_MESSAGES: Record<string, string> = {
  ACTIVE_BOOKINGS:
    'Bạn còn đơn đang chờ xác nhận hoặc đã xác nhận chưa hoàn tất. Hãy huỷ đơn đang chờ, hoặc liên hệ Eagle Capital với đơn đã xác nhận, rồi thử lại.',
  ADMIN_ACCOUNT: 'Tài khoản quản trị không xoá được trong ứng dụng.',
  NOT_AUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  INVALID_TOKEN: 'Mã chuyển đơn đã hết hạn. Các đơn cũ vẫn nằm trên phiên cũ.',
  NOT_ALLOWED: 'Tài khoản này không nhận được đơn cũ.',
};

function fromAuthError(error: unknown): AccountError {
  if (isAuthRetryableFetchError(error)) {
    return new AccountError(NETWORK_MESSAGE, { cause: error });
  }

  const code = error instanceof AuthError ? error.code : undefined;
  const message = code ? AUTH_MESSAGES[code] : undefined;

  if (message) {
    return new AccountError(message, { code, cause: error });
  }

  // Mã OTP sai thường trả 403 / "Token has expired or is invalid".
  if (error instanceof AuthError && error.status === 403) {
    return new AccountError(AUTH_MESSAGES.otp_expired, { code: 'otp_invalid', cause: error });
  }

  return new AccountError('Chưa thực hiện được. Vui lòng thử lại sau ít phút.', { code, cause: error });
}

function fromRpcError(error: PostgrestError): AccountError {
  if (!error.code) return new AccountError(NETWORK_MESSAGE, { cause: error });

  return new AccountError(
    RPC_MESSAGES[error.message] ?? 'Chưa thực hiện được. Vui lòng thử lại sau ít phút.',
    { code: error.message, cause: error }
  );
}

export async function getAccountState(): Promise<AccountState> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;

  if (!user) return { kind: 'none' };
  if (user.is_anonymous) return { kind: 'anonymous', userId: user.id };
  if (user.phone) return { kind: 'phone', userId: user.id, phone: user.phone };

  return { kind: 'email', userId: user.id, email: user.email ?? '' };
}

/** Gửi mã OTP tới số điện thoại (E.164, +84…). */
export async function sendLoginOtp(phoneE164: string): Promise<void> {
  try {
    const { error } = await supabase.auth.signInWithOtp({
      phone: phoneE164,
      options: { shouldCreateUser: true, channel: 'sms' },
    });

    if (error) throw error;
  } catch (error) {
    throw fromAuthError(error);
  }
}

// Mã chuyển đơn của phiên ẩn danh hiện tại (chỉ giữ trong bộ nhớ).
let pendingLink: { sourceUserId: string; token: string; createdAt: number } | undefined;
const LINK_REUSE_MS = 20 * 60 * 1000; // mã sống 30 phút ở server

async function prepareLinkToken(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;

  if (!user?.is_anonymous) return;

  if (
    pendingLink &&
    pendingLink.sourceUserId === user.id &&
    Date.now() - pendingLink.createdAt < LINK_REUSE_MS
  ) {
    return;
  }

  const { data: token, error } = await supabase.rpc('create_account_link_token');

  // Không tạo được mã (mạng, giới hạn) → vẫn cho đăng nhập; đơn cũ ở lại phiên cũ.
  if (!error && typeof token === 'string') {
    pendingLink = { sourceUserId: user.id, token, createdAt: Date.now() };
  }
}

export type LoginResult = {
  /** Số đơn cũ đã chuyển sang tài khoản; undefined = không có phiên ẩn danh cần chuyển. */
  claimedBookings?: number;
  /** Chuyển đơn cũ chưa thành công (có thể thử lại bằng retryClaim). */
  claimError?: string;
};

/** Còn mã chuyển đơn chưa dùng (đăng nhập xong nhưng chuyển đơn lỗi). */
export function hasPendingClaim(): boolean {
  return !!pendingLink;
}

/** Tài khoản hiện tại nhận các đơn của phiên ẩn danh cũ trên máy này. */
export async function retryClaim(): Promise<number> {
  if (!pendingLink) return 0;

  const { data, error } = await supabase.rpc('claim_anonymous_bookings', {
    p_token: pendingLink.token,
  });

  if (error) {
    // Mã không còn dùng được → bỏ, không thử lại vô hạn.
    if (error.message === 'INVALID_TOKEN' || error.message === 'NOT_ALLOWED') {
      pendingLink = undefined;
    }

    throw fromRpcError(error);
  }

  pendingLink = undefined;

  return typeof data === 'number' ? data : 0;
}

/** Xác thực OTP, đăng nhập, rồi mang đơn của phiên ẩn danh cũ theo (nếu có). */
export async function verifyLoginOtp(phoneE164: string, code: string): Promise<LoginResult> {
  await prepareLinkToken();

  try {
    const { error } = await supabase.auth.verifyOtp({
      phone: phoneE164,
      token: code.trim(),
      type: 'sms',
    });

    if (error) throw error;
  } catch (error) {
    throw fromAuthError(error);
  }

  if (!pendingLink) return {};

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return { claimedBookings: await retryClaim() };
    } catch (claimError) {
      if (!pendingLink || attempt === 2) {
        return {
          claimError:
            claimError instanceof AccountError ? claimError.userMessage : NETWORK_MESSAGE,
        };
      }
    }
  }

  return {};
}

/** Đăng xuất: gỡ push token của máy khỏi tài khoản rồi xoá phiên. */
export async function signOutCustomer(): Promise<void> {
  try {
    await unregisterPush();
  } catch {
    // Không chặn đăng xuất vì lỗi mạng khi gỡ token.
  }

  pendingLink = undefined;
  await supabase.auth.signOut();
}

/**
 * Xoá tài khoản (RPC delete_my_account): đơn cũ được giữ cho nghiệp vụ nhưng
 * ẩn danh hoá; thông báo, push token và tài khoản đăng nhập bị xoá.
 */
export async function deleteMyAccount(): Promise<number> {
  try {
    await unregisterPush();
  } catch {
    // Server cũng xoá token theo tài khoản.
  }

  const { data, error } = await supabase.rpc('delete_my_account');

  if (error) throw fromRpcError(error);

  pendingLink = undefined;
  // Tài khoản đã bị xoá ở server: chỉ cần xoá phiên trên máy.
  await supabase.auth.signOut({ scope: 'local' });

  return typeof data === 'number' ? data : 0;
}
