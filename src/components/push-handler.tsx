import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';
import { markNotificationsRead } from '@/services/notification-service';
import { registerForPush, subscribePushTaps } from '@/services/push-service';

/**
 * Gắn ở root layout (không hiển thị gì):
 * - Bấm vào push → mở đúng đơn, đánh dấu thông báo đã đọc.
 * - Khi mở app / đăng nhập: nếu người dùng đã cho phép thông báo trước đó,
 *   đăng ký lại push token cho phiên hiện tại (không hỏi quyền ở đây).
 */
export function PushHandler() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = subscribePushTaps(({ bookingId, notificationId }) => {
      if (notificationId) {
        markNotificationsRead([notificationId]).catch(() => {});
      }

      if (bookingId) {
        router.push({ pathname: '/request/[requestId]', params: { requestId: bookingId } });
      }
    });

    registerForPush(false).catch(() => {});

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        // Không gọi API Supabase trực tiếp trong callback (khuyến nghị của supabase-js).
        setTimeout(() => {
          registerForPush(false).catch(() => {});
        }, 0);
      }
    });

    return () => {
      unsubscribe();
      data.subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
