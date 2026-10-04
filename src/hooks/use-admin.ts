import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { checkIsAdmin } from '@/services/admin-auth-service';
import {
  AdminBookingError,
  type AdminCar,
  type AdminStatusFilter,
  getAdminBookingRequest,
  listAdminBookingRequests,
  listAdminCars,
  listCarSchedule,
} from '@/services/admin-booking-service';
import type { BookingRequest } from '@/types/booking';

const AUTO_REFRESH_MS = 60 * 1000;

function toLoadError(error: unknown): string {
  return error instanceof AdminBookingError
    ? error.userMessage
    : 'Không tải được dữ liệu. Vui lòng thử lại.';
}

/**
 * Chặn màn admin khi phiên không phải admin (chỉ phục vụ UX;
 * bảo mật thật nằm ở RLS + RPC). Không phải admin → về /admin/login.
 */
export function useAdminGuard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      checkIsAdmin()
        .then((isAdmin) => {
          if (!active) return;

          if (isAdmin) {
            setReady(true);
          } else {
            router.replace('/admin/login');
          }
        })
        .catch(() => {
          if (active) router.replace('/admin/login');
        });

      return () => {
        active = false;
      };
    }, [router])
  );

  return ready;
}

/** Danh sách đơn theo bộ lọc; tải lại khi màn hình được mở lại hoặc gọi reload(). */
export function useAdminBookingRequests(filter: AdminStatusFilter, enabled: boolean) {
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(
    async (isActive: () => boolean, silent = false) => {
      if (!enabled) return;

      if (!silent) setLoading(true);

      try {
        const data = await listAdminBookingRequests(filter);

        if (isActive()) {
          setRequests(data);
          setError(undefined);
        }
      } catch (loadError) {
        if (isActive()) setError(toLoadError(loadError));
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [filter, enabled]
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load(() => active);

      // Chưa có thông báo đơn mới: khi màn hình đang mở, tự làm mới mỗi 60 giây.
      const timer = setInterval(() => load(() => active, true), AUTO_REFRESH_MS);

      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [load])
  );

  const reload = useCallback(() => {
    load(() => true);
  }, [load]);

  return { requests, loading, error, reload };
}

/** Một đơn cho admin; reload() sau khi xác nhận / từ chối. */
export function useAdminBookingRequest(id: string | undefined, enabled: boolean) {
  const [request, setRequest] = useState<BookingRequest | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(
    async (isActive: () => boolean) => {
      if (!enabled) return;

      try {
        const data = id ? await getAdminBookingRequest(id) : undefined;

        if (isActive()) {
          setRequest(data);
          setError(undefined);
        }
      } catch (loadError) {
        if (isActive()) setError(toLoadError(loadError));
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [id, enabled]
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load(() => active);

      return () => {
        active = false;
      };
    }, [load])
  );

  const reload = useCallback(() => {
    load(() => true);
  }, [load]);

  return { request, loading, error, reload };
}

/** Danh sách xe cho màn Lịch xe. */
export function useAdminCars(enabled: boolean) {
  const [cars, setCars] = useState<AdminCar[]>([]);
  const [error, setError] = useState<string | undefined>();

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      let active = true;

      listAdminCars()
        .then((data) => {
          if (active) {
            setCars(data);
            setError(undefined);
          }
        })
        .catch((loadError) => {
          if (active) setError(toLoadError(loadError));
        });

      return () => {
        active = false;
      };
    }, [enabled])
  );

  return { cars, error };
}

/** Lịch của một xe trong [from, to); tải lại khi màn hình mở lại hoặc reload(). */
export function useAdminCarSchedule(
  carId: string | undefined,
  from: Date,
  to: Date,
  enabled: boolean
) {
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fromMs = from.getTime();
  const toMs = to.getTime();

  const load = useCallback(
    async (isActive: () => boolean) => {
      if (!enabled || !carId) return;

      setLoading(true);

      try {
        const data = await listCarSchedule(carId, new Date(fromMs), new Date(toMs));

        if (isActive()) {
          setRequests(data);
          setError(undefined);
        }
      } catch (loadError) {
        if (isActive()) setError(toLoadError(loadError));
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [carId, fromMs, toMs, enabled]
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load(() => active);

      return () => {
        active = false;
      };
    }, [load])
  );

  const reload = useCallback(() => {
    load(() => true);
  }, [load]);

  return { requests, loading, error, reload };
}
