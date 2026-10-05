/**
 * PUSH NOTIFICATION (iOS / Android) — Expo Push Service
 *
 * - Token thiết bị (ExponentPushToken[...]) đăng ký lên server qua RPC
 *   register_push_token (0013); server gửi push từ push_outbox bằng pg_cron.
 * - Cần: development/production build (Expo Go Android không hỗ trợ push từ
 *   SDK 53), EAS projectId trong app config (`eas init`), APNs / FCM
 *   credentials trên EAS. Thiếu một trong các điều kiện → trạng thái tương
 *   ứng, app vẫn chạy bình thường (thông báo trong app vẫn hoạt động).
 * - Không có secret trong app.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type PushStatus =
  | 'unsupported' // máy ảo / web
  | 'not-configured' // chưa có EAS projectId
  | 'undetermined'
  | 'denied'
  | 'granted';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let channelReady = false;
let registeredToken: string | undefined;

function getProjectId(): string | undefined {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
    ?.projectId;

  return fromExtra ?? Constants.easConfig?.projectId ?? undefined;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android' || channelReady) return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Cập nhật đơn đặt xe',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#D4AF37',
  });
  channelReady = true;
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!Device.isDevice) return 'unsupported';
  if (!getProjectId()) return 'not-configured';

  const { status } = await Notifications.getPermissionsAsync();

  if (status === 'granted') return 'granted';

  return status === 'denied' ? 'denied' : 'undetermined';
}

/**
 * Đăng ký push cho phiên hiện tại. askPermission = false: chỉ đăng ký khi
 * người dùng đã cho phép trước đó (gọi khi mở app / sau đăng nhập).
 * Trả trạng thái sau cùng; lỗi mạng / Expo không chặn app.
 */
export async function registerForPush(askPermission: boolean): Promise<PushStatus> {
  let status = await getPushStatus();

  if (status === 'unsupported' || status === 'not-configured') return status;

  if (status !== 'granted') {
    if (!askPermission || status === 'denied') return status;

    const result = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    status = result.status === 'granted' ? 'granted' : 'denied';

    if (status !== 'granted') return status;
  }

  const { data: session } = await supabase.auth.getSession();

  if (!session.session) return status;

  await ensureAndroidChannel();

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: getProjectId() });
  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });

  if (!error) registeredToken = token;

  return status;
}

/** Gỡ token của thiết bị khỏi tài khoản hiện tại (trước khi đăng xuất). */
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;

  try {
    await supabase.rpc('unregister_push_token', { p_token: registeredToken });
  } finally {
    registeredToken = undefined;
  }
}

/**
 * Lắng nghe khi người dùng bấm vào push: trả bookingId / notificationId
 * trong data (server gửi kèm) cho người gọi điều hướng.
 */
export function subscribePushTaps(
  onTap: (data: { bookingId?: string; notificationId?: number }) => void
): () => void {
  const handle = (response: Notifications.NotificationResponse | null | undefined) => {
    const data = response?.notification.request.content.data as
      | { bookingId?: unknown; notificationId?: unknown }
      | undefined;

    if (!data) return;

    onTap({
      bookingId: typeof data.bookingId === 'string' ? data.bookingId : undefined,
      notificationId: typeof data.notificationId === 'number' ? data.notificationId : undefined,
    });
  };

  // App được mở từ trạng thái tắt bằng cách bấm push.
  handle(Notifications.getLastNotificationResponse());

  const subscription = Notifications.addNotificationResponseReceivedListener(handle);

  return () => subscription.remove();
}

export const pushSupportedOnPlatform = true;
