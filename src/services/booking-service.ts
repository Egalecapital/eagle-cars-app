/**
 * QUẦY XỬ LÝ YÊU CẦU ĐẶT XE — kết nối Supabase
 *
 * - Tạo yêu cầu: RPC public.create_booking_request (0001_init.sql).
 *   Server tự lấy giá, tính số ngày, tổng tiền, tạo booking_code và
 *   đặt status = 'pending'. App không gửi các giá trị này.
 * - Đọc "Đơn của tôi": SELECT bảng public.booking_requests; RLS chỉ trả
 *   các đơn có user_id = auth.uid() của phiên ẩn danh trên thiết bị.
 * - Không có quyền INSERT/UPDATE/DELETE trực tiếp từ app.
 */

import { isAuthRetryableFetchError, type PostgrestError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { AuthSessionError, ensureSession } from '@/services/auth-service';
import type {
  BookingRequest,
  BookingRequestInput,
  BookingStatus,
} from '@/types/booking';
import type { ServiceType } from '@/types/car';

const SERVICE_TYPE_TO_DB: Record<ServiceType, string> = {
  'Tự lái': 'self_drive',
  'Có lái': 'with_driver',
  'Xe cưới': 'wedding',
};

const SERVICE_TYPE_FROM_DB: Record<string, ServiceType> = {
  self_drive: 'Tự lái',
  with_driver: 'Có lái',
  wedding: 'Xe cưới',
};

export const BOOKING_COLUMNS =
  'id, booking_code, car_id, car_name, service_type, pickup_at, return_at, ' +
  'pickup_location, return_location, customer_name, customer_phone, ' +
  'customer_note, price_per_day, rental_days, estimated_total, final_total, ' +
  'status, status_reason, source, created_at, updated_at';

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Một dòng public.booking_requests (các cột app cần). */
export type BookingRequestRow = {
  id: string;
  booking_code: string;
  car_id: string;
  car_name: string;
  service_type: string;
  pickup_at: string;
  return_at: string;
  pickup_location: string;
  return_location: string;
  customer_name: string;
  customer_phone: string;
  customer_note: string | null;
  price_per_day: number;
  rental_days: number;
  estimated_total: number;
  final_total: number | null;
  status: BookingStatus;
  status_reason: string | null;
  /** 0014: 'app' = khách gửi qua app, 'admin' = admin nhập đơn ngoài app. */
  source?: 'app' | 'admin';
  created_at: string;
  updated_at: string;
};

/** Mã lỗi do RPC raise trong 0001_init.sql → thông báo cho khách. */
const BACKEND_ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED:
    'Phiên kết nối đã hết hạn. Vui lòng đóng hẳn ứng dụng, mở lại rồi thử gửi lại.',
  CAR_NOT_AVAILABLE: 'Xe này hiện chưa nhận đặt. Vui lòng chọn xe khác.',
  CAR_ARCHIVED: 'Xe này đã ngừng kinh doanh. Vui lòng chọn xe khác.',
  SERVICE_NOT_AVAILABLE: 'Xe này không có hình thức thuê đã chọn. Vui lòng chọn lại hình thức thuê.',
  INVALID_SERVICE_TYPE: 'Hình thức thuê không hợp lệ. Vui lòng chọn lại.',
  INVALID_TIME_RANGE: 'Thời gian trả xe phải sau thời gian nhận xe.',
  PICKUP_IN_PAST: 'Thời gian nhận xe phải sau thời điểm hiện tại.',
  RENTAL_TOO_LONG: 'Mỗi yêu cầu chỉ được thuê tối đa 30 ngày.',
  INVALID_LOCATION: 'Địa điểm nhận/trả xe cần từ 3 đến 300 ký tự.',
  INVALID_NAME: 'Họ và tên cần từ 2 đến 100 ký tự.',
  INVALID_PHONE: 'Số điện thoại chưa đúng. Vui lòng kiểm tra lại.',
  NOTE_TOO_LONG: 'Ghi chú tối đa 1000 ký tự.',
  TOO_MANY_PENDING:
    'Bạn đang có 5 yêu cầu chờ xác nhận. Vui lòng chờ Eagle Capital liên hệ hoặc huỷ bớt yêu cầu cũ.',
  CAR_ALREADY_BOOKED:
    'Xe đã có lịch trong khoảng thời gian này. Vui lòng chọn thời gian hoặc xe khác.',
  BOOKING_NOT_FOUND: 'Không tìm thấy yêu cầu này.',
  DUPLICATE_REQUEST:
    'Bạn đã gửi yêu cầu giống hệt cho xe và thời gian này. Vui lòng xem trong "Đơn của tôi".',
  TOO_MANY_REQUESTS:
    'Bạn gửi quá nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau hoặc liên hệ Eagle Capital.',
  BOOKING_NOT_CANCELLABLE:
    'Yêu cầu không còn ở trạng thái Chờ xác nhận nên không thể tự hủy. Vui lòng liên hệ Eagle Capital.',
};

const NETWORK_ERROR_MESSAGE =
  'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.';

const GENERIC_ERROR_MESSAGE =
  'Chưa gửi được yêu cầu. Vui lòng thử lại sau ít phút.';

export type BookingErrorKind = 'network' | 'auth' | 'backend' | 'unknown';

/**
 * Lỗi đã được phân loại; userMessage hiển thị được cho khách.
 * Không chứa token, key hay dữ liệu khách.
 */
export class BookingServiceError extends Error {
  readonly kind: BookingErrorKind;
  readonly code?: string;
  readonly userMessage: string;

  constructor(
    kind: BookingErrorKind,
    userMessage: string,
    options?: { code?: string; cause?: unknown }
  ) {
    super(options?.code ? `${kind}: ${options.code}` : kind, {
      cause: options?.cause,
    });
    this.name = 'BookingServiceError';
    this.kind = kind;
    this.code = options?.code;
    this.userMessage = userMessage;
  }
}

function fromPostgrestError(error: PostgrestError): BookingServiceError {
  // Lỗi mạng/transport: postgrest-js trả code rỗng.
  if (!error.code) {
    return new BookingServiceError('network', NETWORK_ERROR_MESSAGE, {
      cause: error,
    });
  }

  // raise exception 'MÃ_LỖI' trong RPC → code P0001, message = mã lỗi.
  const backendMessage = BACKEND_ERROR_MESSAGES[error.message];

  if (backendMessage) {
    return new BookingServiceError(
      error.message === 'NOT_AUTHENTICATED' ? 'auth' : 'backend',
      backendMessage,
      { code: error.message, cause: error }
    );
  }

  // 42501: permission denied (thường do thiếu phiên đăng nhập).
  if (error.code === '42501') {
    return new BookingServiceError('auth', BACKEND_ERROR_MESSAGES.NOT_AUTHENTICATED, {
      code: error.code,
      cause: error,
    });
  }

  return new BookingServiceError('backend', GENERIC_ERROR_MESSAGE, {
    code: error.code,
    cause: error,
  });
}

function fromAuthError(error: unknown): BookingServiceError {
  const cause = error instanceof AuthSessionError ? error.cause : error;

  if (isAuthRetryableFetchError(cause)) {
    return new BookingServiceError('network', NETWORK_ERROR_MESSAGE, {
      cause: error,
    });
  }

  return new BookingServiceError(
    'auth',
    'Không tạo được phiên kết nối với hệ thống đặt xe. Vui lòng thử lại sau ít phút.',
    { cause: error }
  );
}

export function toBookingRequest(row: BookingRequestRow): BookingRequest {
  return {
    id: row.id,
    bookingCode: row.booking_code,
    carId: row.car_id,
    carName: row.car_name,
    serviceType: SERVICE_TYPE_FROM_DB[row.service_type] ?? 'Tự lái',
    pickupAt: row.pickup_at,
    returnAt: row.return_at,
    pickupLocation: row.pickup_location,
    returnLocation: row.return_location,
    customer: {
      fullName: row.customer_name,
      phone: row.customer_phone,
    },
    note: row.customer_note ?? '',
    pricePerDay: Number(row.price_per_day),
    rentalDays: row.rental_days,
    estimatedTotal: Number(row.estimated_total),
    finalTotal: row.final_total === null ? null : Number(row.final_total),
    status: row.status,
    statusReason: row.status_reason,
    source: row.source ?? 'app',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** User id của phiên đã lưu (không tạo phiên mới khi chỉ đọc). */
async function getSessionUserId(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();

  return data.session?.user.id;
}

/**
 * Gửi yêu cầu đặt xe lên Supabase.
 * Signature RPC (0001_init.sql):
 *   create_booking_request(p_car_id text, p_service_type text,
 *     p_pickup_at timestamptz, p_return_at timestamptz,
 *     p_pickup_location text, p_return_location text,
 *     p_customer_name text, p_customer_phone text,
 *     p_customer_note text default null) returns booking_requests
 */
export async function createBookingRequest(
  input: BookingRequestInput
): Promise<BookingRequest> {
  try {
    await ensureSession();
  } catch (error) {
    throw fromAuthError(error);
  }

  const { data, error } = await supabase.rpc('create_booking_request', {
    p_car_id: input.carId,
    p_service_type: SERVICE_TYPE_TO_DB[input.serviceType],
    p_pickup_at: input.pickupAt,
    p_return_at: input.returnAt,
    p_pickup_location: input.pickupLocation,
    p_return_location: input.returnLocation,
    p_customer_name: input.customer.fullName,
    p_customer_phone: input.customer.phone,
    p_customer_note: input.note.trim() ? input.note.trim() : null,
  });

  if (error) {
    throw fromPostgrestError(error);
  }

  if (!data) {
    throw new BookingServiceError('unknown', GENERIC_ERROR_MESSAGE);
  }

  const request = toBookingRequest(data as BookingRequestRow);
  notify();

  return request;
}

/**
 * Lấy "Đơn của tôi", mới nhất trước.
 * Lọc theo user_id của phiên: RLS cho admin đọc mọi đơn (0003), nên nếu
 * thiết bị đang đăng nhập admin thì "Đơn của tôi" vẫn chỉ là đơn của mình.
 * Chưa có phiên (chưa từng gửi đơn) → danh sách rỗng.
 */
export async function getMyBookingRequests(): Promise<BookingRequest[]> {
  const userId = await getSessionUserId();

  if (!userId) {
    return [];
  }

  // Đơn pending đã quá giờ nhận → expired (RPC 0006, chỉ đơn của mình).
  // Không chặn việc tải danh sách: lỗi ở đây được bỏ qua.
  await supabase.rpc('expire_stale_booking_requests');

  const { data, error } = await supabase
    .from('booking_requests')
    .select(BOOKING_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw fromPostgrestError(error);
  }

  return ((data ?? []) as unknown as BookingRequestRow[]).map(toBookingRequest);
}

/**
 * Họ tên + số điện thoại của đơn gần nhất trên phiên này (để điền sẵn form
 * đặt xe). Không tạo phiên mới; lỗi / chưa có đơn → undefined.
 */
export async function getLastBookingContact(): Promise<
  { fullName: string; phone: string } | undefined
> {
  const userId = await getSessionUserId();

  if (!userId) return undefined;

  const { data, error } = await supabase
    .from('booking_requests')
    .select('customer_name, customer_phone')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return undefined;

  const row = data as { customer_name: string; customer_phone: string };

  return { fullName: row.customer_name, phone: row.customer_phone };
}

/**
 * Lấy một yêu cầu theo UUID. Không thấy (hoặc không phải của mình) → undefined.
 */
export async function getBookingRequestById(
  id: string
): Promise<BookingRequest | undefined> {
  if (!UUID_PATTERN.test(id) || !(await getSessionUserId())) {
    return undefined;
  }

  const { data, error } = await supabase
    .from('booking_requests')
    .select(BOOKING_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw fromPostgrestError(error);
  }

  return data ? toBookingRequest(data as unknown as BookingRequestRow) : undefined;
}

/**
 * Đăng ký nhận thông báo khi app vừa tạo yêu cầu mới (để danh sách tải lại).
 * Thay đổi trạng thái từ phía Eagle Capital được cập nhật khi màn hình
 * được mở lại / quay lại.
 */
export function subscribeBookingRequests(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Khách tự huỷ yêu cầu đang chờ xác nhận (RPC cancel_my_booking_request, 0001).
 * Chỉ pending → cancelled, chỉ đơn của chính mình (server kiểm tra).
 */
export async function cancelMyBookingRequest(id: string): Promise<BookingRequest> {
  const { data, error } = await supabase.rpc('cancel_my_booking_request', {
    p_booking_id: id,
  });

  if (error) {
    throw fromPostgrestError(error);
  }

  const request = toBookingRequest(data as BookingRequestRow);
  notify();

  return request;
}

/**
 * Kiểm tra xe còn trống (RPC check_car_availability, 0009) — chỉ phục vụ UX.
 * true = không trùng đơn confirmed; false = trùng.
 * undefined = KHÔNG kiểm tra được (mất mạng, lỗi, 0009 chưa áp dụng…):
 * app không được khoá form trong trường hợp này; backend vẫn quyết định cuối.
 */
export async function checkCarAvailability(
  carId: string,
  pickupAt: string,
  returnAt: string
): Promise<boolean | undefined> {
  try {
    await ensureSession();

    const { data, error } = await supabase.rpc('check_car_availability', {
      p_car_id: carId,
      p_pickup_at: pickupAt,
      p_return_at: returnAt,
    });

    if (error || typeof data !== 'boolean') {
      return undefined;
    }

    return data;
  } catch {
    return undefined;
  }
}
