import type { ImageSourcePropType } from 'react-native';

/**
 * Kiểu dữ liệu xe dùng chung cho toàn bộ Eagle Capital Cars.
 *
 * Home, Explore và Car Detail lấy dữ liệu thông qua car-service.ts.
 * Không khai báo lại dữ liệu xe riêng ở từng màn hình.
 */

export type CarCategory = 'Xe sang' | 'SUV' | 'Sedan';

export type ServiceType = 'Tự lái' | 'Có lái' | 'Xe cưới';

export type FuelType = 'Xăng' | 'Dầu' | 'Điện';

export type TransmissionType = 'Tự động' | 'Số sàn';

export type Car = {
  id: string;

  name: string;
  brand: string;
  model: string;
  year: number;

  category: CarCategory;

  pricePerDay: number;

  seats: number;
  fuelType: FuelType;
  transmission: TransmissionType;

  serviceTypes: ServiceType[];

  image: ImageSourcePropType;

  description: string;

  features: string[];

  isFeatured: boolean;
};