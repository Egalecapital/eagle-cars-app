-- =====================================================================
-- Eagle Capital Cars — 0015_admin_edit_booking.sql
--
-- 1. admin_update_booking: admin sửa đơn ĐANG CHỜ / ĐÃ XÁC NHẬN (xe, thời
--    gian, hình thức, địa điểm, thông tin khách, ghi chú, giá chốt) mà KHÔNG
--    đổi trạng thái và không mất mã đơn / lịch sử.
--      - Khoá dòng FOR UPDATE + kiểm tra p_expected_updated_at (chống ghi đè
--        khi hai người sửa cùng lúc) → STALE_BOOKING.
--      - Exclusion constraint vẫn là lớp chặn trùng lịch cuối → BOOKING_CONFLICT.
--      - Đổi xe → giá/ngày lấy theo xe mới; chỉ đổi giờ → giữ giá/ngày đã chốt
--        lúc đặt. Số ngày + tổng dự kiến tính lại phía server.
--      - Ghi booking_change_events: xe / giờ / hình thức / giá ghi giá trị
--        cũ → mới; tên, SĐT, ghi chú, địa điểm CHỈ ghi "đã đổi" (không lưu
--        giá trị cũ để xoá tài khoản 0013 vẫn xoá hết thông tin cá nhân).
--      - Đơn của khách app: tạo thông báo 'booking_updated' (+ push) khi đổi
--        thông tin khách nhìn thấy. Lỗi thông báo không làm hỏng việc sửa.
-- 2. customer_notifications.kind: thêm 'booking_updated' (chỉ nới CHECK).
-- 3. admin_create_booking (thay bản 0014, giữ nguyên chữ ký): đơn tạo ở
--    trạng thái CHỜ thì giờ nhận phải ở tương lai — trước đây đơn chờ với giờ
--    nhận đã qua không bao giờ xác nhận được (0005 PICKUP_IN_PAST) và bị cron
--    0012 chuyển hết hạn sau vài phút.
--
-- KHÔNG có trong migration này: sửa create_booking_request, guard / log 0004,
-- exclusion constraint, catalog, Telegram / push / cron, quyền bảng cũ.
-- Phụ thuộc: 0001, 0003, 0004, 0005, 0013, 0014.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LỊCH SỬ CHỈNH SỬA ĐƠN (chỉ admin đọc; chỉ RPC ghi)
-- ---------------------------------------------------------------------
create table if not exists public.booking_change_events (
  id          bigint generated always as identity primary key,
  booking_id  uuid not null references public.booking_requests (id) on delete cascade,
  changed_by  uuid,
  changes     jsonb not null check (jsonb_typeof(changes) = 'object' and changes <> '{}'::jsonb),
  created_at  timestamptz not null default now()
);

create index if not exists booking_change_events_booking_idx
  on public.booking_change_events (booking_id, created_at);

alter table public.booking_change_events enable row level security;
revoke all on table public.booking_change_events from public, anon, authenticated;
grant select on table public.booking_change_events to authenticated;

drop policy if exists booking_change_events_select_admin on public.booking_change_events;
create policy booking_change_events_select_admin
  on public.booking_change_events
  for select
  to authenticated
  using ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 2. Thông báo "đơn đã được cập nhật" (chỉ nới danh sách kind)
-- ---------------------------------------------------------------------
alter table public.customer_notifications
  drop constraint if exists customer_notifications_kind_check;
alter table public.customer_notifications
  add constraint customer_notifications_kind_check check (kind in (
    'booking_confirmed', 'booking_rejected', 'booking_cancelled',
    'booking_expired', 'booking_completed', 'booking_updated'));


-- ---------------------------------------------------------------------
-- 3. RPC admin_update_booking
-- ---------------------------------------------------------------------
create or replace function public.admin_update_booking(
  p_booking_id          uuid,
  p_expected_updated_at timestamptz,
  p_car_id              text,
  p_service_type        text,
  p_pickup_at           timestamptz,
  p_return_at           timestamptz,
  p_pickup_location     text,
  p_return_location     text,
  p_customer_name       text,
  p_customer_phone      text,
  p_customer_note       text   default null,
  p_final_total         bigint default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old        public.booking_requests%rowtype;
  v_row        public.booking_requests%rowtype;
  v_car        public.cars%rowtype;
  v_pickup_loc text := btrim(coalesce(p_pickup_location, ''));
  v_return_loc text := nullif(btrim(coalesce(p_return_location, '')), '');
  v_name       text := btrim(coalesce(p_customer_name, ''));
  v_phone      text := btrim(coalesce(p_customer_phone, ''));
  v_note       text := nullif(btrim(coalesce(p_customer_note, '')), '');
  v_days       integer;
  v_price      bigint;
  v_final      bigint;
  v_changes    jsonb := '{}'::jsonb;
  v_labels     text[] := array[]::text[];
  v_conflict   text;
  v_notif_id   bigint;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select * into v_old from public.booking_requests where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- Ai đó vừa sửa / đổi trạng thái đơn sau khi admin mở form.
  if p_expected_updated_at is null or v_old.updated_at <> p_expected_updated_at then
    raise exception 'STALE_BOOKING';
  end if;

  if v_old.status not in ('pending', 'confirmed') then
    raise exception 'NOT_EDITABLE'
      using detail = format('current status: %s', v_old.status);
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

  -- Chỉ kiểm tra giờ nhận khi ĐỔI giờ nhận (đơn đang thuê có giờ nhận đã qua
  -- vẫn gia hạn giờ trả được).
  if p_pickup_at <> v_old.pickup_at then
    if v_old.status = 'pending' and p_pickup_at <= now() then
      raise exception 'PICKUP_IN_PAST';
    end if;
    if p_pickup_at < now() - interval '1 day' then
      raise exception 'PICKUP_TOO_OLD';
    end if;
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

  -- Đổi xe → giá theo xe mới; giữ xe → giữ giá đã chốt lúc đặt.
  v_price := case when p_car_id <> v_old.car_id then v_car.price_per_day else v_old.price_per_day end;
  v_final := coalesce(p_final_total, v_old.final_total);

  -- Thay đổi: giá trị cũ → mới cho dữ liệu vận hành; chỉ "đã đổi" cho PII.
  if p_car_id <> v_old.car_id then
    v_changes := v_changes || jsonb_build_object('car', jsonb_build_array(v_old.car_name, v_car.name));
    v_labels := v_labels || 'xe'::text;
  end if;
  if p_pickup_at <> v_old.pickup_at or p_return_at <> v_old.return_at then
    v_changes := v_changes
      || jsonb_build_object('pickup_at', jsonb_build_array(v_old.pickup_at, p_pickup_at))
      || jsonb_build_object('return_at', jsonb_build_array(v_old.return_at, p_return_at));
    v_labels := v_labels || 'thời gian nhận/trả'::text;
  end if;
  if p_service_type <> v_old.service_type then
    v_changes := v_changes || jsonb_build_object('service_type', jsonb_build_array(v_old.service_type, p_service_type));
    v_labels := v_labels || 'hình thức thuê'::text;
  end if;
  if v_final is distinct from v_old.final_total then
    v_changes := v_changes || jsonb_build_object('final_total', jsonb_build_array(v_old.final_total, v_final));
    v_labels := v_labels || 'giá chốt'::text;
  end if;
  if v_pickup_loc <> v_old.pickup_location or v_return_loc <> v_old.return_location then
    v_changes := v_changes || jsonb_build_object('location', true);
    v_labels := v_labels || 'địa điểm nhận/trả'::text;
  end if;
  if v_name <> v_old.customer_name or v_phone <> v_old.customer_phone then
    v_changes := v_changes || jsonb_build_object('customer', true);
  end if;
  if v_note is distinct from v_old.customer_note then
    v_changes := v_changes || jsonb_build_object('note', true);
  end if;

  if v_changes = '{}'::jsonb then
    raise exception 'NO_CHANGES';
  end if;

  begin
    update public.booking_requests
    set car_id          = v_car.id,
        car_name        = v_car.name,
        service_type    = p_service_type,
        pickup_at       = p_pickup_at,
        return_at       = p_return_at,
        pickup_location = v_pickup_loc,
        return_location = v_return_loc,
        customer_name   = v_name,
        customer_phone  = v_phone,
        customer_note   = v_note,
        price_per_day   = v_price,
        rental_days     = v_days,
        estimated_total = v_price * v_days,
        final_total     = v_final
    where id = p_booking_id
    returning * into v_row;
  exception
    when exclusion_violation then
      select b.booking_code into v_conflict
      from public.booking_requests b
      where b.car_id = v_car.id
        and b.status = 'confirmed'
        and b.id <> p_booking_id
        and tstzrange(b.pickup_at, b.return_at, '[)')
            && tstzrange(p_pickup_at, p_return_at, '[)')
      order by b.pickup_at
      limit 1;

      raise exception 'BOOKING_CONFLICT'
        using detail = case
          when v_conflict is null then 'conflicts with a confirmed booking'
          else format('conflicts with confirmed booking %s', v_conflict)
        end;
  end;

  insert into public.booking_change_events (booking_id, changed_by, changes)
  values (p_booking_id, auth.uid(), v_changes);

  -- Báo khách app khi thông tin họ nhìn thấy thay đổi. Không bao giờ làm
  -- hỏng việc sửa đơn.
  if v_row.user_id is not null and cardinality(v_labels) > 0 then
    begin
      insert into public.customer_notifications (user_id, booking_id, kind, title, body)
      values (
        v_row.user_id, v_row.id, 'booking_updated',
        left(format('Đơn %s đã được cập nhật', v_row.booking_code), 120),
        left(format('Eagle Capital đã cập nhật %s. Mở đơn để xem chi tiết: %s · nhận xe %s.',
                    array_to_string(v_labels, ', '), v_row.car_name,
                    to_char(v_row.pickup_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')), 500)
      )
      returning id into v_notif_id;

      insert into public.push_outbox (notification_id, user_id) values (v_notif_id, v_row.user_id);
    exception
      when others then
        raise warning 'booking_updated notification failed (SQLSTATE %), skipped', sqlstate;
    end;
  end if;

  return v_row;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. admin_create_booking — giữ nguyên chữ ký / hành vi 0014, thêm:
--    tạo đơn CHỜ thì giờ nhận phải ở tương lai (PICKUP_IN_PAST).
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

  -- Đơn CHỜ phải xác nhận được sau này (0005 chặn giờ nhận đã qua).
  if not coalesce(p_confirm, true) and p_pickup_at <= now() then
    raise exception 'PICKUP_IN_PAST';
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
-- 5. QUYỀN FUNCTION
-- ---------------------------------------------------------------------
revoke all on function public.admin_update_booking(
  uuid, timestamptz, text, text, timestamptz, timestamptz, text, text, text, text, text, bigint
) from public, anon, authenticated;
grant execute on function public.admin_update_booking(
  uuid, timestamptz, text, text, timestamptz, timestamptz, text, text, text, text, text, bigint
) to authenticated;

-- create or replace giữ ACL cũ; nhắc lại cho chắc.
revoke all on function public.admin_create_booking(
  text, text, timestamptz, timestamptz, text, text, text, text, text, bigint, boolean
) from public, anon, authenticated;
grant execute on function public.admin_create_booking(
  text, text, timestamptz, timestamptz, text, text, text, text, text, bigint, boolean
) to authenticated;


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (KHÔNG tự chạy):
--   drop function if exists public.admin_update_booking(uuid, timestamptz, text, text, timestamptz, timestamptz, text, text, text, text, text, bigint);
--   -- admin_create_booking: chạy lại phần CREATE FUNCTION của 0014.
--   drop table if exists public.booking_change_events;
--   -- CHECK kind: chỉ thu hẹp lại khi KHÔNG còn thông báo 'booking_updated':
--   --   alter table public.customer_notifications drop constraint customer_notifications_kind_check;
--   --   alter table public.customer_notifications add constraint customer_notifications_kind_check
--   --     check (kind in ('booking_confirmed','booking_rejected','booking_cancelled','booking_expired','booking_completed'));
-- ---------------------------------------------------------------------
