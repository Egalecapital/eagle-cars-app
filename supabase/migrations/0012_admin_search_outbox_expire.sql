-- =====================================================================
-- Eagle Capital Cars — 0012_admin_search_outbox_expire.sql
--
-- Gộp 3 thay đổi DB cho công cụ admin (chỉ THÊM hàm + 1 cron job):
--   1. admin_search_booking_requests : tìm đơn theo mã EC / số điện thoại /
--      tên khách (chỉ admin).
--   2. Theo dõi thông báo Telegram (outbox 0010) cho admin:
--        admin_notification_outbox_summary, admin_list_notification_outbox,
--        admin_retry_notification (đưa dòng failed về pending để cron gửi lại).
--   3. system_expire_stale_booking_requests + pg_cron mỗi 5 phút: đơn pending
--      quá giờ nhận tự chuyển expired, không cần ai mở app.
--
-- Lịch sử thao tác dùng booking_status_events (0004) — admin đã có quyền
-- SELECT (policy booking_status_events_select_admin), không cần thay đổi.
--
-- KHÔNG có trong migration này (không sửa / thay thế):
--   - Bảng, cột, index, policy, trigger hiện có.
--   - create_booking_request, cancel_my_booking_request, các RPC admin
--     0005/0006/0011, expire_stale_booking_requests (0006), guard/log 0004,
--     exclusion constraint, check_car_availability, các hàm outbox/Telegram
--     của 0010 và cron job 'eagle-notification-outbox'.
--   - Không đọc Vault, không gọi pg_net.
--
-- Phụ thuộc: 0001, 0003 (is_admin), 0004, 0010 (notification_outbox, pg_cron).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TÌM ĐƠN (admin)
--   - SECURITY INVOKER: hàm chỉ đọc, chạy với quyền người gọi → RLS của
--     booking_requests vẫn áp dụng (lớp bảo vệ thứ hai: khách chỉ thấy đơn
--     của mình). Lớp thứ nhất: is_admin() kiểm tra đầu tiên → NOT_ADMIN.
--   - p_query 2..100 ký tự (sau trim), sai → INVALID_QUERY.
--   - Khớp nếu thoả MỘT trong các điều kiện (OR, nên chuỗi mơ hồ vẫn an toàn):
--       mã đơn : bỏ khoảng trắng/gạch, chữ hoa; "EC" + 1..8 ký tự → tiền tố
--                'EC-...'; hoặc đúng 8 ký tự mã (không gõ EC) → 'EC-' + mã.
--       SĐT    : chuỗi chỉ gồm số và . + ( ) - khoảng trắng, ≥ 4 chữ số.
--                So "số quốc gia" (bỏ 0 đầu, hoặc bỏ 84 đầu khi ≥ 11 số) ở
--                cả hai phía, kiểu CHỨA → tìm được 4 số đuôi; 0877 522 222,
--                +84877522222, 0877.522.222 đều khớp nhau.
--                Chuỗi dạng số nhưng < 4 chữ số → INVALID_QUERY.
--       tên    : customer_name ILIKE '%…%' (escape \ % _). Không phân biệt
--                hoa/thường, CÓ phân biệt dấu.
--   - Mọi trạng thái; mới nhất trước; p_limit giới hạn 1..50 (mặc định 20).
--   - Không có index cho SĐT/tên: quét bảng, đủ nhanh ở quy mô MVP. Khi bảng
--     lớn (~50.000 đơn) cân nhắc pg_trgm + GIN.
-- ---------------------------------------------------------------------
create or replace function public.admin_search_booking_requests(
  p_query text,
  p_limit integer default 20
)
returns setof public.booking_requests
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_q      text := btrim(coalesce(p_query, ''));
  v_limit  integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_compact text;
  v_code   text;
  v_phone  text;
  v_name   text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if char_length(v_q) not between 2 and 100 then
    raise exception 'INVALID_QUERY';
  end if;

  -- Mã đơn
  v_compact := upper(regexp_replace(v_q, '[\s-]', '', 'g'));

  if v_compact ~ '^EC[0-9A-Z]{1,8}$' then
    v_code := 'EC-' || substr(v_compact, 3);
  elsif v_compact ~ '^[0-9A-Z]{8}$' and v_compact ~ '[A-Z]' then
    v_code := 'EC-' || v_compact;
  end if;

  -- Số điện thoại hoặc tên
  if v_q ~ '^[0-9\s.+()-]+$' then
    v_phone := regexp_replace(v_q, '\D', '', 'g');

    if char_length(v_phone) < 4 then
      raise exception 'INVALID_QUERY';
    end if;

    v_phone := case
      when v_phone ~ '^84' and char_length(v_phone) >= 11 then substr(v_phone, 3)
      when v_phone ~ '^0' then substr(v_phone, 2)
      else v_phone
    end;
  else
    v_name := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select b.*
  from public.booking_requests b
  cross join lateral (
    select regexp_replace(b.customer_phone, '\D', '', 'g') as d
  ) p
  where (v_code is not null and b.booking_code like v_code || '%')
     or (v_phone is not null and (
          case
            when p.d ~ '^84' and char_length(p.d) >= 11 then substr(p.d, 3)
            when p.d ~ '^0' then substr(p.d, 2)
            else p.d
          end
        ) like '%' || v_phone || '%')
     or (v_name is not null and b.customer_name ilike v_name escape '\')
  order by b.created_at desc, b.id
  limit v_limit;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. THEO DÕI THÔNG BÁO TELEGRAM (admin)
--   - notification_outbox không có quyền nào cho client (0010) → các hàm
--     dưới đây SECURITY DEFINER, kiểm tra is_admin() TRƯỚC mọi thứ.
--   - Chỉ trả cột vận hành + mã đơn / tên xe. Outbox không chứa token,
--     chat id, URL hay nội dung tin; last_error chỉ là mã cố định hoặc
--     SQLSTATE (0010). Không trả last_request_id.
-- ---------------------------------------------------------------------

-- 2a. Đếm theo trạng thái. overdue_pending: pending đã tạo > 10 phút
--     (bình thường gửi xong trong vòng 1–2 phút).
create or replace function public.admin_notification_outbox_summary(
  out failed_count          integer,
  out pending_count         integer,
  out overdue_pending_count integer,
  out sent_count            integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select
    count(*) filter (where o.status = 'failed')::integer,
    count(*) filter (where o.status = 'pending')::integer,
    count(*) filter (where o.status = 'pending'
                       and o.created_at < now() - interval '10 minutes')::integer,
    count(*) filter (where o.status = 'sent')::integer
  into failed_count, pending_count, overdue_pending_count, sent_count
  from public.notification_outbox o;
end;
$$;

-- 2b. Danh sách: failed trước, rồi pending, rồi sent; mới nhất trước.
--     p_status null = tất cả; p_booking_id lọc theo một đơn; p_limit 1..200.
create or replace function public.admin_list_notification_outbox(
  p_status     text    default null,
  p_booking_id uuid    default null,
  p_limit      integer default 50
)
returns table (
  id               bigint,
  booking_id       uuid,
  booking_code     text,
  car_name         text,
  channel          text,
  status           text,
  attempts         integer,
  max_attempts     integer,
  last_attempt_at  timestamptz,
  next_attempt_at  timestamptz,
  last_status_code integer,
  last_error       text,
  sent_at          timestamptz,
  created_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if p_status is not null and p_status not in ('pending', 'sent', 'failed') then
    raise exception 'INVALID_STATUS';
  end if;

  return query
  select
    o.id, o.booking_id, b.booking_code, b.car_name, o.channel, o.status,
    o.attempts, o.max_attempts, o.last_attempt_at, o.next_attempt_at,
    o.last_status_code, o.last_error, o.sent_at, o.created_at
  from public.notification_outbox o
  join public.booking_requests b on b.id = o.booking_id
  where (p_status is null or o.status = p_status)
    and (p_booking_id is null or o.booking_id = p_booking_id)
  order by
    case o.status when 'failed' then 0 when 'pending' then 1 else 2 end,
    o.created_at desc,
    o.id desc
  limit v_limit;
end;
$$;

-- 2c. Gửi lại thủ công một dòng FAILED.
--   - Chỉ đưa dòng về pending (attempts = 0, gửi ngay ở lượt cron kế tiếp,
--     ≤ 1 phút). KHÔNG gửi trong hàm: không đọc Vault, không gọi pg_net.
--   - Khoá dòng FOR UPDATE; bấm hai lần → lần sau NOTIFICATION_NOT_FAILED.
--   - last_error = 'MANUAL_RETRY' để admin thấy dòng đang chờ gửi lại;
--     lần gửi kế tiếp sẽ ghi đè.
--   - Có thể tạo tin TRÙNG nếu Telegram thật ra đã nhận (giống 0010).
create or replace function public.admin_retry_notification(
  p_outbox_id bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select o.status into v_status
  from public.notification_outbox o
  where o.id = p_outbox_id
  for update;

  if not found then
    raise exception 'NOTIFICATION_NOT_FOUND';
  end if;

  if v_status <> 'failed' then
    raise exception 'NOTIFICATION_NOT_FAILED';
  end if;

  update public.notification_outbox
  set status           = 'pending',
      attempts         = 0,
      last_request_id  = null,
      last_status_code = null,
      last_error       = 'MANUAL_RETRY',
      next_attempt_at  = now()
  where id = p_outbox_id;

  return 'pending';
end;
$$;


-- ---------------------------------------------------------------------
-- 3. TỰ HẾT HẠN ĐƠN PENDING QUÁ GIỜ NHẬN (pg_cron)
--   - Cùng quy tắc và cùng status_reason với expire_stale_booking_requests
--     (0006), nhưng không cần phiên người dùng → chạy được từ pg_cron.
--   - Đi qua trigger guard (pending → expired hợp lệ) và trigger log 0004:
--     lịch sử ghi changed_by = null, actor_role = session_user (postgres)
--     → app hiển thị "Hệ thống".
--   - Chỉ chạm đơn pending; đơn confirmed/... không bị ảnh hưởng. Nếu admin
--     đang xác nhận cùng đơn, UPDATE chờ khoá rồi đánh giá lại điều kiện
--     status = 'pending' trên bản mới nhất → bỏ qua đơn đã confirmed.
--   - Dùng index booking_requests_status_pickup_idx (0001).
--   - Không cấp EXECUTE cho client; chỉ cron (postgres) gọi.
--   - expire_stale_booking_requests (0006) giữ nguyên: app vẫn gọi khi mở
--     danh sách để cập nhật tức thì giữa hai lượt cron.
-- ---------------------------------------------------------------------
create or replace function public.system_expire_stale_booking_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.booking_requests
  set status        = 'expired',
      status_reason = 'Quá giờ nhận xe nhưng yêu cầu chưa được xác nhận.'
  where status = 'pending'
    and pickup_at <= now();

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. QUYỀN FUNCTION
-- ---------------------------------------------------------------------
revoke all on function public.admin_search_booking_requests(text, integer)
  from public, anon, authenticated;
grant execute on function public.admin_search_booking_requests(text, integer)
  to authenticated;

revoke all on function public.admin_notification_outbox_summary()
  from public, anon, authenticated;
grant execute on function public.admin_notification_outbox_summary()
  to authenticated;

revoke all on function public.admin_list_notification_outbox(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.admin_list_notification_outbox(text, uuid, integer)
  to authenticated;

revoke all on function public.admin_retry_notification(bigint)
  from public, anon, authenticated;
grant execute on function public.admin_retry_notification(bigint)
  to authenticated;

revoke all on function public.system_expire_stale_booking_requests()
  from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. CRON: mỗi 5 phút. Cùng tên → cron.schedule cập nhật job, không tạo trùng.
-- ---------------------------------------------------------------------
select cron.schedule(
  'eagle-expire-stale-bookings',
  '*/5 * * * *',
  'select public.system_expire_stale_booking_requests();'
);


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (KHÔNG tự chạy):
--   select cron.unschedule('eagle-expire-stale-bookings');
--   drop function if exists public.system_expire_stale_booking_requests();
--   drop function if exists public.admin_retry_notification(bigint);
--   drop function if exists public.admin_list_notification_outbox(text, uuid, integer);
--   drop function if exists public.admin_notification_outbox_summary();
--   drop function if exists public.admin_search_booking_requests(text, integer);
-- ---------------------------------------------------------------------
