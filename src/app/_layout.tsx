import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { PushHandler } from '@/components/push-handler';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <>
      {/* Web: tiêu đề + mô tả mặc định cho tab trình duyệt / kết quả tìm kiếm. */}
      <Head>
        <title>Eagle Capital Cars — Thuê xe sang</title>
        <meta
          name="description"
          content="Đặt thuê xe sang tự lái, có lái và xe cưới cùng Eagle Capital Cars. Xem xe, chọn lịch và gửi yêu cầu đặt xe trực tuyến."
        />
      </Head>
      <AnimatedSplashOverlay />
      <PushHandler />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="car/[id]" />
        <Stack.Screen name="booking/[carId]" />
        <Stack.Screen name="request/[requestId]" />
        <Stack.Screen name="account/login" />
        <Stack.Screen name="account/delete" />
        <Stack.Screen name="legal/privacy" />
        <Stack.Screen name="legal/terms" />
        <Stack.Screen name="admin" />
      </Stack>
    </>
  );
}
