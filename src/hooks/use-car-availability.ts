import { useEffect, useState } from 'react';

import { checkCarAvailability } from '@/services/booking-service';

export type AvailabilityStatus =
  | 'idle'        // chưa đủ dữ liệu để kiểm tra
  | 'checking'    // đang kiểm tra
  | 'available'   // không trùng đơn confirmed
  | 'unavailable' // trùng đơn confirmed → khoá nút gửi
  | 'unknown';    // không kiểm tra được → KHÔNG khoá, backend quyết định

const DEBOUNCE_MS = 400;

/**
 * Kiểm tra xe còn trống cho khoảng [pickupAt, returnAt) (ISO).
 * Truyền undefined khi thời gian chưa hợp lệ → 'idle'.
 */
export function useCarAvailability(
  carId: string | undefined,
  pickupAt: string | undefined,
  returnAt: string | undefined
): AvailabilityStatus {
  const key = carId && pickupAt && returnAt ? `${carId}|${pickupAt}|${returnAt}` : '';

  // Kết quả gắn với key đã kiểm tra; key khác → đang kiểm tra lại.
  const [result, setResult] = useState<{ key: string; status: AvailabilityStatus }>({
    key: '',
    status: 'idle',
  });

  useEffect(() => {
    if (!carId || !pickupAt || !returnAt) return;

    const requestKey = `${carId}|${pickupAt}|${returnAt}`;
    let active = true;

    const timer = setTimeout(async () => {
      const available = await checkCarAvailability(carId, pickupAt, returnAt);

      if (active) {
        setResult({
          key: requestKey,
          status:
            available === undefined ? 'unknown' : available ? 'available' : 'unavailable',
        });
      }
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [carId, pickupAt, returnAt]);

  if (!key) return 'idle';

  return result.key === key ? result.status : 'checking';
}
