import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  BookingServiceError,
  getBookingRequestById,
  getMyBookingRequests,
  subscribeBookingRequests,
} from '@/services/booking-service';
import type { BookingRequest } from '@/types/booking';

function toLoadErrorMessage(error: unknown): string {
  return error instanceof BookingServiceError && error.kind === 'network'
    ? error.userMessage
    : 'Không tải được dữ liệu. Vui lòng thử lại sau ít phút.';
}

/**
 * Tải dữ liệu khi màn hình được mở/quay lại và khi app vừa tạo / huỷ yêu cầu;
 * reload() để tải lại thủ công (nút Thử lại, kéo để làm mới).
 * `load` phải ổn định (useCallback).
 */
function useCustomerResource<T>(load: () => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const run = useCallback(
    async (isActive: () => boolean, manual = false) => {
      if (manual) setRefreshing(true);

      try {
        const next = await load();

        if (isActive()) {
          setData(next);
          setError(undefined);
        }
      } catch (loadError) {
        if (isActive()) {
          setError(toLoadErrorMessage(loadError));
        }
      } finally {
        if (isActive()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [load]
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      run(() => active);
      const unsubscribe = subscribeBookingRequests(() => run(() => active));

      return () => {
        active = false;
        unsubscribe();
      };
    }, [run])
  );

  const reload = useCallback(() => {
    run(() => true, true);
  }, [run]);

  return { data, loading, refreshing, error, reload };
}

/**
 * Danh sách yêu cầu đặt xe của khách.
 * Tải lại mỗi khi màn hình được mở/quay lại và khi app vừa tạo yêu cầu mới.
 */
export function useMyBookingRequests() {
  const { data, loading, refreshing, error, reload } = useCustomerResource<BookingRequest[]>(
    getMyBookingRequests,
    []
  );

  return { requests: data, loading, refreshing, error, reload };
}

/**
 * Một yêu cầu đặt xe theo ID, tải lại mỗi khi màn hình được mở/quay lại.
 */
export function useBookingRequest(id: string | undefined) {
  const load = useCallback(
    () => (id ? getBookingRequestById(id) : Promise.resolve(undefined)),
    [id]
  );
  const { data, loading, refreshing, error, reload } = useCustomerResource<
    BookingRequest | undefined
  >(load, undefined);

  return { request: data, loading, refreshing, error, reload };
}
