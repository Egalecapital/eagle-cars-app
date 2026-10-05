import { LegalPage, type LegalSection } from '@/components/legal-page';
import { CONTACT_PHONE_DISPLAY } from '@/constants/contact';

const SECTIONS: LegalSection[] = [
  {
    heading: '1. Yêu cầu đặt xe',
    paragraphs: [
      'Gửi yêu cầu trong ứng dụng chưa phải là xác nhận thuê xe. Xe chỉ được giữ cho bạn khi đơn chuyển sang trạng thái "Đã xác nhận".',
      'Yêu cầu chưa được xác nhận trước giờ nhận xe sẽ tự động chuyển sang "Đã hết hạn".',
    ],
  },
  {
    heading: '2. Giá',
    paragraphs: [
      'Giá hiển thị khi đặt là giá dự kiến theo bảng giá tại thời điểm gửi yêu cầu. Giá chính thức do Eagle Capital xác nhận và hiển thị trong đơn sau khi xác nhận.',
    ],
  },
  {
    heading: '3. Huỷ đơn',
    paragraphs: [
      'Bạn có thể tự huỷ yêu cầu đang chờ xác nhận trong ứng dụng.',
      'Với đơn đã xác nhận, vui lòng liên hệ trực tiếp Eagle Capital để được hỗ trợ.',
    ],
  },
  {
    heading: '4. Thông tin khách hàng',
    paragraphs: [
      'Bạn cần cung cấp họ tên, số điện thoại và địa điểm chính xác để Eagle Capital liên hệ và giao xe.',
      'Điều kiện thuê cụ thể (giấy tờ, đặt cọc, bảo hiểm, quy định sử dụng xe…) được Eagle Capital thoả thuận trực tiếp với bạn khi xác nhận và khi bàn giao xe.',
    ],
  },
  {
    heading: '5. Tài khoản',
    paragraphs: [
      'Đăng nhập bằng số điện thoại là không bắt buộc. Bạn chịu trách nhiệm giữ bí mật mã OTP và thiết bị đã đăng nhập.',
      'Bạn có thể xoá tài khoản bất kỳ lúc nào trong mục Tài khoản (xem Chính sách quyền riêng tư).',
    ],
  },
  {
    heading: '6. Thay đổi',
    paragraphs: [
      'Eagle Capital có thể cập nhật ứng dụng và các điều khoản này; ngày cập nhật được ghi ở đầu trang.',
      `Liên hệ: ${CONTACT_PHONE_DISPLAY} (gọi điện hoặc Zalo).`,
    ],
  },
];

export default function TermsScreen() {
  return (
    <LegalPage
      title="ĐIỀU KHOẢN SỬ DỤNG"
      updated="05/10/2026"
      intro="Khi sử dụng ứng dụng Eagle Cars để gửi yêu cầu thuê xe với Eagle Capital, bạn đồng ý với các điều khoản dưới đây."
      sections={SECTIONS}
    />
  );
}
