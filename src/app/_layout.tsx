import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // TEMP — test kết nối Supabase Auth. Gỡ khi booking-service nối Supabase.
  useEffect(() => {
    testSupabaseAuth();
  }, []);

  return (
    <>
      <AnimatedSplashOverlay />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="car/[id]" />
        <Stack.Screen name="booking/[carId]" />
        <Stack.Screen name="request/[requestId]" />
      </Stack>
    </>
  );
}

// TEMP — chỉ log user.id, không log token, key hay toàn bộ session.
// Import động để lỗi cấu hình Supabase không làm sập UI.
async function testSupabaseAuth() {
  try {
    const { ensureSession } = await import('@/services/auth-service');
    const { user } = await ensureSession();

    console.log('[Supabase Auth] Anonymous session ready', {
      userId: user.id,
      isAnonymous: user.is_anonymous,
    });
  } catch (error) {
    const cause =
      error instanceof Error && error.cause && typeof error.cause === 'object'
        ? (error.cause as { name?: string; code?: string; status?: number })
        : undefined;

    console.error('[Supabase Auth] Failed to get session', {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      causeName: cause?.name,
      causeCode: cause?.code,
      causeStatus: cause?.status,
    });
  }
}