/**
 * QUẦY LẤY DỮ LIỆU XE
 *
 * Nguồn dữ liệu:
 *   - Supabase public.cars quyết định TUYỆT ĐỐI: xe có đang cho thuê
 *     (is_active), tên xe, giá/ngày.
 *   - src/data/cars.ts chỉ BỔ SUNG dữ liệu trình bày: ảnh, mô tả, số chỗ,
 *     tính năng, hình thức thuê… Xe có trong database nhưng chưa có dữ liệu
 *     trình bày trong app thì chưa hiển thị.
 *   - Không bao giờ coi xe trong cars.ts là đang cho thuê khi chưa có xác
 *     nhận từ Supabase. Backend (create_booking_request) vẫn là lớp kiểm tra
 *     cuối cùng về xe active và giá.
 */

import { cars, commonCarBenefits } from '@/data/cars';
import { supabase } from '@/lib/supabase';
import type { Car } from '@/types/car';

/** 'live' = vừa tải từ Supabase; 'cache' = tải lại thất bại, dùng bản trước đó. */
export type CatalogSource = 'live' | 'cache';

export type CarCatalog = {
  cars: Car[];
  source: CatalogSource;
  /** Thời điểm (ms) bản dữ liệu này được tải từ Supabase. */
  fetchedAt: number;
};

type CarRow = {
  id: string;
  name: string;
  price_per_day: number;
  is_active: boolean;
};

// Bản tải thành công gần nhất trong phiên app (chỉ để hiển thị, không dùng
// cho bất kỳ kiểm tra bảo mật nào).
let lastLiveCatalog: { cars: Car[]; fetchedAt: number } | undefined;

/**
 * Dữ liệu trình bày của xe theo id (ảnh, mô tả…), KHÔNG cho biết xe có đang
 * cho thuê hay giá hiện tại. Dùng cho ảnh trong lịch sử đơn.
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

/** Bản tải gần nhất trong phiên (để hiển thị ngay khi mở lại màn hình). */
export function getLastCarCatalog(): CarCatalog | undefined {
  return lastLiveCatalog ? { ...lastLiveCatalog, source: 'live' } : undefined;
}

/**
 * Tải danh mục xe đang cho thuê từ Supabase và ghép dữ liệu trình bày.
 * - Thành công → source 'live'.
 * - Thất bại nhưng đã có bản trước trong phiên → source 'cache'.
 * - Thất bại và chưa có bản nào → throw (màn hình hiển thị lỗi + thử lại).
 */
export async function fetchCarCatalog(): Promise<CarCatalog> {
  let rows: CarRow[] | undefined;

  try {
    const { data, error } = await supabase
      .from('cars')
      .select('id, name, price_per_day, is_active')
      // Lọc rõ ràng: admin đọc được cả xe tắt, nhưng danh mục khách chỉ gồm xe active.
      .eq('is_active', true);

    if (!error && data) {
      rows = data as CarRow[];
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

  const order = (id: string) => cars.findIndex((car) => car.id === id);

  const merged = rows
    .filter((row) => row.is_active)
    .flatMap((row): Car[] => {
      const meta = getCarById(row.id);

      return meta
        ? [{ ...meta, name: row.name, pricePerDay: Number(row.price_per_day) }]
        : [];
    })
    .sort((a, b) => order(a.id) - order(b.id));

  lastLiveCatalog = { cars: merged, fetchedAt: Date.now() };

  return { ...lastLiveCatalog, source: 'live' };
}
