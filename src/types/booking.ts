import type { ServiceType } from '@/types/car';

/**
 * Kiểu dữ liệu yêu cầu đặt xe dùng chung cho Booking, "Đơn của tôi"
 * và chi tiết yêu cầu.
 *
 * UI chỉ làm việc với các kiểu này thông qua booking-service.ts.
 * Dữ liệu thật nằm ở bảng public.booking_requests trên Supabase.
 */

/** Khớp CHECK status trong supabase/migrations/0001_init.sql. */
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'completed'
  | 'expired';

export type BookingCustomer = {
  fullName: string;
  phone: string;
};

export type BookingRequest = {
  /** UUID do database tạo. */
  id: string;
  /** Mã cho khách đọc, dạng EC-XXXXXXXX, do server tạo. */
  bookingCode: string;

  carId: string;
  /** Tên xe tại thời điểm đặt (snapshot phía server). */
  carName: string;

  serviceType: ServiceType;

  /** Thời điểm nhận/trả xe dạng ISO 8601. */
  pickupAt: string;
  returnAt: string;

  pickupLocation: string;
  returnLocation: string;

  customer: BookingCustomer;
  note: string;

  /** Server tính từ bảng cars; giá chính thức do Eagle Capital xác nhận. */
  pricePerDay: number;
  rentalDays: number;
  estimatedTotal: number;
  finalTotal: number | null;

  status: BookingStatus;
  statusReason: string | null;

  /** 'app' = khách gửi qua app; 'admin' = admin nhập (khách gọi điện / trực tiếp). */
  source: 'app' | 'admin';

  createdAt: string;
  updatedAt: string;
};

/**
 * Dữ liệu khách nhập, gửi lên RPC create_booking_request.
 * KHÔNG có giá, số ngày, tổng tiền, trạng thái, mã đơn: server tự tính.
 */
export type BookingRequestInput = {
  carId: string;
  serviceType: ServiceType;
  pickupAt: string;
  returnAt: string;
  pickupLocation: string;
  returnLocation: string;
  customer: BookingCustomer;
  note: string;
};
