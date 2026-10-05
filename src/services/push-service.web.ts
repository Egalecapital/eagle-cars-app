/**
 * Web: expo-notifications không hỗ trợ push trên web. Giữ cùng API với
 * push-service.ts để màn hình dùng chung; thông báo trong app vẫn hoạt động.
 */
export type PushStatus = 'unsupported' | 'not-configured' | 'undetermined' | 'denied' | 'granted';

export async function getPushStatus(): Promise<PushStatus> {
  return 'unsupported';
}

export async function registerForPush(_askPermission: boolean): Promise<PushStatus> {
  return 'unsupported';
}

export async function unregisterPush(): Promise<void> {}

export function subscribePushTaps(
  _onTap: (data: { bookingId?: string; notificationId?: number }) => void
): () => void {
  return () => {};
}

export const pushSupportedOnPlatform = false;
