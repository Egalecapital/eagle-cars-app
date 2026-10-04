/**
 * KIỂU DỮ LIỆU XE DÙNG CHUNG CHO TOÀN BỘ APP EAGLE CARS
 */

export type CarCategory = 'Xe sang' | 'SUV' | 'Sedan';

export type ServiceType = 'Tự lái' | 'Có lái' | 'Xe cưới';

export type Car = {
  id: string;
  name: string;
  category: CarCategory;
  pricePerDay: number;
  seats: number;
  serviceTypes: ServiceType[];
  icon: string;
  isFeatured: boolean;
};