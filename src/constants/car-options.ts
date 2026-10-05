import type {
  CarCategory,
  FuelType,
  ServiceType,
  ServiceTypeKey,
  TransmissionType,
} from '@/types/car';

/**
 * Lựa chọn khi admin thêm / sửa xe. PHẢI khớp CHECK trong
 * supabase/migrations/0018_fleet_admin.sql (server vẫn kiểm tra lại).
 */
export const CAR_CATEGORIES: CarCategory[] = ['Xe sang', 'SUV', 'Sedan', 'MPV', 'Bán tải'];

export const FUEL_TYPES: FuelType[] = ['Xăng', 'Dầu', 'Điện', 'Hybrid'];

export const TRANSMISSIONS: TransmissionType[] = ['Tự động', 'Số sàn'];

export const SERVICE_OPTIONS: { key: ServiceTypeKey; label: ServiceType }[] = [
  { key: 'self_drive', label: 'Tự lái' },
  { key: 'with_driver', label: 'Có lái' },
  { key: 'wedding', label: 'Xe cưới' },
];

export const serviceLabel = (key: string): ServiceType | undefined =>
  SERVICE_OPTIONS.find((option) => option.key === key)?.label;

/** Giới hạn khớp server (0018). */
export const CAR_LIMITS = {
  idMin: 3,
  idMax: 60,
  nameMax: 120,
  brandMax: 60,
  modelMax: 80,
  descriptionMax: 2000,
  featuresMax: 20,
  featureMax: 80,
  priceMax: 1_000_000_000,
  depositMax: 10_000_000_000,
  kmMax: 100_000,
  extraKmFeeMax: 100_000_000,
  seatsMin: 2,
  seatsMax: 50,
  yearMin: 1990,
  yearMax: 2100,
  sortMax: 10_000,
} as const;

export const CAR_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
