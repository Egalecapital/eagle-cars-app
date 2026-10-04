/**
 * SUPABASE CLIENT DÙNG CHUNG
 *
 * Theo hướng dẫn chính thức của Expo (Using Supabase):
 * - Session đăng nhập được lưu qua localStorage do expo-sqlite cung cấp
 *   trên iOS/Android (auth-storage.ts). Web dùng localStorage của trình
 *   duyệt (auth-storage.web.ts) để bundle web không kéo expo-sqlite.
 * - Expo đã có sẵn URL global nên không cần react-native-url-polyfill.
 *
 * Chỉ dùng publishable key (công khai được, an toàn khi RLS bật).
 * KHÔNG BAO GIỜ đưa service_role / secret key vào app.
 */
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { authStorage } from '@/lib/auth-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Thiếu cấu hình Supabase: cần EXPO_PUBLIC_SUPABASE_URL và EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY trong .env.local (xem .env.example). Sau khi sửa .env.local, khởi động lại Expo với "npx expo start -c".'
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Trên iOS/Android: chỉ tự làm mới token khi app đang mở (foreground),
// để không gọi refresh liên tục lúc app chạy nền.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
