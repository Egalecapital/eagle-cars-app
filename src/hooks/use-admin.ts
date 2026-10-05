import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { checkIsAdmin } from '@/services/admin-auth-service';
import {
  AdminBookingError,
  countPendingBookings,
  type AdminCar,
  type AdminNotification,
  type AdminStatusFilter,
  type BookingAccount,
  type BookingChange,
  type BookingCustomerNotification,
  type BookingStatusEvent,
  getAdminBookingRequest,
  getBookingAccount,
  getNotificationSummary,
  getPushSummary,
  isSearchableQuery,
  listAdminBookingRequests,
  listAdminCars,
  listBookingChanges,
  listBookingCustomerNotifications,
  listBookingStatusEvents,
  listCarSchedule,
  listNotifications,
  listPushNotifications,
  listTodayOperations,
  type NotificationStatus,
  type NotificationSummary,
  searchAdminBookingRequests,
} from '@/services/admin-booking-service';
import { type FleetCar, getFleetCar, listFleetCars } from '@/services/fleet-admin-service';
import type { BookingRequest } from '@/types/booking';
import { addDaysToKey, vnDateKey, vnDayStart } from '@/utils/vn-time';

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

const EMPTY_SUMMARY: NotificationSummary = {
  failed: 0,
  pending: 0,
  overduePending: 0,
  sent: 0,
  skipped: 0,
};

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

/** Đếm push cho khách theo trạng thái; tự làm mới mỗi 60 giây. */
export function usePushSummary(enabled: boolean) {
  const { data, error, reload } = useAdminResource(
    getPushSummary,
    EMPTY_SUMMARY,
    enabled,
    AUTO_REFRESH_MS
  );

  return { summary: data, error, reload };
}

/** Push cho khách theo bộ lọc. */
export function useAdminPushNotifications(filter: NotificationStatus | 'all', enabled: boolean) {
  const load = useCallback(
    () => listPushNotifications({ status: filter === 'all' ? undefined : filter }),
    [filter]
  );
  const { data, loading, error, reload } = useAdminResource<AdminNotification[]>(
    load,
    [],
    enabled,
    AUTO_REFRESH_MS
  );

  return { notifications: data, loading, error, reload };
}

/** Loại tài khoản sở hữu đơn (ẩn danh / số điện thoại / đã xoá). */
export function useBookingAccount(bookingId: string | undefined, enabled: boolean) {
  const load = useCallback(
    () => (bookingId ? getBookingAccount(bookingId) : Promise.resolve(undefined)),
    [bookingId]
  );
  const { data, error, reload } = useAdminResource<BookingAccount | undefined>(
    load,
    undefined,
    enabled
  );

  return { account: data, error, reload };
}

/** Thông báo đã gửi cho khách của một đơn + trạng thái push. */
export function useBookingCustomerNotifications(
  booking: { id: string; bookingCode: string } | undefined,
  enabled: boolean
) {
  const id = booking?.id;
  const code = booking?.bookingCode;
  const load = useCallback(
    () =>
      id && code ? listBookingCustomerNotifications({ id, bookingCode: code }) : Promise.resolve([]),
    [id, code]
  );
  const { data, loading, error, reload } = useAdminResource<BookingCustomerNotification[]>(
    load,
    [],
    enabled
  );

  return { notifications: data, loading, error, reload };
}

/** Số đơn đang chờ xác nhận; tự làm mới mỗi 60 giây. */
export function usePendingCount(enabled: boolean) {
  const { data, reload } = useAdminResource(countPendingBookings, 0, enabled, AUTO_REFRESH_MS);

  return { pendingCount: data, reload };
}

/** Nhật ký chỉnh sửa của một đơn (0015). */
export function useBookingChanges(bookingId: string | undefined, enabled: boolean) {
  const load = useCallback(
    () => (bookingId ? listBookingChanges(bookingId) : Promise.resolve([])),
    [bookingId]
  );
  const { data, error, reload } = useAdminResource<BookingChange[]>(load, [], enabled);

  return { changes: data, error, reload };
}

export type TodayOperations = {
  /** Đã quá giờ trả mà chưa bấm hoàn tất. */
  overdue: BookingRequest[];
  /** Giờ nhận nằm trong hôm nay (giờ VN). */
  pickups: BookingRequest[];
  /** Giờ trả nằm trong hôm nay và chưa tới. */
  returns: BookingRequest[];
  /** Đang cho thuê (đã tới giờ nhận, chưa tới giờ trả). */
  ongoing: BookingRequest[];
};

const EMPTY_TODAY: TodayOperations = { overdue: [], pickups: [], returns: [], ongoing: [] };

/** Việc cần làm hôm nay theo giờ VN; tự làm mới mỗi 60 giây. */
export function useTodayOperations(enabled: boolean) {
  const load = useCallback(async (): Promise<TodayOperations> => {
    const now = Date.now();
    const todayKey = vnDateKey(new Date(now));
    const start = vnDayStart(todayKey).getTime();
    const end = vnDayStart(addDaysToKey(todayKey, 1)).getTime();
    const items = await listTodayOperations(new Date(end));
    const ms = (iso: string) => new Date(iso).getTime();

    return {
      overdue: items.filter((item) => ms(item.returnAt) <= now),
      pickups: items.filter((item) => ms(item.pickupAt) >= start && ms(item.pickupAt) < end),
      returns: items.filter((item) => ms(item.returnAt) > now && ms(item.returnAt) < end),
      ongoing: items.filter((item) => ms(item.pickupAt) <= now && ms(item.returnAt) > now),
    };
  }, []);
  const { data, error, reload } = useAdminResource(load, EMPTY_TODAY, enabled, AUTO_REFRESH_MS);

  return { today: data, error, reload };
}

/** Đội xe (0018): mọi xe, kể cả đang tắt / lưu trữ. */
export function useFleetCars(enabled: boolean) {
  const { data, loading, error, reload } = useAdminResource<FleetCar[]>(listFleetCars, [], enabled);

  return { cars: data, loading, error, reload };
}

/** Một xe trong đội xe (undefined = không tìm thấy). */
export function useFleetCar(carId: string | undefined, enabled: boolean) {
  const load = useCallback(
    () => (carId ? getFleetCar(carId) : Promise.resolve(undefined)),
    [carId]
  );
  const { data, loading, error, reload } = useAdminResource<FleetCar | undefined>(
    load,
    undefined,
    enabled
  );

  return { car: data, loading, error, reload };
}
