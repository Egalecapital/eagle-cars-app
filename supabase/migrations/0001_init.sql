-- =====================================================================
-- Eagle Capital Cars — 0001_init.sql
--
-- Bảng cars, booking_requests, RLS, RPC tạo/huỷ yêu cầu đặt xe.
-- Migration này KHÔNG chứa dữ liệu xe (xem 0002_seed_cars.sql).
--
-- Quy tắc lịch:
--   - pending   : KHÔNG giữ lịch (hai pending được phép chồng nhau).
--   - confirmed : GIỮ lịch.
--   - rejected / cancelled / completed / expired : KHÔNG giữ lịch.
--   - Khoảng thời gian luôn là nửa mở [pickup_at, return_at).
--   - Exclusion constraint là lớp bảo vệ cuối cùng chống hai đơn
--     confirmed cùng xe bị chồng lịch.
--
-- Giá:
--   - Database là nguồn sự thật cho price_per_day và estimated_total.
--   - Client không bao giờ gửi giá / số ngày / tổng tiền / trạng thái /
--     booking_code / final_total.
--   - TODO (giai đoạn sau): app phải đọc danh sách xe và giá từ Supabase.
--     Hiện src/data/cars.ts chỉ là dữ liệu frontend tạm thời; nếu giá ở đó
--     lệch với bảng cars thì giá tạm tính trên form sẽ khác tổng tiền
--     server trả về. Màn xác nhận phải hiển thị số liệu do server trả về.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. EXTENSIONS
--   btree_gist : cho phép toán tử "=" trên text trong index GiST
--                (cần cho exclusion constraint car_id + khoảng thời gian).
--   pgcrypto   : gen_random_bytes() — nguồn ngẫu nhiên an toàn cho booking_code.
-- Supabase đặt extension trong schema "extensions".
-- ---------------------------------------------------------------------
create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto   with schema extensions;


-- ---------------------------------------------------------------------
-- 2. HÀM TRIGGER DÙNG CHUNG
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_status_changed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. BẢNG cars — nguồn giá chính thức
--   - id giữ đúng dạng slug đang dùng trong src/data/cars.ts.
--   - Tiền VNĐ: bigint (đơn vị đồng), không dùng floating point.
--   - is_active mặc định FALSE: xe mới chỉ nhận đặt sau khi được bật
--     có chủ đích (src/data/cars.ts không có trường active để suy ra).
--   - TODO (giai đoạn sau): thêm danh sách hình thức thuê theo từng xe
--     khi có nguồn dữ liệu chính xác; hiện RPC chỉ kiểm tra service_type
--     thuộc danh sách hợp lệ chung.
-- ---------------------------------------------------------------------
create table public.cars (
  id            text primary key
                check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null
                check (char_length(btrim(name)) between 1 and 120),
  price_per_day bigint not null
                check (price_per_day > 0),
  is_active     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger cars_set_updated_at
  before update on public.cars
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 4. BẢNG booking_requests
--   status dùng text + CHECK (không dùng enum) để sau này thêm
--   'reserved' / 'paid' chỉ bằng cách thay CHECK và tạo lại exclusion
--   constraint, không phá kiến trúc.
-- ---------------------------------------------------------------------
create table public.booking_requests (
  id                uuid primary key default gen_random_uuid(),

  -- Mã cho khách đọc. KHÔNG dùng làm cơ chế bảo mật (quyền truy cập
  -- luôn dựa vào RLS theo auth.uid()).
  -- Bảng chữ Crockford base32: bỏ I, L, O, U để tránh đọc nhầm.
  booking_code      text not null unique
                    check (booking_code ~ '^EC-[0-9A-HJKMNP-TV-Z]{8}$'),

  user_id           uuid not null
                    references auth.users (id) on delete restrict,

  car_id            text not null
                    references public.cars (id) on delete restrict,
  car_name          text not null,           -- snapshot tên xe lúc đặt

  service_type      text not null
                    check (service_type in ('self_drive', 'with_driver', 'wedding')),

  pickup_at         timestamptz not null,
  return_at         timestamptz not null,

  pickup_location   text not null
                    check (char_length(pickup_location) between 3 and 300),
  return_location   text not null
                    check (char_length(return_location) between 3 and 300),

  customer_name     text not null
                    check (char_length(customer_name) between 2 and 100),
  customer_phone    text not null
                    check (
                      char_length(customer_phone) <= 20
                      and char_length(regexp_replace(customer_phone, '\D', '', 'g')) between 9 and 11
                    ),
  customer_note     text
                    check (customer_note is null or char_length(customer_note) <= 1000),

  -- Tiền: bigint (đồng). Server tính, client không gửi.
  price_per_day     bigint not null check (price_per_day > 0),   -- snapshot giá lúc đặt
  rental_days       integer not null check (rental_days between 1 and 30),
  estimated_total   bigint not null check (estimated_total >= 0),
  final_total       bigint check (final_total is null or final_total >= 0),

  status            text not null default 'pending'
                    check (status in (
                      'pending', 'confirmed', 'rejected',
                      'cancelled', 'completed', 'expired'
                    )),
  status_reason     text
                    check (status_reason is null or char_length(status_reason) <= 500),
  status_changed_at timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint booking_requests_time_range
    check (return_at > pickup_at),

  constraint booking_requests_estimated_total_formula
    check (estimated_total = price_per_day * rental_days),

  -- LỚP BẢO VỆ CUỐI CÙNG: hai đơn CONFIRMED cùng xe không được chồng lịch.
  --   - Khoảng nửa mở [pickup_at, return_at): trả 10:00 / nhận 10:00 KHÔNG trùng.
  --   - Chỉ đơn confirmed nằm trong constraint; pending được phép chồng.
  --   - Được kiểm tra ở mọi đường ghi (RPC, dashboard, service_role, script)
  --     và an toàn khi nhiều giao dịch chạy đồng thời.
  --   - Sau này thêm 'reserved' / 'paid': tạo lại constraint với
  --       where (status in ('confirmed', 'reserved', 'paid')).
  constraint booking_requests_no_overlap_confirmed
    exclude using gist (
      car_id with =,
      tstzrange(pickup_at, return_at, '[)') with &&
    )
    where (status in ('confirmed'))
);

create trigger booking_requests_set_updated_at
  before update on public.booking_requests
  for each row execute function public.set_updated_at();

create trigger booking_requests_set_status_changed_at
  before update of status on public.booking_requests
  for each row execute function public.set_status_changed_at();


-- ---------------------------------------------------------------------
-- 5. INDEX
--   Exclusion constraint ở trên đã tự tạo index GiST partial cho
--   car_id + khoảng thời gian của đơn confirmed → dùng cho kiểm tra lịch.
-- ---------------------------------------------------------------------

-- "Đơn của tôi": lọc theo user, mới nhất trước. Phục vụ cả RLS và FK user_id.
create index booking_requests_user_created_idx
  on public.booking_requests (user_id, created_at desc);

-- Lịch theo xe (admin xem các đơn của một xe). Phục vụ cả FK car_id.
create index booking_requests_car_pickup_idx
  on public.booking_requests (car_id, pickup_at);

-- Hàng đợi admin theo trạng thái (vd pending sắp tới) và job expired sau này.
create index booking_requests_status_pickup_idx
  on public.booking_requests (status, pickup_at);


-- ---------------------------------------------------------------------
-- 6. QUYỀN BẢNG + RLS
--   Supabase mặc định grant quyền bảng trong public cho anon/authenticated
--   → thu hồi hết, chỉ cấp lại SELECT cho authenticated.
--   Không có policy INSERT / UPDATE / DELETE cho client.
--
--   Lưu ý role: user sau signInAnonymously() vẫn dùng role Postgres
--   `authenticated` (JWT có claim is_anonymous = true). Role `anon` chỉ
--   dành cho request KHÔNG có phiên đăng nhập.
-- ---------------------------------------------------------------------
alter table public.cars             enable row level security;
alter table public.booking_requests enable row level security;

revoke all on table public.cars             from anon, authenticated;
revoke all on table public.booking_requests from anon, authenticated;

grant select on table public.cars             to authenticated;
grant select on table public.booking_requests to authenticated;

create policy cars_select_active
  on public.cars
  for select
  to authenticated
  using (is_active);

create policy booking_requests_select_own
  on public.booking_requests
  for select
  to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------
-- 7. RPC: create_booking_request
--   Client chỉ gửi thông tin khách nhập. Database tự:
--   lấy auth.uid(), kiểm tra xe active, lấy giá, kiểm tra thời gian,
--   tính rental_days (làm tròn lên theo 24 giờ, tối thiểu 1, tối đa 30),
--   tính estimated_total, tạo booking_code, đặt status = 'pending'.
--   Lỗi trả về dạng mã cố định để app dịch sang tiếng Việt.
-- ---------------------------------------------------------------------
create or replace function public.create_booking_request(
  p_car_id          text,
  p_service_type    text,
  p_pickup_at       timestamptz,
  p_return_at       timestamptz,
  p_pickup_location text,
  p_return_location text,
  p_customer_name   text,
  p_customer_phone  text,
  p_customer_note   text default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_alphabet    constant text    := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  c_max_pending constant integer := 5;    -- tối đa 5 đơn pending sắp tới / user
  c_max_days    constant integer := 30;   -- tối đa 30 ngày / booking

  v_uid         uuid := auth.uid();
  v_car         public.cars%rowtype;
  v_pickup_loc  text := btrim(coalesce(p_pickup_location, ''));
  v_return_loc  text := nullif(btrim(coalesce(p_return_location, '')), '');
  v_name        text := btrim(coalesce(p_customer_name, ''));
  v_phone       text := btrim(coalesce(p_customer_phone, ''));
  v_note        text := nullif(btrim(coalesce(p_customer_note, '')), '');
  v_days        integer;
  v_bytes       bytea;
  v_code        text;
  v_row         public.booking_requests%rowtype;
begin
  -- 1. Phải có phiên đăng nhập (user thường hoặc anonymous)
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- 2. Xe tồn tại và đang hoạt động; giá lấy từ database
  select * into v_car
  from public.cars
  where id = p_car_id
    and is_active;

  if not found then
    raise exception 'CAR_NOT_AVAILABLE';
  end if;

  -- 3. Hình thức thuê hợp lệ
  if p_service_type is null
     or p_service_type not in ('self_drive', 'with_driver', 'wedding') then
    raise exception 'INVALID_SERVICE_TYPE';
  end if;

  -- 4. Thời gian
  if p_pickup_at is null or p_return_at is null or p_return_at <= p_pickup_at then
    raise exception 'INVALID_TIME_RANGE';
  end if;

  if p_pickup_at <= now() then
    raise exception 'PICKUP_IN_PAST';
  end if;

  -- Làm tròn lên theo 24 giờ, tối thiểu 1 ngày. extract(epoch) trả numeric.
  v_days := greatest(
    1,
    ceil(extract(epoch from (p_return_at - p_pickup_at)) / 86400)::integer
  );

  if v_days > c_max_days then
    raise exception 'RENTAL_TOO_LONG';
  end if;

  -- 5. Địa điểm, thông tin khách
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

  -- 6. Chống spam: tối đa 5 đơn pending có giờ nhận trong tương lai
  if (
    select count(*)
    from public.booking_requests
    where user_id = v_uid
      and status = 'pending'
      and pickup_at > now()
  ) >= c_max_pending then
    raise exception 'TOO_MANY_PENDING';
  end if;

  -- 7. BUSINESS RULE / UX CHECK — KHÔNG PHẢI exclusion constraint.
  --    Không tạo pending nếu TẠI THỜI ĐIỂM GỬI đã có đơn confirmed cùng xe
  --    chồng lịch [pickup_at, return_at). Mục đích: báo sớm cho khách.
  --    Check này không chống được race condition (một đơn khác có thể được
  --    confirm ngay sau khi check chạy). Đảm bảo cuối cùng vẫn là
  --    booking_requests_no_overlap_confirmed khi admin chuyển sang confirmed.
  --    Hai pending chồng nhau vẫn được phép (check chỉ nhìn đơn confirmed).
  if exists (
    select 1
    from public.booking_requests b
    where b.car_id = p_car_id
      and b.status in ('confirmed')
      and tstzrange(b.pickup_at, b.return_at, '[)')
          && tstzrange(p_pickup_at, p_return_at, '[)')
  ) then
    raise exception 'CAR_ALREADY_BOOKED';
  end if;

  -- 8. Tạo booking_code phía server; thử lại nếu trùng (xác suất cực nhỏ)
  for attempt in 1..5 loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code  := 'EC-';

    for i in 0..7 loop
      -- 256 chia hết cho 32 → không lệch phân phối
      v_code := v_code || substr(c_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;

    begin
      insert into public.booking_requests (
        booking_code, user_id,
        car_id, car_name, service_type,
        pickup_at, return_at,
        pickup_location, return_location,
        customer_name, customer_phone, customer_note,
        price_per_day, rental_days, estimated_total,
        status
      )
      values (
        v_code, v_uid,
        v_car.id, v_car.name, p_service_type,
        p_pickup_at, p_return_at,
        v_pickup_loc, v_return_loc,
        v_name, v_phone, v_note,
        v_car.price_per_day, v_days, v_car.price_per_day * v_days,
        'pending'
      )
      returning * into v_row;

      return v_row;
    exception
      when unique_violation then
        if attempt = 5 then
          raise;
        end if;
    end;
  end loop;

  raise exception 'BOOKING_CODE_GENERATION_FAILED';
end;
$$;


-- ---------------------------------------------------------------------
-- 8. RPC: cancel_my_booking_request
--   Chỉ chủ đơn; chỉ pending → cancelled.
--   confirmed: khách phải liên hệ Eagle Capital (chưa cho tự huỷ).
--   Đơn của người khác trả BOOKING_NOT_FOUND (không tiết lộ đơn tồn tại).
-- ---------------------------------------------------------------------
create or replace function public.cancel_my_booking_request(
  p_booking_id uuid
)
returns public.booking_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_status text;
  v_row    public.booking_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Khoá dòng để không chạy song song với thao tác khác trên cùng đơn
  select status into v_status
  from public.booking_requests
  where id = p_booking_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_status <> 'pending' then
    raise exception 'BOOKING_NOT_CANCELLABLE';
  end if;

  update public.booking_requests
  set status        = 'cancelled',
      status_reason = 'Khách hủy trên ứng dụng'
  where id = p_booking_id
  returning * into v_row;

  return v_row;
end;
$$;


-- ---------------------------------------------------------------------
-- 9. QUYỀN FUNCTION
--   PostgreSQL mặc định cấp EXECUTE cho PUBLIC, Supabase cấp thêm cho
--   anon/authenticated → thu hồi hết, chỉ cấp hai RPC cho authenticated.
--   Role anon (không có phiên đăng nhập) không gọi được RPC nào.
-- ---------------------------------------------------------------------
revoke all on function public.set_updated_at()        from public, anon, authenticated;
revoke all on function public.set_status_changed_at() from public, anon, authenticated;

revoke all on function public.create_booking_request(
  text, text, timestamptz, timestamptz, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.create_booking_request(
  text, text, timestamptz, timestamptz, text, text, text, text, text
) to authenticated;

revoke all on function public.cancel_my_booking_request(uuid)
  from public, anon, authenticated;

grant execute on function public.cancel_my_booking_request(uuid)
  to authenticated;
