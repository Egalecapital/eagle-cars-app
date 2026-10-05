import type { ImageRequireSource } from 'react-native';

/**
 * Kiểu dữ liệu xe dùng chung cho toàn bộ Eagle Capital Cars.
 *
 * Home, Explore và Car Detail lấy dữ liệu thông qua car-service.ts.
 * Không khai báo lại dữ liệu xe riêng ở từng màn hình.
 * Các giá trị cho phép khớp CHECK trong 0018_fleet_admin.sql
 * (danh sách để chọn: src/constants/car-options.ts).
 */

export type CarCategory = 'Xe sang' | 'SUV' | 'Sedan' | 'MPV' | 'Bán tải';

/** Nhãn hiển thị của hình thức thuê. */
export type ServiceType = 'Tự lái' | 'Có lái' | 'Xe cưới';

/** Giá trị lưu trong database (cars.service_types, booking_requests.service_type). */
export type ServiceTypeKey = 'self_drive' | 'with_driver' | 'wedding';

export type FuelType = 'Xăng' | 'Dầu' | 'Điện' | 'Hybrid';

export type TransmissionType = 'Tự động' | 'Số sàn';

/**
 * Ảnh xe: ảnh từ Supabase Storage bucket car-images (cars.image_url) hoặc ảnh
 * trong repo (giá trị của require(), chỉ làm dự phòng cho 5 xe ban đầu).
 */
export type CarImageSource = ImageRequireSource | { uri: string };

export type Car = {
  id: string;

  name: string;
  brand: string;
  model: string;
  /** null = chưa nhập năm sản xuất. */
  year: number | null;

  category: CarCategory;

  pricePerDay: number;

  seats: number;
  fuelType: FuelType;
  transmission: TransmissionType;

  serviceTypes: ServiceType[];

  /** undefined = xe chưa có ảnh (hiển thị khung chờ ảnh). */
  image?: CarImageSource;

  description: string;

  features: string[];

  isFeatured: boolean;

  /** Tiền cọc (VNĐ); null = chưa công bố, liên hệ. */
  depositAmount: number | null;
  /** Giới hạn km/ngày; null = không giới hạn / chưa công bố. */
  kmLimitPerDay: number | null;
  /** Phụ phí mỗi km vượt (VNĐ); null = chưa công bố. */
  extraKmFee: number | null;
};
