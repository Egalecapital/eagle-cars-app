-- =====================================================================
-- Eagle Capital Cars — 0016_telegram_admin_booking_message.sql
--
-- Tin Telegram cho đơn ADMIN NHẬP (0014, khách gọi điện / đến trực tiếp):
-- trước đây giống hệt đơn khách gửi qua app ("ĐƠN ĐẶT XE MỚI … Mở app Quản
-- trị để xác nhận hoặc từ chối") → nhân viên dễ tưởng là đơn app mới cần xử
-- lý và xử lý trùng.
--
-- Chỉ thay public.telegram_booking_message (0010) — cùng chữ ký, cùng quyền.
-- Đơn app (source = 'app'): nội dung GIỮ NGUYÊN như 0010.
-- Đơn admin: tiêu đề + dòng cuối khác. Tin được dựng ngay khi INSERT (trước
-- khi admin_create_booking chuyển sang confirmed) nên KHÔNG nói về trạng thái.
--
-- KHÔNG có trong migration này: bảng / policy / trigger / cron mới; thay đổi
-- telegram_send_outbox, process_notification_outbox, Vault, nội dung đã gửi.
-- Phụ thuộc: 0010 (hàm gốc), 0014 (cột source).
-- =====================================================================

create or replace function public.telegram_booking_message(b public.booking_requests)
returns text
language sql
stable
set search_path = ''
as $$
  select format(
    E'%s — %s\n'
    || E'Xe: %s\n'
    || E'Hình thức: %s\n'
    || E'Nhận: %s\n'
    || E'Trả: %s (%s ngày)\n'
    || E'Nơi nhận: %s\n'
    || E'Khách: %s — %s\n'
    || E'Tổng dự kiến: %sđ%s\n\n'
    || E'%s',
    case when b.source = 'admin'
      then '📞 ĐƠN ADMIN NHẬP (khách gọi điện / trực tiếp)'
      else '🚗 ĐƠN ĐẶT XE MỚI'
    end,
    b.booking_code,
    b.car_name,
    case b.service_type
      when 'self_drive'  then 'Tự lái'
      when 'with_driver' then 'Có lái'
      when 'wedding'     then 'Xe cưới'
      else b.service_type
    end,
    to_char(b.pickup_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY'),
    to_char(b.return_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY'),
    b.rental_days,
    b.pickup_location,
    b.customer_name,
    b.customer_phone,
    replace(to_char(b.estimated_total, 'FM999,999,999,999'), ',', '.'),
    case when b.customer_note is null then '' else E'\nGhi chú: ' || b.customer_note end,
    case when b.source = 'admin'
      then 'Đơn do admin nhập trong app Quản trị — không phải yêu cầu mới từ khách, không cần xử lý lại.'
      else 'Mở app Quản trị để xác nhận hoặc từ chối.'
    end
  );
$$;

-- create or replace giữ ACL; nhắc lại cho chắc (chỉ dùng nội bộ).
revoke all on function public.telegram_booking_message(public.booking_requests)
  from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (KHÔNG tự chạy): chạy lại khối CREATE FUNCTION
-- public.telegram_booking_message trong 0010_notification_outbox.sql.
-- ---------------------------------------------------------------------
