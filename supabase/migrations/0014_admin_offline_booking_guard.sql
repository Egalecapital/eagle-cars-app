-- =====================================================================
-- Eagle Capital Cars — 0014_admin_offline_booking_guard.sql
--
-- Vận hành thực tế + chống trùng / spam:
--   1. booking_requests.source ('app' | 'admin'): đơn khách gửi qua app hay
--      đơn admin nhập (khách gọi điện / đến trực tiếp).
--   2. admin_create_booking: admin nhập đơn ngoài app, mặc định XÁC NHẬN
--      NGAY để giữ lịch xe (exclusion constraint vẫn là lớp chặn trùng cuối).
--      Không có đơn ngoài app trong hệ thống → khách app có thể đặt trùng giờ
--      một xe đang được thuê.
--   3. Trigger chặn trên mọi INSERT không phải của admin:
--      - DUPLICATE_REQUEST: cùng tài khoản/phiên, cùng xe, cùng giờ nhận/trả,
--        đơn trước còn chờ / đã xác nhận (vd khách bấm gửi lại khi mạng chập
--        chờn sau khi server đã lưu).
--      - TOO_MANY_REQUESTS: > 10 đơn / giờ / tài khoản (cùng với giới hạn 5
--        đơn chờ của 0001).
--
-- KHÔNG có trong migration này: sửa create_booking_request / các RPC cũ,
-- guard / log 0004, exclusion constraint, Telegram / push / cron.
-- Đơn admin tạo vẫn đi qua trigger 0004 (lịch sử ghi admin), trigger Telegram
-- (nhóm nhận tin như đơn mới) và trigger thông báo khách 0013 (user_id null
-- → không báo ai).
--
-- Phụ thuộc: 0001, 0003 (is_admin), 0004, 0013 (user_id cho phép null).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Nguồn đơn. Đơn cũ = 'app'. Thêm cột có giá trị mặc định cố định:
--    chỉ đổi metadata, không ghi lại bảng.
-- ---------------------------------------------------------------------
alter table public.booking_requests
  add column if not exists source text not null default 'app';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.booking_requests'::regclass
      and conname = 'booking_requests_source_check'
  ) then
    alter table public.booking_requests
      add constraint booking_requests_source_check check (source in ('app', 'admin'));
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. CHẶN TRÙNG / SPAM (BEFORE INSERT)
--   - SECURITY INVOKER: chỉ đọc booking_requests; khi chạy trong
--     create_booking_request (definer) thì đọc được toàn bảng.
--   - Bỏ qua khi người thực hiện là admin, hoặc đơn không có chủ (admin nhập).
--   - Tên trigger bắt đầu "booking_requests_guard_" → chạy cùng nhóm với
--     guard 0004 (thứ tự theo tên).
-- ---------------------------------------------------------------------
create or replace function public.guard_booking_request_abuse()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is null or new.source = 'admin' or public.is_admin() then
    return new;
  end if;

  if exists (
    select 1 from public.booking_requests b
    where b.user_id = new.user_id
      and b.car_id = new.car_id
      and b.pickup_at = new.pickup_at
      and b.return_at = new.return_at
      and b.status in ('pending', 'confirmed')
  ) then
    raise exception 'DUPLICATE_REQUEST';
  end if;

  if (
    select count(*) from public.booking_requests b
    where b.user_id = new.user_id
      and b.created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'TOO_MANY_REQUESTS';
  end if;

  return new;
end;
$$;

drop trigger if exists booking_requests_guard_abuse on public.booking_requests;
create trigger booking_requests_guard_abuse
  before insert on public.booking_requests
  for each row execute function public.guard_booking_request_abuse();


-- ---------------------------------------------------------------------
-- 3. RPC admin_create_booking — nhập đơn ngoài app
--   - Admin kiểm tra trước mọi thứ (NOT_ADMIN).
--   - Xe phải tồn tại (kể cả xe đang tắt: xe ẩn khỏi app vẫn có thể cho
--     thuê trực tiếp). Giá lấy từ bảng cars; p_final_total (tuỳ chọn) là giá
--     chốt.
--   - Thời gian: trả sau nhận, tối đa 30 ngày (CHECK của bảng), giờ nhận
--     không sớm hơn 24 giờ trước hiện tại (cho phép ghi đơn đang diễn ra).
--   - Cùng ràng buộc dữ liệu với create_booking_request (tên, SĐT, địa điểm,
--     ghi chú). user_id = null (không có tài khoản app), source = 'admin'.
--   - p_confirm = true (mặc định): chuyển ngay pending → confirmed trong cùng
--     transaction; trùng lịch đơn đã xác nhận → BOOKING_CONFLICT (DETAIL nêu
--     mã đơn) và KHÔNG tạo gì.
-- ---------------------------------------------------------------------
create or replace function public.admin_create_booking(
  p_car_id          text,
  p_service_type    text,
  p_pickup_at       timestamptz,
  p_return_at       timestamptz,
  p_pickup_location text,
  p_return_location text,
  p_customer_name   text,
  p_customer_phone  text,
  p_customer_note   text    default null,
  p_final_total     bigint  default null,
  p_confirm         boolean default true
)
returns public.booking_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_alphabet   constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_car        public.cars%rowtype;
  v_pickup_loc text := btrim(coalesce(p_pickup_location, ''));
  v_return_loc text := nullif(btrim(coalesce(p_return_location, '')), '');
  v_name       text := btrim(coalesce(p_customer_name, ''));
  v_phone      text := btrim(coalesce(p_customer_phone, ''));
  v_note       text := nullif(btrim(coalesce(p_customer_note, '')), '');
  v_days       integer;
  v_bytes      bytea;
  v_code       text;
  v_row        public.booking_requests%rowtype;
  v_conflict   text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select * into v_car from public.cars where id = p_car_id;
  if not found then
    raise exception 'CAR_NOT_FOUND';
  end if;

  if p_service_type is null or p_service_type not in ('self_drive', 'with_driver', 'wedding') then
    raise exception 'INVALID_SERVICE_TYPE';
  end if;

  if p_pickup_at is null or p_return_at is null or p_return_at <= p_pickup_at then
    raise exception 'INVALID_TIME_RANGE';
  end if;

  if p_pickup_at < now() - interval '1 day' then
    raise exception 'PICKUP_TOO_OLD';
  end if;

  v_days := greatest(1, ceil(extract(epoch from (p_return_at - p_pickup_at)) / 86400)::integer);
  if v_days > 30 then
    raise exception 'RENTAL_TOO_LONG';
  end if;

  v_return_loc := coalesce(v_return_loc, v_pickup_loc);
  if char_length(v_pickup_loc) not between 3 and 300
     or char_length(v_return_loc) not between 3 and 300 then
    raise exception 'INVALID_LOCATION';
  end if;

  if char_length(v_name) not between 2 and 100 then
    raise exception 'INVALID_NAME';
  end if;

  if char_length(v_phone) > 20
     or char_length(regexp_replace(v_phone, '\D', '', 'g')) not between 9 and 11 then
    raise exception 'INVALID_PHONE';
  end if;

  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'NOTE_TOO_LONG';
  end if;

  if p_final_total is not null and p_final_total < 0 then
    raise exception 'INVALID_FINAL_TOTAL';
  end if;

  for attempt in 1..5 loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code  := 'EC-';
    for i in 0..7 loop
      v_code := v_code || substr(c_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;

    begin
      insert into public.booking_requests (
        booking_code, user_id, source,
        car_id, car_name, service_type,
        pickup_at, return_at,
        pickup_location, return_location,
        customer_name, customer_phone, customer_note,
        price_per_day, rental_days, estimated_total,
        status
      )
      values (
        v_code, null, 'admin',
        v_car.id, v_car.name, p_service_type,
        p_pickup_at, p_return_at,
        v_pickup_loc, v_return_loc,
        v_name, v_phone, v_note,
        v_car.price_per_day, v_days, v_car.price_per_day * v_days,
        'pending'
      )
      returning * into v_row;
      exit;
    exception
      when unique_violation then
        if attempt = 5 then
          raise exception 'BOOKING_CODE_GENERATION_FAILED';
        end if;
    end;
  end loop;

  if coalesce(p_confirm, true) then
    begin
      update public.booking_requests
      set status      = 'confirmed',
          final_total = coalesce(p_final_total, v_row.estimated_total)
      where id = v_row.id
      returning * into v_row;
    exception
      when exclusion_violation then
        select b.booking_code into v_conflict
        from public.booking_requests b
        where b.car_id = v_row.car_id
          and b.status = 'confirmed'
          and b.id <> v_row.id
          and tstzrange(b.pickup_at, b.return_at, '[)')
              && tstzrange(v_row.pickup_at, v_row.return_at, '[)')
        order by b.pickup_at
        limit 1;

        -- Lỗi làm rollback cả đơn vừa tạo (cùng transaction).
        raise exception 'BOOKING_CONFLICT'
          using detail = case
            when v_conflict is null then 'conflicts with a confirmed booking'
            else format('conflicts with confirmed booking %s', v_conflict)
          end;
    end;
  elsif p_final_total is not null then
    update public.booking_requests set final_total = p_final_total
    where id = v_row.id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. QUYỀN FUNCTION
-- ---------------------------------------------------------------------
revoke all on function public.guard_booking_request_abuse() from public, anon, authenticated;

revoke all on function public.admin_create_booking(
  text, text, timestamptz, timestamptz, text, text, text, text, text, bigint, boolean
) from public, anon, authenticated;
grant execute on function public.admin_create_booking(
  text, text, timestamptz, timestamptz, text, text, text, text, text, bigint, boolean
) to authenticated;


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (KHÔNG tự chạy):
--   drop function if exists public.admin_create_booking(text, text, timestamptz, timestamptz, text, text, text, text, text, bigint, boolean);
--   drop trigger if exists booking_requests_guard_abuse on public.booking_requests;
--   drop function if exists public.guard_booking_request_abuse();
--   -- Cột source: chỉ xoá khi chấp nhận mất thông tin nguồn đơn:
--   --   alter table public.booking_requests drop constraint if exists booking_requests_source_check;
--   --   alter table public.booking_requests drop column if exists source;
-- ---------------------------------------------------------------------
