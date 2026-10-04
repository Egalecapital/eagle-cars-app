/**
 * QUẦY XỬ LÝ YÊU CẦU ĐẶT XE
 *
 * Hiện chưa có backend: yêu cầu chỉ được lưu tạm trong bộ nhớ của app.
 * Dữ liệu mất khi app bị tắt hẳn hoặc tải lại hoàn toàn.
 *
 * Các hàm đều trả về Promise để giữ đúng "hình dạng" của API thật.
 * Khi có backend, thay phần thân hàm bằng lời gọi API; UI không cần đổi.
 */

import type {
  BookingRequest,
  BookingRequestInput,
} from '@/types/booking';

let requests: BookingRequest[] = [];

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function createTemporaryId(): string {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();

  return `EC-${time}-${random}`;
}

/**
 * Tạo yêu cầu đặt xe mới với trạng thái "Chờ xác nhận".
 * Backend sau này: POST /booking-requests → trả về bookingId.
 */
export async function createBookingRequest(
  input: BookingRequestInput
): Promise<BookingRequest> {
  const now = new Date().toISOString();

  const request: BookingRequest = {
    ...input,
    id: createTemporaryId(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  requests = [request, ...requests];
  notify();

  return request;
}

/**
 * Cập nhật nội dung yêu cầu (khi khách chỉnh sửa rồi gửi lại).
 * Backend sau này: PATCH /booking-requests/:id
 */
export async function updateBookingRequest(
  id: string,
  input: BookingRequestInput
): Promise<BookingRequest | undefined> {
  const existing = requests.find((request) => request.id === id);

  if (!existing) {
    return undefined;
  }

  const updated: BookingRequest = {
    ...existing,
    ...input,
    updatedAt: new Date().toISOString(),
  };

  requests = requests.map((request) =>
    request.id === id ? updated : request
  );
  notify();

  return updated;
}

/**
 * Lấy lịch sử yêu cầu của khách, mới nhất trước.
 * Backend sau này: GET /booking-requests?customer=...
 */
export async function getMyBookingRequests(): Promise<BookingRequest[]> {
  return [...requests];
}

/**
 * Lấy một yêu cầu theo ID.
 * Backend sau này: GET /booking-requests/:id
 */
export async function getBookingRequestById(
  id: string
): Promise<BookingRequest | undefined> {
  return requests.find((request) => request.id === id);
}

/**
 * Đăng ký nhận thông báo khi danh sách yêu cầu thay đổi.
 * Backend sau này có thể thay bằng polling, push notification hoặc websocket.
 */
export function subscribeBookingRequests(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
