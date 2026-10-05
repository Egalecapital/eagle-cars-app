import type { Car } from '@/types/car';
import { formatVnd } from '@/utils/format-price';

/** Điều kiện thuê hiển thị cho khách (chi tiết xe, đặt xe). null → "Liên hệ". */
export function carRentalTerms(car: Car): { label: string; value: string }[] {
  return [
    {
      label: 'Tiền cọc',
      value: car.depositAmount == null ? 'Liên hệ' : car.depositAmount === 0 ? 'Không cần cọc' : formatVnd(car.depositAmount),
    },
    {
      label: 'Giới hạn km',
      value: car.kmLimitPerDay == null ? 'Liên hệ' : `${formatVnd(car.kmLimitPerDay).slice(0, -1)} km/ngày`,
    },
    {
      label: 'Phụ phí km vượt',
      value: car.extraKmFee == null ? 'Liên hệ' : `${formatVnd(car.extraKmFee)}/km`,
    },
  ];
}

/** "BMW · 530i M Sport · 2021" — bỏ phần trống. */
export function carSubtitle(car: Car): string {
  return [car.brand, car.model, car.year ? String(car.year) : ''].filter(Boolean).join(' · ');
}

/** "2021 • 5 chỗ • Tự động" cho thẻ xe — bỏ năm nếu chưa nhập. */
export function carMeta(car: Car): string {
  return [car.year ? String(car.year) : '', `${car.seats} chỗ`, car.transmission].filter(Boolean).join(' • ');
}
