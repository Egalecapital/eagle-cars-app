import { Stack } from 'expo-router';
import Head from 'expo-router/head';

/**
 * Khu vực quản trị. Mỗi màn (trừ login) tự kiểm tra quyền bằng
 * useAdminGuard — chỉ phục vụ UX; bảo mật thật ở RLS + RPC (0003/0005/0012).
 */
export default function AdminLayout() {
  return (
    <>
      {/* Web: không cho công cụ tìm kiếm index khu quản trị. */}
      <Head>
        <title>Quản trị — Eagle Capital Cars</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="calendar" />
        <Stack.Screen name="cars" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="new-booking" />
        <Stack.Screen name="edit/[requestId]" />
        <Stack.Screen name="request/[requestId]" />
      </Stack>
    </>
  );
}
