-- =====================================================================
-- Eagle Capital Cars — 0010_notification_outbox.sql
--
-- Độ tin cậy cho thông báo Telegram đơn mới: outbox + pg_cron gửi lại.
--   - Mỗi đơn mới có 1 dòng public.notification_outbox, ghi CÙNG transaction
--     với đơn (đơn rollback → outbox rollback).
--   - Gửi lần đầu ngay trong trigger như 0008 (timeout 15s thay vì 5s).
--   - pg_cron chạy public.process_notification_outbox() mỗi phút để đối soát
--     request_id với net._http_response và gửi lại khi cần.
--
-- State machine (status = 'pending' | 'sent' | 'failed'):
--   pending + last_request_id IS NULL  + đến hạn → GỬI (attempts + 1),
--       lưu request_id, hẹn đối soát sau 30 giây.
--   pending + last_request_id NOT NULL + đến hạn → ĐỐI SOÁT phản hồi:
--       chưa có phản hồi, < 5 phút từ lần gửi → chờ thêm (KHÔNG gửi mới)
--       chưa có phản hồi, ≥ 5 phút           → coi là thất bại → retry
--       2xx + Telegram ok=true               → sent
--       timeout / lỗi mạng / 5xx             → retry
--       429                                  → retry sau retry_after (1–3600s)
--       4xx khác / 2xx mà ok≠true            → failed (không retry)
--   retry: hết lượt (attempts ≥ max_attempts=8) → failed;
--          còn lượt → xoá request_id, hẹn gửi lại theo backoff.
--   Backoff sau lần thử thứ n: 1, 2, 5, 10, 30, 60, 120 phút.
--   Chỉ gửi request mới khi request trước ĐÃ được kết luận thất bại.
--
-- An toàn:
--   - Đặt xe KHÔNG BAO GIỜ thất bại vì thông báo: mọi lỗi trong trigger bị
--     nuốt; lỗi ghi outbox → đơn vẫn tạo (không có outbox); lỗi gửi → outbox
--     ở pending, cron gửi lại.
--   - Outbox KHÔNG lưu token / chat id / nội dung tin (tin dựng lại từ đơn
--     lúc gửi). Token chỉ đọc từ Vault (telegram_bot_token, telegram_chat_id).
--   - Không ghi sqlerrm / URL vào log hay bảng (lỗi pg_net có thể chứa URL
--     kèm token); last_error chỉ là mã cố định hoặc SQLSTATE.
--   - Client (anon/authenticated) không có quyền gì trên bảng và các hàm.
--   - Gửi lại sau timeout có thể tạo tin TRÙNG (Telegram đã nhận nhưng phản
--     hồi chậm) — đã chấp nhận; mỗi tin luôn có mã đơn EC-....
--
-- Phụ thuộc: 0001 (booking_requests), 0007 (trigger booking_requests_notify_new,
-- pg_net), 0008 (bản hàm hiện tại — được thay ở đây). Không sửa 0007–0009.
-- =====================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;


-- ---------------------------------------------------------------------
-- 1. BẢNG notification_outbox
-- ---------------------------------------------------------------------
create table if not exists public.notification_outbox (
  id               bigint generated always as identity primary key,
  booking_id       uuid not null
                   references public.booking_requests (id) on delete restrict,
  channel          text not null default 'telegram'
                   check (channel in ('telegram')),
  status           text not null default 'pending'
                   check (status in ('pending', 'sent', 'failed')),
  attempts         integer not null default 0 check (attempts >= 0),
  max_attempts     integer not null default 8 check (max_attempts between 1 and 20),
  last_request_id  bigint,
  last_attempt_at  timestamptz,
  next_attempt_at  timestamptz not null default now(),
  last_status_code integer,
  last_error       text check (last_error is null or char_length(last_error) <= 100),
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (booking_id, channel)
);

-- Cron chỉ quét dòng pending đến hạn.
create index if not exists notification_outbox_due_idx
  on public.notification_outbox (next_attempt_at)
  where status = 'pending';

drop trigger if exists notification_outbox_set_updated_at on public.notification_outbox;
create trigger notification_outbox_set_updated_at
  before update on public.notification_outbox
  for each row execute function public.set_updated_at();

-- Không client nào được đụng vào outbox (chứa liên kết tới đơn có PII).
alter table public.notification_outbox enable row level security;
revoke all on table public.notification_outbox from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Dựng nội dung tin từ đơn (giống 0008; luôn có mã đơn EC-...)
-- ---------------------------------------------------------------------
create or replace function public.telegram_booking_message(b public.booking_requests)
returns text
language sql
stable
set search_path = ''
as $$
  select format(
    E'🚗 ĐƠN ĐẶT XE MỚI — %s\n'
    || E'Xe: %s\n'
    || E'Hình thức: %s\n'
    || E'Nhận: %s\n'
    || E'Trả: %s (%s ngày)\n'
    || E'Nơi nhận: %s\n'
    || E'Khách: %s — %s\n'
    || E'Tổng dự kiến: %sđ%s\n\n'
    || E'Mở app Quản trị để xác nhận hoặc từ chối.',
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
    case when b.customer_note is null then '' else E'\nGhi chú: ' || b.customer_note end
  );
$$;


-- ---------------------------------------------------------------------
-- 3. Đọc phản hồi pg_net theo request_id (tách riêng để TEST10 giả lập
--    phản hồi trong transaction rollback mà không gửi Telegram thật).
-- ---------------------------------------------------------------------
create or replace function public.notification_outbox_response(
  p_request_id bigint,
  out has_response boolean,
  out status_code integer,
  out timed_out   boolean,
  out has_error   boolean,
  out content     text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select true, r.status_code, coalesce(r.timed_out, false), r.error_msg is not null, r.content
  into has_response, status_code, timed_out, has_error, content
  from net._http_response r
  where r.id = p_request_id;

  if has_response is null then
    has_response := false;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. GỬI một dòng outbox (một lần thử). Không bao giờ raise ra ngoài.
-- ---------------------------------------------------------------------
create or replace function public.telegram_send_outbox(p_outbox_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row     public.notification_outbox%rowtype;
  v_booking public.booking_requests%rowtype;
  v_token   text;
  v_chat_id text;
  v_req     bigint;
begin
  select * into v_row from public.notification_outbox where id = p_outbox_id;
  if not found or v_row.status <> 'pending' then
    return;
  end if;

  begin
    select * into v_booking from public.booking_requests where id = v_row.booking_id;

    select ds.decrypted_secret into v_token
    from vault.decrypted_secrets ds where ds.name = 'telegram_bot_token';
    select ds.decrypted_secret into v_chat_id
    from vault.decrypted_secrets ds where ds.name = 'telegram_chat_id';

    v_token   := btrim(coalesce(v_token, ''),   E' \t\r\n');
    v_chat_id := btrim(coalesce(v_chat_id, ''), E' \t\r\n');

    if v_token !~ '^[0-9]+:[A-Za-z0-9_-]+$'
       or v_chat_id !~ '^(-?[0-9]+|@[A-Za-z0-9_]{5,})$' then
      -- Cấu hình thiếu/sai: tính là một lần thử thất bại, cron thử lại sau.
      update public.notification_outbox
      set attempts        = attempts + 1,
          last_attempt_at = now(),
          last_request_id = null,
          last_error      = 'CONFIG_INVALID',
          status          = case when attempts + 1 >= max_attempts then 'failed' else 'pending' end,
          next_attempt_at = now() + interval '5 minutes'
      where id = p_outbox_id;
      return;
    end if;

    v_req := net.http_post(
      url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body    := jsonb_build_object(
                   'chat_id', v_chat_id,
                   'text', public.telegram_booking_message(v_booking),
                   'disable_web_page_preview', true
                 ),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 15000
    );

    update public.notification_outbox
    set attempts        = attempts + 1,
        last_attempt_at = now(),
        last_request_id = v_req,
        last_error      = null,
        next_attempt_at = now() + interval '30 seconds'
    where id = p_outbox_id;
  exception
    when others then
      -- KHÔNG ghi sqlerrm (có thể chứa URL kèm token).
      update public.notification_outbox
      set attempts        = attempts + 1,
          last_attempt_at = now(),
          last_request_id = null,
          last_error      = 'SEND_ERROR_' || sqlstate,
          status          = case when attempts + 1 >= max_attempts then 'failed' else 'pending' end,
          next_attempt_at = now() + interval '5 minutes'
      where id = p_outbox_id;
  end;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. XỬ LÝ outbox (pg_cron mỗi phút). Trả số dòng đã xử lý.
--    FOR UPDATE SKIP LOCKED: hai lần chạy đồng thời không xử lý trùng dòng.
-- ---------------------------------------------------------------------
create or replace function public.process_notification_outbox()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_no_response_after constant interval := interval '5 minutes';
  r          public.notification_outbox%rowtype;
  v_resp     record;
  v_ok       boolean;
  v_retry_s  integer;
  v_retry    boolean;
  v_wait     interval;
  v_error    text;
  v_n        integer := 0;
begin
  for r in
    select * from public.notification_outbox
    where status = 'pending' and next_attempt_at <= now()
    order by next_attempt_at
    limit 50
    for update skip locked
  loop
    v_n := v_n + 1;

    begin
      -- (a) Chưa có request đang chờ → gửi.
      if r.last_request_id is null then
        if r.attempts >= r.max_attempts then
          update public.notification_outbox
          set status = 'failed', last_error = coalesce(last_error, 'MAX_ATTEMPTS')
          where id = r.id;
        else
          perform public.telegram_send_outbox(r.id);
        end if;
        continue;
      end if;

      -- (b) Có request → đối soát phản hồi.
      select * into v_resp from public.notification_outbox_response(r.last_request_id);
      v_retry := false;
      v_wait  := null;

      if not v_resp.has_response then
        if now() - r.last_attempt_at < c_no_response_after then
          -- Có thể vẫn đang xử lý: KHÔNG gửi mới, hẹn kiểm tra lại.
          update public.notification_outbox
          set next_attempt_at = now() + interval '1 minute'
          where id = r.id;
          continue;
        end if;
        v_retry := true;
        v_error := 'NO_RESPONSE';

      elsif v_resp.timed_out or v_resp.has_error or v_resp.status_code is null then
        v_retry := true;
        v_error := case when v_resp.timed_out then 'TIMEOUT' else 'NETWORK_ERROR' end;

      elsif v_resp.status_code between 200 and 299 then
        v_ok := false;
        begin
          v_ok := coalesce((v_resp.content::jsonb ->> 'ok')::boolean, false);
        exception when others then
          v_ok := false;
        end;

        if v_ok then
          update public.notification_outbox
          set status = 'sent', sent_at = now(), last_status_code = v_resp.status_code, last_error = null
          where id = r.id;
        else
          update public.notification_outbox
          set status = 'failed', last_status_code = v_resp.status_code, last_error = 'TELEGRAM_NOT_OK'
          where id = r.id;
        end if;
        continue;

      elsif v_resp.status_code = 429 then
        v_retry := true;
        v_error := 'RATE_LIMITED';
        v_retry_s := null;
        begin
          v_retry_s := (v_resp.content::jsonb -> 'parameters' ->> 'retry_after')::integer;
        exception when others then
          v_retry_s := null;
        end;
        v_wait := make_interval(secs => least(greatest(coalesce(v_retry_s, 60), 1), 3600));

      elsif v_resp.status_code >= 500 then
        v_retry := true;
        v_error := 'HTTP_' || v_resp.status_code;

      else
        -- 4xx cố định (token/chat sai, nội dung sai...) → không retry.
        update public.notification_outbox
        set status = 'failed', last_status_code = v_resp.status_code,
            last_error = 'HTTP_' || v_resp.status_code
        where id = r.id;
        continue;
      end if;

      if v_retry then
        if r.attempts >= r.max_attempts then
          update public.notification_outbox
          set status = 'failed', last_status_code = v_resp.status_code, last_error = v_error
          where id = r.id;
        else
          update public.notification_outbox
          set last_request_id  = null,
              last_status_code = v_resp.status_code,
              last_error       = v_error,
              next_attempt_at  = now() + coalesce(
                v_wait,
                case r.attempts
                  when 1 then interval '1 minute'
                  when 2 then interval '2 minutes'
                  when 3 then interval '5 minutes'
                  when 4 then interval '10 minutes'
                  when 5 then interval '30 minutes'
                  when 6 then interval '60 minutes'
                  else interval '120 minutes'
                end)
          where id = r.id;
        end if;
      end if;
    exception
      when others then
        -- Lỗi xử lý một dòng không chặn các dòng khác; KHÔNG ghi sqlerrm.
        update public.notification_outbox
        set last_error = 'PROCESS_ERROR_' || sqlstate,
            next_attempt_at = now() + interval '5 minutes'
        where id = r.id;
    end;
  end loop;

  return v_n;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. TRIGGER: thay hàm của 0008. Ghi outbox + gửi lần đầu.
--    Hai khối exception riêng: lỗi ghi outbox / lỗi gửi đều KHÔNG phá đơn.
-- ---------------------------------------------------------------------
create or replace function public.notify_new_booking_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outbox_id bigint;
begin
  begin
    insert into public.notification_outbox (booking_id, channel)
    values (new.id, 'telegram')
    on conflict (booking_id, channel) do nothing
    returning id into v_outbox_id;
  exception
    when others then
      raise warning 'notification_outbox insert failed (SQLSTATE %), skipped', sqlstate;
      return null;
  end;

  if v_outbox_id is not null then
    begin
      perform public.telegram_send_outbox(v_outbox_id);
    exception
      when others then
        -- Dòng outbox vẫn còn (pending) → cron gửi lại.
        raise warning 'telegram first send failed (SQLSTATE %), will retry', sqlstate;
    end;
  end if;

  return null;  -- AFTER trigger
end;
$$;


-- ---------------------------------------------------------------------
-- 7. QUYỀN: chỉ dùng nội bộ (trigger / cron chạy với quyền postgres).
-- ---------------------------------------------------------------------
revoke all on function public.telegram_booking_message(public.booking_requests) from public, anon, authenticated;
revoke all on function public.notification_outbox_response(bigint)               from public, anon, authenticated;
revoke all on function public.telegram_send_outbox(bigint)                        from public, anon, authenticated;
revoke all on function public.process_notification_outbox()                       from public, anon, authenticated;
revoke all on function public.notify_new_booking_request()                        from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 8. CRON: mỗi phút. cron.schedule cùng tên sẽ CẬP NHẬT job (không tạo trùng)
--    → chạy lại migration vẫn chỉ có 1 job 'eagle-notification-outbox'.
-- ---------------------------------------------------------------------
select cron.schedule(
  'eagle-notification-outbox',
  '* * * * *',
  'select public.process_notification_outbox();'
);


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (KHÔNG tự chạy):
--   select cron.unschedule('eagle-notification-outbox');
--   -- trả trigger về hành vi 0008: chạy lại phần CREATE FUNCTION của 0008
--   drop function if exists public.process_notification_outbox();
--   drop function if exists public.telegram_send_outbox(bigint);
--   drop function if exists public.notification_outbox_response(bigint);
--   drop function if exists public.telegram_booking_message(public.booking_requests);
--   drop table if exists public.notification_outbox;
--   -- (giữ extension pg_cron / pg_net)
-- ---------------------------------------------------------------------
