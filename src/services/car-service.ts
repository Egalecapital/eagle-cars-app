/**
 * QUẦY LẤY DỮ LIỆU XE
 *
 * Các trang trong app lấy dữ liệu xe thông qua file này.
 */

import { cars, commonCarBenefits } from '@/data/cars';
import type { Car } from '@/types/car';

/**
 * Lấy toàn bộ danh sách xe.
 */
export function getAllCars(): Car[] {
  return [...cars];
}

/**
 * Lấy các xe nổi bật.
 */
export function getFeaturedCars(): Car[] {
  return cars.filter((car) => car.isFeatured);
}

/**
 * Tìm xe theo ID.
 */
export function getCarById(id: string): Car | undefined {
  return cars.find((car) => car.id === id);
}

/**
 * Lấy quyền lợi của xe.
 */
export function getCarBenefits(car: Car): string[] {
  return [...commonCarBenefits];
}