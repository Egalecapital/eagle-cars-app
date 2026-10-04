import type { ServiceType } from '@/types/car';

/**
 * Kiểu dữ liệu yêu cầu đặt xe dùng chung cho Booking, "Đơn của tôi"
 * và chi tiết yêu cầu.
 *
 * UI chỉ làm việc với các kiểu này thông qua booking-service.ts.
 * Khi có backend, chỉ cần đổi phần lưu trữ trong service, không đổi UI.
 */

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export type BookingCustomer = {
  fullName: string;
  phone: string;
};

export type BookingRequest = {
  id: string;

  carId: string;
  /** Lưu lại tên xe tại thời điểm đặt, phòng khi dữ liệu xe thay đổi. */
  carName: string;

  serviceType: ServiceType;

  /** Thời điểm nhận/trả xe dạng ISO 8601. */
  pickupAt: string;
  returnAt: string;

  pickupLocation: string;
  returnLocation: string;

  customer: BookingCustomer;
  note: string;

  /** Giá dự kiến phía app; giá chính thức do Eagle Capital xác nhận. */
  pricePerDay: number;
  rentalDays: number;
  estimatedTotal: number;

  status: BookingStatus;

  createdAt: string;
  updatedAt: string;
};

/**
 * Dữ liệu app gửi đi khi tạo/cập nhật yêu cầu.
 * id, trạng thái và thời gian tạo do nơi lưu trữ (sau này là backend) cấp.
 */
export type BookingRequestInput = Omit<
  BookingRequest,
  'id' | 'status' | 'createdAt' | 'updatedAt'
>;
