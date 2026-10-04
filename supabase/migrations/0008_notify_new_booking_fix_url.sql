-- =====================================================================
-- Eagle Capital Cars — 0008_notify_new_booking_fix_url.sql
--
-- Sửa hàm trigger của 0007 (0007 đã chạy Production, không sửa file đó).
--
-- Lỗi gặp phải: secret trong Vault có ký tự thừa (khoảng trắng / xuống
-- dòng khi copy token) → URL 'https://api.telegram.org/bot<token>/sendMessage'
-- bị pg_net báo "Malformed input to a URL function" → không gửi được.
-- Ngoài ra 0007 ghi sqlerrm vào RAISE WARNING; thông báo lỗi của pg_net
-- chứa URL (có token) → token có thể lọt vào log.
--
-- Bản sửa:
--   1. Cắt khoảng trắng / xuống dòng hai đầu token và chat id.
--   2. Kiểm tra định dạng: token '<số>:<ký tự [A-Za-z0-9_-]>',
--      chat id là số (có thể âm) hoặc '@tên_kênh'. Sai → bỏ qua, không gửi.
--   3. Log CHỈ có SQLSTATE / mô tả chung — KHÔNG BAO GIỜ ghi sqlerrm,
--      token hay chat id.
--   4. Giữ nguyên: bất đồng bộ qua pg_net, chỉ gửi sau commit, mọi lỗi bị
--      nuốt → không bao giờ làm khách đặt xe thất bại.
-- Trigger booking_requests_notify_new (0007) giữ nguyên, tự dùng hàm mới.
-- =====================================================================

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
    where ds.name = 'telegram_bot_token';

    select ds.decrypted_secret into v_chat_id
    from vault.decrypted_secrets ds
    where ds.name = 'telegram_chat_id';

    -- Ký tự thừa khi copy (space, tab, CR, LF) ở hai đầu.
    v_token   := btrim(coalesce(v_token, ''),   E' \t\r\n');
    v_chat_id := btrim(coalesce(v_chat_id, ''), E' \t\r\n');

    -- Chưa cấu hình → bỏ qua, im lặng.
    if v_token = '' or v_chat_id = '' then
      return null;
    end if;

    -- Sai định dạng → bỏ qua; log KHÔNG chứa giá trị.
    if v_token !~ '^[0-9]+:[A-Za-z0-9_-]+$'
       or v_chat_id !~ '^(-?[0-9]+|@[A-Za-z0-9_]{5,})$' then
      raise warning 'notify_new_booking_request: Telegram secret format invalid, skipped';
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
      -- KHÔNG ghi sqlerrm: lỗi của pg_net có thể chứa URL kèm token.
      raise warning 'notify_new_booking_request failed (SQLSTATE %), skipped', sqlstate;
  end;

  return null;  -- AFTER trigger
end;
$$;

revoke all on function public.notify_new_booking_request()
  from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (KHÔNG tự chạy): chạy lại phần CREATE FUNCTION của 0007.
-- ---------------------------------------------------------------------
