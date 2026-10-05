import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { subscribeBookingRequests } from '@/services/booking-service';
import {
  countUnreadNotifications,
  type CustomerNotification,
  listMyNotifications,
  NotificationError,
  subscribeNotificationChanges,
} from '@/services/notification-service';

const UNREAD_REFRESH_MS = 60 * 1000;

/** Danh sách thông báo của khách; tải lại khi mở màn hình, reload() thủ công. */
export function useMyNotifications() {
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const run = useCallback(async (isActive: () => boolean, manual = false) => {
    if (manual) setRefreshing(true);

    try {
      const data = await listMyNotifications();

      if (isActive()) {
        setNotifications(data);
        setError(undefined);
      }
    } catch (loadError) {
      if (isActive()) {
        setError(
          loadError instanceof NotificationError
            ? loadError.userMessage
            : 'Không tải được thông báo. Vui lòng thử lại.'
        );
      }
    } finally {
      if (isActive()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      run(() => active);

      const unsubscribe = subscribeNotificationChanges(() => run(() => active));

      return () => {
        active = false;
        unsubscribe();
      };
    }, [run])
  );

  const reload = useCallback(() => {
    run(() => true, true);
  }, [run]);

  return { notifications, loading, refreshing, error, reload };
}

/**
 * Số thông báo chưa đọc cho badge: tải khi mở app, mỗi 60 giây, khi đăng
 * nhập/đăng xuất, khi đánh dấu đã đọc và khi vừa tạo / huỷ đơn.
 */
export function useUnreadNotificationCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;

    const refresh = () => {
      countUnreadNotifications().then((value) => {
        if (active) setCount(value);
      });
    };

    refresh();

    const timer = setInterval(refresh, UNREAD_REFRESH_MS);
    const offChanges = subscribeNotificationChanges(refresh);
    const offBookings = subscribeBookingRequests(refresh);
    const { data } = supabase.auth.onAuthStateChange(() => {
      setTimeout(refresh, 0);
    });

    return () => {
      active = false;
      clearInterval(timer);
      offChanges();
      offBookings();
      data.subscription.unsubscribe();
    };
  }, []);

  return count;
}
