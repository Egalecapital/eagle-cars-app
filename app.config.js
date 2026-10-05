/**
 * Cấu hình động bọc app.json — KHÔNG đổi gì khi chạy bình thường.
 *
 * - Mặc định: giữ nguyên app.json (web.output "server" cho EAS Hosting,
 *   https://eagle-cars-app.expo.app).
 * - EAGLE_WEB_OUTPUT=static: build web tĩnh cho shared hosting (OnePanel,
 *   https://eaglecapital.vn) — dùng qua `npm run build:web-hosting`.
 */
module.exports = ({ config }) => {
  if (process.env.EAGLE_WEB_OUTPUT !== 'static') {
    return config;
  }

  return { ...config, web: { ...config.web, output: 'static' } };
};
