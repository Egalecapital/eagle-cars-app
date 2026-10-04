import { useEffect, useState } from 'react';

import {
  getBookingRequestById,
  getMyBookingRequests,
  subscribeBookingRequests,
} from '@/services/booking-service';
import type { BookingRequest } from '@/types/booking';

/**
 * Danh sách yêu cầu đặt xe của khách, tự cập nhật khi có yêu cầu mới.
 */
export function useMyBookingRequests() {
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const data = await getMyBookingRequests();

      if (active) {
        setRequests(data);
        setLoading(false);
      }
    };

    load();
    const unsubscribe = subscribeBookingRequests(load);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { requests, loading };
}

/**
 * Một yêu cầu đặt xe theo ID, tự cập nhật khi yêu cầu thay đổi.
 */
export function useBookingRequest(id: string | undefined) {
  const [request, setRequest] = useState<BookingRequest | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const data = id ? await getBookingRequestById(id) : undefined;

      if (active) {
        setRequest(data);
        setLoading(false);
      }
    };

    load();
    const unsubscribe = subscribeBookingRequests(load);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [id]);

  return { request, loading };
}
