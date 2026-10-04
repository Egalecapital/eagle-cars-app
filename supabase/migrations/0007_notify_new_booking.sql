-- =====================================================================
-- Eagle Capital Cars — 0007_notify_new_booking.sql
-- TRẠNG THÁI: ĐÃ CHUẨN BỊ, CHƯA ÁP DỤNG LÊN PRODUCTION.
--
-- Thông báo đơn mới cho admin qua Telegram.
--   - Trigger AFTER INSERT trên booking_requests (đơn mới luôn ở pending).
--   - Gửi bằng pg_net: bất đồng bộ, CHỈ gửi sau khi transaction commit
--     (rollback → không gửi). Không làm chậm hay chặn việc tạo đơn.
--   - Bot token + chat id lưu trong Supabase Vault (mã hoá), KHÔNG nằm
--     trong app hay git. Chưa cấu hình → trigger bỏ qua, không lỗi.
--   - Mọi lỗi khi chuẩn bị thông báo bị nuốt (RAISE WARNING) → không bao
--     giờ làm hỏng create_booking_request.
--
-- Cấu hình sau khi có bot (chạy 1 lần trong SQL Editor, KHÔNG commit):
--   select vault.create_secret('<BOT_TOKEN>', 'eagle_telegram_bot_token', 'Telegram bot token');
--   select vault.create_secret('<CHAT_ID>',   'eagle_telegram_chat_id',   'Telegram chat id nhận đơn mới');
--
-- Lưu ý dữ liệu: tin nhắn chứa tên + số điện thoại khách (để admin gọi
-- lại ngay) và được gửi tới Telegram. Chỉ đưa bot vào chat/nhóm nội bộ.
-- =====================================================================

create extension if not exists pg_net with schema extensions;


create or replace function public.notify_new_booking_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token   text;
  v_chat_id text;
  v_service text;
  v_note    text;
  v_text    text;
begin
  begin
    select ds.decrypted_secret into v_token
    from vault.decrypted_secrets ds
    where ds.name = 'eagle_telegram_bot_token';

    select ds.decrypted_secret into v_chat_id
    from vault.decrypted_secrets ds
    where ds.name = 'eagle_telegram_chat_id';

    -- Chưa cấu hình → bỏ qua.
    if coalesce(v_token, '') = '' or coalesce(v_chat_id, '') = '' then
      return null;
    end if;

    v_service := case new.service_type
      when 'self_drive'  then 'Tự lái'
      when 'with_driver' then 'Có lái'
      when 'wedding'     then 'Xe cưới'
      else new.service_type
    end;

    v_note := case
      when new.customer_note is null then ''
      else E'\nGhi chú: ' || new.customer_note
    end;

    -- Mỗi đoạn đều là E'...' và nối bằng || để \n luôn là xuống dòng.
    v_text := format(
      E'🚗 ĐƠN ĐẶT XE MỚI — %s\n'
      || E'Xe: %s\n'
      || E'Hình thức: %s\n'
      || E'Nhận: %s\n'
      || E'Trả: %s (%s ngày)\n'
      || E'Nơi nhận: %s\n'
      || E'Khách: %s — %s\n'
      || E'Tổng dự kiến: %sđ%s\n\n'
      || E'Mở app Quản trị để xác nhận hoặc từ chối.',
      new.booking_code,
      new.car_name,
      v_service,
      to_char(new.pickup_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY'),
      to_char(new.return_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY'),
      new.rental_days,
      new.pickup_location,
      new.customer_name,
      new.customer_phone,
      replace(to_char(new.estimated_total, 'FM999,999,999,999'), ',', '.'),
      v_note
    );

    perform net.http_post(
      url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body    := jsonb_build_object(
                   'chat_id', v_chat_id,
                   'text', v_text,
                   'disable_web_page_preview', true
                 ),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
  exception
    when others then
      -- Thông báo là phụ: không bao giờ chặn việc tạo đơn.
      raise warning 'notify_new_booking_request skipped: %', sqlerrm;
  end;

  return null;  -- AFTER trigger
end;
$$;

revoke all on function public.notify_new_booking_request()
  from public, anon, authenticated;


create trigger booking_requests_notify_new
  after insert on public.booking_requests
  for each row
  when (new.status = 'pending')
  execute function public.notify_new_booking_request();


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (KHÔNG tự chạy):
--   drop trigger if exists booking_requests_notify_new on public.booking_requests;
--   drop function if exists public.notify_new_booking_request();
--   -- (giữ extension pg_net; xoá secret nếu cần:
--   --  delete from vault.secrets where name in ('eagle_telegram_bot_token','eagle_telegram_chat_id');)
-- ---------------------------------------------------------------------
