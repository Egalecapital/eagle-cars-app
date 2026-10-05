/**
 * QUẦY LẤY DỮ LIỆU XE
 *
 * Nguồn dữ liệu:
 *   - Supabase public.cars là nguồn DUY NHẤT của danh mục: xe có đang cho thuê
 *     (is_active), tên, giá/ngày, hãng, số chỗ, mô tả, tính năng, hình thức
 *     thuê, cọc, km… (0018). Xe admin thêm mới hiển thị ngay, không sửa code.
 *   - Ảnh bìa: cars.image_url (Supabase Storage bucket car-images) khi có và
 *     hợp lệ; nếu không → ảnh trong repo (src/data/cars.ts, chỉ 5 xe ban đầu);
 *     không có cả hai → khung chờ ảnh (CarPhoto).
 *   - Backend (create_booking_request + trigger 0018) vẫn là lớp kiểm tra cuối
 *     cùng về xe active, giá và hình thức thuê.
 *   - Cần chạy migration 0018 TRƯỚC khi phát hành bản app này: database chưa
 *     có cột mới → tải danh mục báo lỗi (không đoán thông tin xe).
 */

import { serviceLabel } from '@/constants/car-options';
import { carImageFallbacks, commonCarBenefits } from '@/data/cars';
import { supabase } from '@/lib/supabase';
import type {
  Car,
  CarCategory,
  CarImageSource,
  FuelType,
  ServiceType,
  TransmissionType,
} from '@/types/car';

/** 'live' = vừa tải từ Supabase; 'cache' = tải lại thất bại, dùng bản trước đó. */
export type CatalogSource = 'live' | 'cache';

export type CarCatalog = {
  cars: Car[];
  source: CatalogSource;
  /** Thời điểm (ms) bản dữ liệu này được tải từ Supabase. */
  fetchedAt: number;
};

/** Một dòng public.cars (khách đọc được các cột này qua policy xe active). */
export type CarRow = {
  id: string;
  name: string;
  price_per_day: number;
  is_active: boolean;
  image_url: string | null;
  brand: string;
  model: string;
  year: number | null;
  category: string;
  seats: number;
  fuel_type: string;
  transmission: string;
  service_types: string[];
  description: string;
  features: string[];
  is_featured: boolean;
  sort_order: number;
  deposit_amount: number | null;
  km_limit_per_day: number | null;
  extra_km_fee: number | null;
};

export const CAR_COLUMNS =
  'id, name, price_per_day, is_active, image_url, brand, model, year, category, seats, fuel_type, ' +
  'transmission, service_types, description, features, is_featured, sort_order, deposit_amount, ' +
  'km_limit_per_day, extra_km_fee';

// Giống CHECK cars_image_url_check (0017) + host phải đúng project đang dùng.
const CAR_IMAGE_PATH =
  /^\/storage\/v1\/object\/public\/car-images\/[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*\.(jpg|jpeg|png|webp)$/;
const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').host;
  } catch {
    return '';
  }
})();

/**
 * Ảnh remote từ bucket car-images; undefined nếu không có / không hợp lệ
 * (khi đó dùng ảnh dự phòng). Không bao giờ hiển thị URL ngoài project.
 */
export function remoteCarImage(url: string | null | undefined): { uri: string } | undefined {
  if (!url || url.length > 500 || url.includes('..')) return undefined;

  try {
    const parsed = new URL(url);

    if (
      parsed.protocol !== 'https:' ||
      !SUPABASE_HOST ||
      parsed.host !== SUPABASE_HOST ||
      parsed.search ||
      parsed.hash ||
      !CAR_IMAGE_PATH.test(parsed.pathname)
    ) {
      return undefined;
    }

    return { uri: url };
  } catch {
    return undefined;
  }
}

/** Ảnh hiển thị của một xe: ảnh tải lên → ảnh trong repo → undefined (khung chờ ảnh). */
export function resolveCarImage(carId: string, imageUrl: string | null | undefined): CarImageSource | undefined {
  return remoteCarImage(imageUrl) ?? carImageFallbacks[carId];
}

/**
 * Ảnh của xe cho màn lịch sử đơn: ảnh trong danh mục đang tải (có thể là ảnh
 * remote) nếu xe còn cho thuê, nếu không thì ảnh trong repo (nếu có).
 */
export function carImageFor(carId: string, catalogCars: Car[]): CarImageSource | undefined {
  return catalogCars.find((car) => car.id === carId)?.image ?? carImageFallbacks[carId];
}

/** Dòng database → Car hiển thị cho khách. */
export function toCar(row: CarRow): Car {
  const services = (row.service_types ?? [])
    .map(serviceLabel)
    .filter((label): label is ServiceType => !!label);
  const optionalNumber = (value: number | null) => (value == null ? null : Number(value));

  return {
    id: row.id,
    name: row.name,
    brand: row.brand ?? '',
    model: row.model ?? '',
    year: row.year ?? null,
    category: row.category as CarCategory,
    pricePerDay: Number(row.price_per_day),
    seats: row.seats,
    fuelType: row.fuel_type as FuelType,
    transmission: row.transmission as TransmissionType,
    serviceTypes: services,
    image: resolveCarImage(row.id, row.image_url),
    description: row.description ?? '',
    features: row.features ?? [],
    isFeatured: row.is_featured,
    depositAmount: optionalNumber(row.deposit_amount),
    kmLimitPerDay: optionalNumber(row.km_limit_per_day),
    extraKmFee: optionalNumber(row.extra_km_fee),
  };
}

// Bản tải thành công gần nhất trong phiên app (chỉ để hiển thị, không dùng
// cho bất kỳ kiểm tra bảo mật nào).
let lastLiveCatalog: { cars: Car[]; fetchedAt: number } | undefined;

/**
 * Lấy quyền lợi của xe.
 */
export function getCarBenefits(car: Car): string[] {
  return [...commonCarBenefits];
}

/** Bản tải gần nhất trong phiên (để hiển thị ngay khi mở lại màn hình). */
export function getLastCarCatalog(): CarCatalog | undefined {
  return lastLiveCatalog ? { ...lastLiveCatalog, source: 'live' } : undefined;
}

/**
 * Tải danh mục xe đang cho thuê từ Supabase (thứ tự theo sort_order do admin đặt).
 * - Thành công → source 'live'.
 * - Thất bại nhưng đã có bản trước trong phiên → source 'cache'.
 * - Thất bại và chưa có bản nào → throw (màn hình hiển thị lỗi + thử lại).
 */
export async function fetchCarCatalog(): Promise<CarCatalog> {
  let rows: CarRow[] | undefined;

  try {
    // Lọc rõ ràng: admin đọc được cả xe tắt, nhưng danh mục khách chỉ gồm xe active.
    const { data, error } = await supabase
      .from('cars')
      .select(CAR_COLUMNS)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (!error && data) {
      rows = data as unknown as CarRow[];
    }
  } catch {
    rows = undefined;
  }

  if (!rows) {
    if (lastLiveCatalog) {
      return { ...lastLiveCatalog, source: 'cache' };
    }

    throw new Error('CAR_CATALOG_UNAVAILABLE');
  }

  const catalogCars = rows
    .filter((row) => row.is_active)
    .map(toCar)
    // Xe không còn hình thức thuê hợp lệ thì khách không đặt được → không hiển thị.
    .filter((car) => car.serviceTypes.length > 0);

  lastLiveCatalog = { cars: catalogCars, fetchedAt: Date.now() };

  return { ...lastLiveCatalog, source: 'live' };
}
