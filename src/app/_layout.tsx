import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { PushHandler } from '@/components/push-handler';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <>
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
