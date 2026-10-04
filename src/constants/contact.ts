/**
 * Thông tin liên hệ chính thức của Eagle Capital Cars.
 * Gọi điện và Zalo dùng cùng một số.
 */
export const CONTACT_PHONE = '0877522222';

/** Hiển thị dễ đọc. */
export const CONTACT_PHONE_DISPLAY = '0877 522 222';

/** Gọi điện (iOS/Android mở app Điện thoại; web mở trình xử lý tel: của máy). */
export const CONTACT_TEL_URL = `tel:${CONTACT_PHONE}`;

/**
 * Link chat Zalo chính thức theo số điện thoại: mở app Zalo nếu đã cài,
 * nếu không thì mở trang Zalo trên trình duyệt.
 */
export const CONTACT_ZALO_URL = `https://zalo.me/${CONTACT_PHONE}`;
