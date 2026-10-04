/**
 * Web: không dùng expo-sqlite (cần cấu hình wasm/worker riêng).
 * undefined → supabase-js tự dùng localStorage của trình duyệt
 * (và bộ nhớ tạm khi render tĩnh phía server, nơi không có window).
 */
export const authStorage = undefined;
