import { Stack } from 'expo-router';

/**
 * Khu vực quản trị. Mỗi màn (trừ login) tự kiểm tra quyền bằng
 * useAdminGuard — chỉ phục vụ UX; bảo mật thật ở RLS + RPC (0003/0005/0012).
 */
export default function AdminLayout() {
  return (
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
  );
}
