import type { ImageRequireSource } from 'react-native';

/**
 * ẢNH DỰ PHÒNG cho 5 xe ban đầu (theo id trong public.cars).
 *
 * Mọi thông tin xe (tên, giá, hãng, số chỗ, mô tả, tính năng, hình thức
 * thuê, cọc, km…) nằm trong database và do admin quản lý (0018). File này
 * CHỈ dùng khi xe chưa có ảnh tải lên (cars.image_url null). Xe mới thêm từ
 * Admin không cần sửa file này: chưa có ảnh thì hiển thị khung chờ ảnh.
 */
export const carImageFallbacks: Record<string, ImageRequireSource> = {
  'porsche-panamera': require('../../assets/images/cars/porsche-panamera.webp'),
  'bmw-530i-m-sport': require('../../assets/images/cars/bmw-530i.jpg'),
  'mercedes-e300-amg': require('../../assets/images/cars/mercedes-e300.jpg'),
  'mercedes-glc200': require('../../assets/images/cars/mercedes-glc200.jpg'),
  'vinfast-lux-a': require('../../assets/images/cars/vinfast-lux-a.jpg'),
};

export const commonCarBenefits: string[] = [
  'Giao xe tận nơi',
  'Hỗ trợ 24/7',
  'Xe được vệ sinh trước khi giao',
];
