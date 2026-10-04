import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * HTML gốc cho bản web (chỉ chạy khi render tĩnh, không có DOM).
 * lang="vi" + translate="no": nội dung là tiếng Việt; tránh Chrome tưởng là
 * tiếng Anh rồi tự "dịch" sai (vd "Chờ xác nhận" → "Trâu xác nhận").
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="vi" translate="no">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="google" content="notranslate" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
