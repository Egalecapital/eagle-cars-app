import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { checkIsAdmin } from '@/services/admin-auth-service';
import {
  AdminBookingError,
  type AdminCar,
  type AdminNotification,
  type AdminStatusFilter,
  type BookingStatusEvent,
  getAdminBookingRequest,
  getNotificationSummary,
  isSearchableQuery,
  listAdminBookingRequests,
  listAdminCars,
  listBookingStatusEvents,
  listCarSchedule,
  listNotifications,
  type NotificationStatus,
  type NotificationSummary,
  searchAdminBookingRequests,
} from '@/services/admin-booking-service';
import type { BookingRequest } from '@/types/booking';

const AUTO_REFRESH_MS = 60 * 1000;
const SEARCH_DEBOUNCE_MS = 400;

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

/** Tất cả xe (kể cả đang tắt) cho Lịch xe và Xe & giá. */
export function useAdminCars(enabled: boolean) {
  const [cars, setCars] = useState<AdminCar[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (isActive: () => boolean) => {
      if (!enabled) return;

      try {
        const data = await listAdminCars();

        if (isActive()) {
          setCars(data);
          setError(undefined);
        }
      } catch (loadError) {
        if (isActive()) setError(toLoadError(loadError));
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [enabled]
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

  return { cars, error, loading, reload };
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

/**
 * Tải dữ liệu admin khi màn hình được mở / quay lại; reload() để tải lại.
 * refreshMs: tự làm mới (im lặng) trong lúc màn hình đang mở.
 * `load` phải ổn định (useCallback).
 */
function useAdminResource<T>(
  load: () => Promise<T>,
  initial: T,
  enabled: boolean,
  refreshMs?: number
) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const run = useCallback(
    async (isActive: () => boolean, silent = false) => {
      if (!enabled) return;

      if (!silent) setLoading(true);

      try {
        const next = await load();

        if (isActive()) {
          setData(next);
          setError(undefined);
        }
      } catch (loadError) {
        if (isActive()) setError(toLoadError(loadError));
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [load, enabled]
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      run(() => active);

      const timer = refreshMs
        ? setInterval(() => run(() => active, true), refreshMs)
        : undefined;

      return () => {
        active = false;

        if (timer) clearInterval(timer);
      };
    }, [run, refreshMs])
  );

  const reload = useCallback(() => {
    run(() => true);
  }, [run]);

  return { data, loading, error, reload };
}

export type AdminSearchStatus = 'idle' | 'too-short' | 'loading' | 'ready' | 'error';

type SearchState = {
  term: string;
  attempt: number;
  results: BookingRequest[];
  error?: string;
};

/**
 * Tìm đơn (RPC 0012) với debounce 400ms. Kết quả của chuỗi cũ về muộn bị
 * bỏ qua (chỉ nhận khi term + attempt còn khớp).
 */
export function useAdminBookingSearch(query: string, enabled: boolean) {
  const term = query.trim();
  const searchable = enabled && isSearchableQuery(term);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState | undefined>();

  useEffect(() => {
    if (!searchable) return;

    let active = true;

    const timer = setTimeout(async () => {
      try {
        const results = await searchAdminBookingRequests(term);

        if (active) setState({ term, attempt, results });
      } catch (searchError) {
        if (active) setState({ term, attempt, results: [], error: toLoadError(searchError) });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term, searchable, attempt]);

  const current =
    state && state.term === term && state.attempt === attempt ? state : undefined;

  const status: AdminSearchStatus = !term
    ? 'idle'
    : !searchable
      ? 'too-short'
      : !current
        ? 'loading'
        : current.error
          ? 'error'
          : 'ready';

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    term,
    status,
    results: current?.results ?? [],
    error: current?.error,
    retry,
  };
}

/** Lịch sử trạng thái của một đơn (booking_status_events, 0004). */
export function useBookingStatusEvents(bookingId: string | undefined, enabled: boolean) {
  const load = useCallback(
    () => (bookingId ? listBookingStatusEvents(bookingId) : Promise.resolve([])),
    [bookingId]
  );
  const { data, loading, error, reload } = useAdminResource<BookingStatusEvent[]>(
    load,
    [],
    enabled
  );

  return { events: data, loading, error, reload };
}

const EMPTY_SUMMARY: NotificationSummary = { failed: 0, pending: 0, overduePending: 0, sent: 0 };

/** Đếm thông báo Telegram theo trạng thái; tự làm mới mỗi 60 giây. */
export function useNotificationSummary(enabled: boolean) {
  const { data, error, reload } = useAdminResource(
    getNotificationSummary,
    EMPTY_SUMMARY,
    enabled,
    AUTO_REFRESH_MS
  );

  return { summary: data, error, reload };
}

/** Thông báo Telegram theo bộ lọc, hoặc của một đơn (bookingId). */
export function useAdminNotifications(
  filter: NotificationStatus | 'all',
  enabled: boolean,
  bookingId?: string
) {
  const load = useCallback(
    () =>
      listNotifications({
        status: filter === 'all' ? undefined : filter,
        bookingId,
      }),
    [filter, bookingId]
  );
  const { data, loading, error, reload } = useAdminResource<AdminNotification[]>(
    load,
    [],
    enabled,
    AUTO_REFRESH_MS
  );

  return { notifications: data, loading, error, reload };
}
