import type { Href, useRouter } from 'expo-router';

type AppRouter = ReturnType<typeof useRouter>;

/**
 * Quay lại màn trước nếu có; nếu không (vd mở trang trực tiếp trên web
 * hoặc vừa tải lại trang) thì chuyển tới `fallback` thay vì lỗi GO_BACK.
 */
export function goBackOr(router: AppRouter, fallback: Href) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
