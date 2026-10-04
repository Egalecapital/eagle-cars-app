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
 * Danh sách yêu cầu đặt xe của khách.
 * Tải lại mỗi khi màn hình được mở/quay lại và khi app vừa tạo yêu cầu mới.
 */
export function useMyBookingRequests() {
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load = async () => {
        try {
          const data = await getMyBookingRequests();

          if (active) {
            setRequests(data);
            setError(undefined);
          }
        } catch (loadError) {
          if (active) {
            setError(toLoadErrorMessage(loadError));
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      load();
      const unsubscribe = subscribeBookingRequests(load);

      return () => {
        active = false;
        unsubscribe();
      };
    }, [])
  );

  return { requests, loading, error };
}

/**
 * Một yêu cầu đặt xe theo ID, tải lại mỗi khi màn hình được mở/quay lại.
 */
export function useBookingRequest(id: string | undefined) {
  const [request, setRequest] = useState<BookingRequest | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load = async () => {
        try {
          const data = id ? await getBookingRequestById(id) : undefined;

          if (active) {
            setRequest(data);
            setError(undefined);
          }
        } catch (loadError) {
          if (active) {
            setError(toLoadErrorMessage(loadError));
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      load();
      const unsubscribe = subscribeBookingRequests(load);

      return () => {
        active = false;
        unsubscribe();
      };
    }, [id])
  );

  return { request, loading, error };
}
