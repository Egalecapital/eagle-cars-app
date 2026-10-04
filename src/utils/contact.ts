import { Alert, Linking, Platform } from 'react-native';

import {
  CONTACT_PHONE_DISPLAY,
  CONTACT_TEL_URL,
  CONTACT_ZALO_URL,
} from '@/constants/contact';

function showFallback(message: string) {
  if (Platform.OS === 'web') {
    // Alert của react-native-web không hỗ trợ đầy đủ; dùng hộp thoại trình duyệt.
    globalThis.alert?.(message);
  } else {
    Alert.alert('Liên hệ Eagle Capital Cars', message);
  }
}

/** Gọi điện cho Eagle Capital; không mở được thì hiện số để khách tự gọi. */
export async function callEagleCapital() {
  try {
    await Linking.openURL(CONTACT_TEL_URL);
  } catch {
    showFallback(`Vui lòng gọi số ${CONTACT_PHONE_DISPLAY}.`);
  }
}

/** Mở Zalo chat với Eagle Capital; không mở được thì hiện số Zalo. */
export async function openEagleCapitalZalo() {
  try {
    await Linking.openURL(CONTACT_ZALO_URL);
  } catch {
    showFallback(`Vui lòng nhắn Zalo số ${CONTACT_PHONE_DISPLAY}.`);
  }
}
