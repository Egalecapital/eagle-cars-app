import { LegalPage, type LegalSection } from '@/components/legal-page';
import { CONTACT_PHONE_DISPLAY } from '@/constants/contact';

// Chỉ mô tả đúng những gì ứng dụng đang làm. Cập nhật văn bản khi thay đổi
// dữ liệu thu thập, bên xử lý hoặc cách lưu trữ.
const SECTIONS: LegalSection[] = [
  {
    heading: '1. Dữ liệu chúng tôi thu thập',
    paragraphs: [
      'Khi bạn gửi yêu cầu đặt xe: họ tên, số điện thoại, địa điểm và thời gian nhận/trả xe, hình thức thuê, xe đã chọn và ghi chú (nếu có).',
      'Khi bạn đăng nhập: số điện thoại dùng để nhận mã OTP và đăng nhập.',
      'Khi bạn bật thông báo đẩy: mã thiết bị nhận thông báo (push token) do Apple / Google / Expo cấp.',
      'Dữ liệu vận hành: trạng thái và lịch sử xử lý đơn, thông báo đã gửi cho bạn. Khi chưa đăng nhập, ứng dụng dùng một mã phiên ẩn danh trên thiết bị để nhận ra các đơn của bạn.',
      'Ứng dụng không dùng công cụ quảng cáo hay phân tích hành vi, không thu thập vị trí GPS, danh bạ hay ảnh.',
    ],
  },
  {
    heading: '2. Mục đích sử dụng',
    paragraphs: [
      'Tiếp nhận, xác nhận và thực hiện yêu cầu thuê xe; liên hệ với bạn về đơn đặt xe.',
      'Gửi thông báo khi đơn được xác nhận, từ chối, huỷ, hết hạn hoặc hoàn tất.',
      'Giữ sổ sách đặt xe và lịch sử xử lý đơn phục vụ vận hành của Eagle Capital.',
      'Chúng tôi không bán dữ liệu cá nhân của bạn.',
    ],
  },
  {
    heading: '3. Bên cung cấp dịch vụ xử lý dữ liệu',
    paragraphs: [
      'Supabase: lưu trữ cơ sở dữ liệu và đăng nhập.',
      'Nhà cung cấp SMS (qua Supabase): gửi mã OTP tới số điện thoại của bạn.',
      'Expo, Apple và Google: chuyển thông báo đẩy tới thiết bị của bạn.',
      'Telegram: thông tin yêu cầu đặt xe mới (gồm họ tên, số điện thoại, xe, thời gian, địa điểm) được gửi vào nhóm Telegram nội bộ của nhân viên Eagle Capital để xử lý kịp thời.',
    ],
  },
  {
    heading: '4. Lưu trữ và xoá dữ liệu',
    paragraphs: [
      'Đơn đặt xe được lưu để phục vụ sổ sách và hỗ trợ khách hàng.',
      'Bạn có thể xoá tài khoản (hoặc dữ liệu đặt xe trên thiết bị) trong mục Tài khoản. Khi xoá, tài khoản đăng nhập, thông báo và push token bị xoá; họ tên, số điện thoại, ghi chú và địa điểm trên các đơn cũ được ẩn đi. Thông tin xe, thời gian, giá và trạng thái đơn được giữ lại cho sổ sách.',
      'Đơn đang chờ xác nhận hoặc đã xác nhận chưa hoàn tất cần được huỷ / xử lý xong trước khi xoá.',
      'Tin nhắn đã gửi vào nhóm Telegram nội bộ không tự động bị xoá khi bạn xoá tài khoản; bạn có thể liên hệ Eagle Capital để yêu cầu xử lý.',
    ],
  },
  {
    heading: '5. Bảo mật',
    paragraphs: [
      'Dữ liệu được truyền qua kết nối mã hoá (HTTPS). Mỗi khách chỉ xem được đơn và thông báo của chính mình; chỉ nhân viên có quyền quản trị mới xem được toàn bộ đơn.',
    ],
  },
  {
    heading: '6. Quyền của bạn',
    paragraphs: [
      'Bạn có thể xem các đơn của mình trong mục Đơn của tôi, xoá tài khoản / dữ liệu trong mục Tài khoản, và liên hệ Eagle Capital để yêu cầu sửa thông tin hoặc hỏi về dữ liệu của bạn.',
      `Liên hệ: ${CONTACT_PHONE_DISPLAY} (gọi điện hoặc Zalo).`,
    ],
  },
];

export default function PrivacyScreen() {
  return (
    <LegalPage
      title="CHÍNH SÁCH QUYỀN RIÊNG TƯ"
      updated="05/10/2026"
      intro="Văn bản này mô tả dữ liệu mà ứng dụng Eagle Cars của Eagle Capital thu thập, cách sử dụng và quyền của bạn đối với dữ liệu đó."
      sections={SECTIONS}
    />
  );
}
