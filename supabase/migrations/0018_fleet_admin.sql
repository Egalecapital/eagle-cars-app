-- =====================================================================
-- Eagle Capital Cars — 0018_fleet_admin.sql
--
-- Quản trị đội xe hoàn toàn từ Admin (không sửa code / build / deploy):
--   1. public.cars: thêm thông tin xe (thương hiệu, model, đời, loại, số chỗ,
--      nhiên liệu, hộp số, hình thức phục vụ, mô tả, tính năng, nổi bật, thứ
--      tự) + nghiệp vụ (tiền cọc, giới hạn km/ngày, phụ phí vượt km) + lưu trữ
--      (archived_at). Điền sẵn đúng dữ liệu 5 xe hiện có (từ src/data/cars.ts);
--      KHÔNG đổi giá, trạng thái cho thuê, ảnh.
--   2. car_change_events: nhật ký thay đổi xe (chỉ admin đọc; giữ cả khi xe bị xoá).
--   3. Trigger trên booking_requests: hình thức thuê phải nằm trong
--      service_types của xe; xe đã lưu trữ không nhận đơn mới. Chỉ kiểm tra khi
--      TẠO đơn hoặc ĐỔI xe / hình thức (đơn cũ không bị ảnh hưởng).
--   4. RPC admin (SECURITY DEFINER, is_admin() kiểm tra đầu tiên, chống ghi đè
--      bằng p_expected_updated_at): tạo / sửa / bật-tắt / đổi ảnh / lưu trữ /
--      bỏ lưu trữ / xoá xe. Xoá hẳn CHỈ khi xe chưa từng có đơn.
--   5. Storage car-images: CHỈ admin được upload / xoá (policy kiểm tra
--      is_admin() + tên file cars/<id-xe>/<uuid>.<đuôi ảnh>); khách / anon vẫn
--      chỉ xem ảnh public.
--
-- Mở rộng sau này: giá theo hình thức thuê → bảng riêng car_service_prices
-- (car_id, service_type, price_per_day); cars.price_per_day vẫn là giá mặc
-- định; đơn đã lưu price_per_day lúc đặt nên không ảnh hưởng đơn cũ.
--
-- KHÔNG có trong migration này: sửa create_booking_request / RPC đơn / guard /
-- exclusion / Telegram / push / cron; đổi giá, trạng thái, ảnh của xe nào.
-- admin_update_car (0011) giữ nguyên để tương thích; CHECK mới chặn bật lại
-- xe đã lưu trữ qua mọi đường.
-- Phụ thuộc: 0001, 0003 (is_admin), 0011, 0014, 0015, 0017.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. CỘT MỚI CỦA public.cars (giá trị mặc định cố định → chỉ đổi metadata)
-- ---------------------------------------------------------------------
-- Danh sách tính năng hợp lệ: ≤ 20 mục, mỗi mục 1–80 ký tự (CHECK không dùng
-- được truy vấn con trên mảng → hàm IMMUTABLE).
create or replace function public.car_features_valid(p_features text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_features), 0) <= 20
     and not exists (
       select 1 from unnest(coalesce(p_features, '{}'::text[])) f
       where f is null or char_length(btrim(f)) not between 1 and 80
     );
$$;

alter table public.cars
  add column if not exists brand            text    not null default '',
  add column if not exists model            text    not null default '',
  add column if not exists year             integer,
  add column if not exists category         text    not null default 'Sedan',
  add column if not exists seats            integer not null default 4,
  add column if not exists fuel_type        text    not null default 'Xăng',
  add column if not exists transmission     text    not null default 'Tự động',
  add column if not exists service_types    text[]  not null default '{self_drive}',
  add column if not exists description      text    not null default '',
  add column if not exists features         text[]  not null default '{}',
  add column if not exists is_featured      boolean not null default false,
  add column if not exists sort_order       integer not null default 100,
  add column if not exists deposit_amount   bigint,
  add column if not exists km_limit_per_day integer,
  add column if not exists extra_km_fee     bigint,
  add column if not exists archived_at      timestamptz;

do $$
declare
  c record;
begin
  for c in select * from (values
    ('cars_brand_check',            'check (char_length(brand) <= 60)'),
    ('cars_model_check',            'check (char_length(model) <= 80)'),
    ('cars_year_check',             'check (year is null or year between 1990 and 2100)'),
    ('cars_category_check',         'check (category in (''Xe sang'', ''SUV'', ''Sedan'', ''MPV'', ''Bán tải''))'),
    ('cars_seats_check',            'check (seats between 2 and 50)'),
    ('cars_fuel_type_check',        'check (fuel_type in (''Xăng'', ''Dầu'', ''Điện'', ''Hybrid''))'),
    ('cars_transmission_check',     'check (transmission in (''Tự động'', ''Số sàn''))'),
    ('cars_service_types_check',    'check (cardinality(service_types) between 1 and 3 and service_types <@ array[''self_drive'', ''with_driver'', ''wedding'']::text[])'),
    ('cars_description_check',      'check (char_length(description) <= 2000)'),
    ('cars_features_check',         'check (public.car_features_valid(features))'),
    ('cars_sort_order_check',       'check (sort_order between 0 and 10000)'),
    ('cars_deposit_amount_check',   'check (deposit_amount is null or deposit_amount between 0 and 10000000000)'),
    ('cars_km_limit_check',         'check (km_limit_per_day is null or km_limit_per_day between 1 and 100000)'),
    ('cars_extra_km_fee_check',     'check (extra_km_fee is null or extra_km_fee between 0 and 100000000)'),
    -- Xe đã lưu trữ không được đang cho thuê (chặn mọi đường, kể cả admin_update_car 0011).
    ('cars_archived_inactive_check','check (archived_at is null or is_active = false)')
  ) as t(name, def)
  loop
    if not exists (select 1 from pg_constraint
                   where conrelid = 'public.cars'::regclass and conname = c.name) then
      execute format('alter table public.cars add constraint %I %s', c.name, c.def);
    end if;
  end loop;
end
$$;

-- Điền dữ liệu 5 xe hiện có — sinh tự động từ src/data/cars.ts (đúng nội dung
-- đang hiển thị). Chỉ cột thông tin: không đổi name / price_per_day / is_active / image_url.
update public.cars c
set brand         = v.brand,
    model         = v.model,
    year          = v.year,
    category      = v.category,
    seats         = v.seats,
    fuel_type     = v.fuel_type,
    transmission  = v.transmission,
    service_types = v.service_types,
    description   = v.description,
    features      = v.features,
    is_featured   = v.is_featured,
    sort_order    = v.sort_order
from (values
  ('porsche-panamera', 'Porsche', 'Panamera 4 Sport Turismo', 2019, 'Xe sang', 4, 'Xăng', 'Tự động',
   array['self_drive', 'with_driver', 'wedding'],
   'Mẫu xe sang thể thao cao cấp dành cho những hành trình cần sự khác biệt, đẳng cấp và trải nghiệm lái ấn tượng.',
   array['Nội thất cao cấp', 'Không gian sang trọng', 'Phù hợp gặp đối tác', 'Phù hợp sự kiện và xe cưới'],
   true, 10),
  ('bmw-530i-m-sport', 'BMW', '530i M Sport', 2021, 'Xe sang', 5, 'Xăng', 'Tự động',
   array['self_drive', 'with_driver', 'wedding'],
   'Sedan hạng sang mang phong cách thể thao, phù hợp đi công tác, gặp đối tác, du lịch và các sự kiện quan trọng.',
   array['Phong cách M Sport', 'Không gian 5 chỗ', 'Vận hành thể thao', 'Phù hợp công việc và sự kiện'],
   true, 20),
  ('mercedes-e300-amg', 'Mercedes-Benz', 'E300 AMG', 2017, 'Xe sang', 5, 'Xăng', 'Tự động',
   array['self_drive', 'with_driver', 'wedding'],
   'Sedan Mercedes-Benz sang trọng, phù hợp tiếp khách, gặp đối tác, đi sự kiện và sử dụng trong những dịp quan trọng.',
   array['Thiết kế sang trọng', 'Nội thất cao cấp', 'Không gian 5 chỗ', 'Phù hợp công tác và xe cưới'],
   true, 30),
  ('mercedes-glc200', 'Mercedes-Benz', 'GLC 200', 2022, 'SUV', 5, 'Xăng', 'Tự động',
   array['self_drive', 'with_driver', 'wedding'],
   'SUV hạng sang 5 chỗ cân bằng giữa sự sang trọng, tiện dụng và không gian phù hợp cho gia đình hoặc công việc.',
   array['SUV 5 chỗ', 'Không gian rộng rãi', 'Phù hợp gia đình', 'Phù hợp công tác và sự kiện'],
   false, 40),
  ('vinfast-lux-a', 'VinFast', 'Lux A', 2021, 'Sedan', 5, 'Xăng', 'Tự động',
   array['self_drive', 'with_driver', 'wedding'],
   'Sedan 5 chỗ phù hợp nhu cầu tự lái hằng ngày, công tác, về quê và những chuyến đi cùng gia đình.',
   array['Sedan 5 chỗ', 'Không gian thoải mái', 'Phù hợp tự lái', 'Phù hợp đi công tác và gia đình'],
   false, 50)
) as v(id, brand, model, year, category, seats, fuel_type, transmission, service_types,
       description, features, is_featured, sort_order)
where c.id = v.id;

-- Danh mục khách sắp xếp theo thứ tự hiển thị.
create index if not exists cars_active_sort_idx on public.cars (is_active, sort_order, id);


-- ---------------------------------------------------------------------
-- 2. NHẬT KÝ THAY ĐỔI XE (chỉ admin đọc; car_id không FK để giữ cả khi xoá xe)
-- ---------------------------------------------------------------------
create table if not exists public.car_change_events (
  id          bigint generated always as identity primary key,
  car_id      text not null,
  action      text not null check (action in (
                'create', 'update', 'activate', 'deactivate', 'image',
                'archive', 'unarchive', 'delete')),
  changed_by  uuid,
  changes     jsonb not null default '{}'::jsonb check (jsonb_typeof(changes) = 'object'),
  created_at  timestamptz not null default now()
);

create index if not exists car_change_events_car_idx on public.car_change_events (car_id, created_at);

alter table public.car_change_events enable row level security;
revoke all on table public.car_change_events from public, anon, authenticated;
grant select on table public.car_change_events to authenticated;

drop policy if exists car_change_events_select_admin on public.car_change_events;
create policy car_change_events_select_admin
  on public.car_change_events
  for select
  to authenticated
  using ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 3. ĐƠN PHẢI KHỚP XE: hình thức thuê thuộc service_types; xe chưa lưu trữ.
--   - Áp dụng khi TẠO đơn (mọi đường: app, admin) và khi ĐỔI xe / hình thức
--     (admin_update_booking). Đổi trạng thái đơn cũ không bị kiểm tra lại.
--   - SECURITY INVOKER: đọc public.cars trong ngữ cảnh RPC definer đang chạy.
-- ---------------------------------------------------------------------
create or replace function public.guard_booking_car_service()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_types    text[];
  v_archived timestamptz;
begin
  if tg_op = 'UPDATE'
     and new.car_id = old.car_id and new.service_type = old.service_type then
    return new;
  end if;

  select c.service_types, c.archived_at into v_types, v_archived
  from public.cars c where c.id = new.car_id;

  if v_archived is not null then
    raise exception 'CAR_ARCHIVED';
  end if;

  if v_types is null or not (new.service_type = any (v_types)) then
    raise exception 'SERVICE_NOT_AVAILABLE'
      using detail = format('car %s does not offer %s', new.car_id, new.service_type);
  end if;

  return new;
end;
$$;

drop trigger if exists booking_requests_guard_car_service on public.booking_requests;
create trigger booking_requests_guard_car_service
  before insert or update of car_id, service_type on public.booking_requests
  for each row execute function public.guard_booking_car_service();


-- ---------------------------------------------------------------------
-- 4. RPC QUẢN TRỊ XE
-- ---------------------------------------------------------------------

-- 4a. Kiểm tra + chuẩn hoá dữ liệu xe dùng chung cho tạo / sửa.
--     Raise mã lỗi cố định cho app; CHECK của bảng là lớp chặn cuối.
create or replace function public.admin_car_validate(
  p_name text, p_price_per_day bigint, p_category text, p_seats integer,
  p_fuel_type text, p_transmission text, p_service_types text[], p_year integer,
  p_features text[], p_deposit_amount bigint, p_km_limit_per_day integer, p_extra_km_fee bigint
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'INVALID_NAME'; end if;
  if p_price_per_day is null or p_price_per_day not between 1 and 1000000000 then raise exception 'INVALID_PRICE'; end if;
  if p_category is null or p_category not in ('Xe sang', 'SUV', 'Sedan', 'MPV', 'Bán tải') then raise exception 'INVALID_CATEGORY'; end if;
  if p_seats is null or p_seats not between 2 and 50 then raise exception 'INVALID_SEATS'; end if;
  if p_fuel_type is null or p_fuel_type not in ('Xăng', 'Dầu', 'Điện', 'Hybrid') then raise exception 'INVALID_FUEL_TYPE'; end if;
  if p_transmission is null or p_transmission not in ('Tự động', 'Số sàn') then raise exception 'INVALID_TRANSMISSION'; end if;
  if p_service_types is null or cardinality(p_service_types) not between 1 and 3
     or not (p_service_types <@ array['self_drive', 'with_driver', 'wedding']::text[]) then
    raise exception 'INVALID_SERVICE_TYPES';
  end if;
  if p_year is not null and p_year not between 1990 and 2100 then raise exception 'INVALID_YEAR'; end if;
  if not public.car_features_valid(p_features) then raise exception 'INVALID_FEATURES'; end if;
  if p_deposit_amount is not null and p_deposit_amount not between 0 and 10000000000 then raise exception 'INVALID_DEPOSIT'; end if;
  if p_km_limit_per_day is not null and p_km_limit_per_day not between 1 and 100000 then raise exception 'INVALID_KM_LIMIT'; end if;
  if p_extra_km_fee is not null and p_extra_km_fee not between 0 and 100000000 then raise exception 'INVALID_EXTRA_KM_FEE'; end if;
end;
$$;

-- Khoá xe + kiểm tra phiên bản (dùng chung).
create or replace function public.admin_lock_car(p_car_id text, p_expected_updated_at timestamptz)
returns public.cars
language plpgsql
set search_path = ''
as $$
declare
  v_car public.cars%rowtype;
begin
  select * into v_car from public.cars where id = p_car_id for update;
  if not found then raise exception 'CAR_NOT_FOUND'; end if;
  if p_expected_updated_at is null or v_car.updated_at <> p_expected_updated_at then
    raise exception 'STALE_CAR';
  end if;
  return v_car;
end;
$$;

-- 4b. Tạo xe. Mặc định CHƯA cho thuê (bật sau khi kiểm tra ảnh / thông tin).
create or replace function public.admin_create_car(
  p_id               text,
  p_name             text,
  p_price_per_day    bigint,
  p_brand            text,
  p_model            text,
  p_year             integer,
  p_category         text,
  p_seats            integer,
  p_fuel_type        text,
  p_transmission     text,
  p_service_types    text[],
  p_description      text,
  p_features         text[],
  p_is_featured      boolean,
  p_sort_order       integer,
  p_deposit_amount   bigint,
  p_km_limit_per_day integer,
  p_extra_km_fee     bigint,
  p_is_active        boolean default false
)
returns public.cars
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id  text := lower(btrim(coalesce(p_id, '')));
  v_car public.cars%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  if v_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_id) not between 3 and 60 then
    raise exception 'INVALID_CAR_ID';
  end if;
  perform public.admin_car_validate(p_name, p_price_per_day, p_category, p_seats, p_fuel_type,
    p_transmission, p_service_types, p_year, p_features, p_deposit_amount, p_km_limit_per_day, p_extra_km_fee);
  if exists (select 1 from public.cars where id = v_id) then raise exception 'CAR_ID_TAKEN'; end if;

  begin
    insert into public.cars (
      id, name, price_per_day, is_active, brand, model, year, category, seats, fuel_type,
      transmission, service_types, description, features, is_featured, sort_order,
      deposit_amount, km_limit_per_day, extra_km_fee
    )
    values (
      v_id, btrim(p_name), p_price_per_day, coalesce(p_is_active, false),
      btrim(coalesce(p_brand, '')), btrim(coalesce(p_model, '')), p_year, p_category, p_seats,
      p_fuel_type, p_transmission, p_service_types, btrim(coalesce(p_description, '')),
      coalesce(array(select btrim(f) from unnest(p_features) f), '{}'),
      coalesce(p_is_featured, false), coalesce(p_sort_order, 100),
      p_deposit_amount, p_km_limit_per_day, p_extra_km_fee
    )
    returning * into v_car;
  exception
    when check_violation then
      raise exception 'INVALID_CAR_DATA' using detail = sqlerrm;
  end;

  insert into public.car_change_events (car_id, action, changed_by, changes)
  values (v_car.id, 'create', auth.uid(),
          jsonb_build_object('name', v_car.name, 'price_per_day', v_car.price_per_day, 'is_active', v_car.is_active));

  return v_car;
end;
$$;

-- 4c. Sửa thông tin + giá (không đổi id, trạng thái, ảnh, lưu trữ).
create or replace function public.admin_update_car_details(
  p_car_id              text,
  p_expected_updated_at timestamptz,
  p_name                text,
  p_price_per_day       bigint,
  p_brand               text,
  p_model               text,
  p_year                integer,
  p_category            text,
  p_seats               integer,
  p_fuel_type           text,
  p_transmission        text,
  p_service_types       text[],
  p_description         text,
  p_features            text[],
  p_is_featured         boolean,
  p_sort_order          integer,
  p_deposit_amount      bigint,
  p_km_limit_per_day    integer,
  p_extra_km_fee        bigint
)
returns public.cars
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     public.cars%rowtype;
  v_new     public.cars%rowtype;
  v_changes jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  perform public.admin_car_validate(p_name, p_price_per_day, p_category, p_seats, p_fuel_type,
    p_transmission, p_service_types, p_year, p_features, p_deposit_amount, p_km_limit_per_day, p_extra_km_fee);
  v_old := public.admin_lock_car(p_car_id, p_expected_updated_at);

  begin
    update public.cars
    set name             = btrim(p_name),
        price_per_day    = p_price_per_day,
        brand            = btrim(coalesce(p_brand, '')),
        model            = btrim(coalesce(p_model, '')),
        year             = p_year,
        category         = p_category,
        seats            = p_seats,
        fuel_type        = p_fuel_type,
        transmission     = p_transmission,
        service_types    = p_service_types,
        description      = btrim(coalesce(p_description, '')),
        features         = coalesce(array(select btrim(f) from unnest(p_features) f), '{}'),
        is_featured      = coalesce(p_is_featured, false),
        sort_order       = coalesce(p_sort_order, v_old.sort_order),
        deposit_amount   = p_deposit_amount,
        km_limit_per_day = p_km_limit_per_day,
        extra_km_fee     = p_extra_km_fee
    where id = p_car_id
    returning * into v_new;
  exception
    when check_violation then
      raise exception 'INVALID_CAR_DATA' using detail = sqlerrm;
  end;

  -- Nhật ký: giá trị cũ → mới cho các trường thay đổi (không có dữ liệu khách).
  select coalesce(jsonb_object_agg(o.key, jsonb_build_array(o.value, n.value)), '{}'::jsonb)
  into v_changes
  from jsonb_each(to_jsonb(v_old) - 'updated_at') o
  join jsonb_each(to_jsonb(v_new) - 'updated_at') n using (key)
  where o.value is distinct from n.value;

  if v_changes = '{}'::jsonb then raise exception 'NO_CHANGES'; end if;

  insert into public.car_change_events (car_id, action, changed_by, changes)
  values (p_car_id, 'update', auth.uid(), v_changes);

  return v_new;
end;
$$;

-- 4d. Bật / tắt cho thuê (xe đã lưu trữ phải bỏ lưu trữ trước).
create or replace function public.admin_set_car_active(
  p_car_id text, p_expected_updated_at timestamptz, p_is_active boolean
)
returns public.cars
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.cars%rowtype;
  v_new public.cars%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_is_active is null then raise exception 'INVALID_ACTIVE'; end if;
  v_old := public.admin_lock_car(p_car_id, p_expected_updated_at);
  if p_is_active and v_old.archived_at is not null then raise exception 'CAR_ARCHIVED'; end if;
  if v_old.is_active = p_is_active then raise exception 'NO_CHANGES'; end if;

  update public.cars set is_active = p_is_active where id = p_car_id returning * into v_new;

  insert into public.car_change_events (car_id, action, changed_by)
  values (p_car_id, case when p_is_active then 'activate' else 'deactivate' end, auth.uid());

  return v_new;
end;
$$;

-- 4e. Đổi ảnh: chỉ ảnh đã upload trong thư mục cars/<id-xe>/ của bucket;
--     null = quay về ảnh mặc định của app. App xoá file cũ sau khi lưu.
create or replace function public.admin_set_car_image(
  p_car_id text, p_expected_updated_at timestamptz, p_image_url text
)
returns public.cars
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old  public.cars%rowtype;
  v_new  public.cars%rowtype;
  v_path text;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_old := public.admin_lock_car(p_car_id, p_expected_updated_at);

  if p_image_url is not null then
    v_path := substring(p_image_url from '/storage/v1/object/public/car-images/(.*)$');
    if v_path is null
       or v_path !~ ('^cars/' || p_car_id || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'car-images' and o.name = v_path) then
      raise exception 'INVALID_IMAGE';
    end if;
  end if;
  if p_image_url is not distinct from v_old.image_url then raise exception 'NO_CHANGES'; end if;

  begin
    update public.cars set image_url = p_image_url where id = p_car_id returning * into v_new;
  exception
    when check_violation then raise exception 'INVALID_IMAGE';
  end;

  insert into public.car_change_events (car_id, action, changed_by, changes)
  values (p_car_id, 'image', auth.uid(), jsonb_build_object('image_url', jsonb_build_array(v_old.image_url, p_image_url)));

  return v_new;
end;
$$;

-- 4f. Lưu trữ (ẩn khỏi khách + ngừng cho thuê, giữ toàn bộ lịch sử) / bỏ lưu trữ.
create or replace function public.admin_archive_car(
  p_car_id text, p_expected_updated_at timestamptz, p_archived boolean
)
returns public.cars
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.cars%rowtype;
  v_new public.cars%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_archived is null then raise exception 'INVALID_ARCHIVED'; end if;
  v_old := public.admin_lock_car(p_car_id, p_expected_updated_at);
  if (v_old.archived_at is not null) = p_archived then raise exception 'NO_CHANGES'; end if;

  update public.cars
  set archived_at = case when p_archived then now() else null end,
      is_active   = case when p_archived then false else is_active end
  where id = p_car_id
  returning * into v_new;

  insert into public.car_change_events (car_id, action, changed_by)
  values (p_car_id, case when p_archived then 'archive' else 'unarchive' end, auth.uid());

  return v_new;
end;
$$;

-- 4g. Xoá hẳn: CHỈ xe chưa từng có đơn (đơn cũ giữ FK tới xe). Trả số đơn = 0.
create or replace function public.admin_delete_car(
  p_car_id text, p_expected_updated_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.cars%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_old := public.admin_lock_car(p_car_id, p_expected_updated_at);
  if exists (select 1 from public.booking_requests b where b.car_id = p_car_id) then
    raise exception 'CAR_HAS_BOOKINGS';
  end if;

  delete from public.cars where id = p_car_id;

  insert into public.car_change_events (car_id, action, changed_by, changes)
  values (p_car_id, 'delete', auth.uid(),
          jsonb_build_object('name', v_old.name, 'image_url', v_old.image_url));

  return p_car_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. STORAGE car-images: CHỈ admin upload / xem danh sách / xoá
--   - Khách / anon: không policy → không ghi được (ảnh public vẫn xem qua URL).
--   - Tên file bắt buộc cars/<id-xe hợp lệ>/<uuid>.<jpg|jpeg|png|webp>: mỗi
--     lần đổi là file mới (không ghi đè, không lẫn cache). Bucket đã giới hạn
--     5 MB + MIME ảnh (0017).
--   - Không có policy UPDATE (không sửa / ghi đè file).
-- ---------------------------------------------------------------------
drop policy if exists car_images_admin_insert on storage.objects;
create policy car_images_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'car-images'
    and (select public.is_admin())
    and name ~ '^cars/[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  );

drop policy if exists car_images_admin_select on storage.objects;
create policy car_images_admin_select
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'car-images' and (select public.is_admin()));

drop policy if exists car_images_admin_delete on storage.objects;
create policy car_images_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'car-images' and (select public.is_admin()));


-- ---------------------------------------------------------------------
-- 6. QUYỀN FUNCTION
-- ---------------------------------------------------------------------
revoke all on function public.car_features_valid(text[]) from public, anon, authenticated;
revoke all on function public.guard_booking_car_service() from public, anon, authenticated;
revoke all on function public.admin_car_validate(text, bigint, text, integer, text, text, text[], integer, text[], bigint, integer, bigint) from public, anon, authenticated;
revoke all on function public.admin_lock_car(text, timestamptz) from public, anon, authenticated;

revoke all on function public.admin_create_car(text, text, bigint, text, text, integer, text, integer, text, text, text[], text, text[], boolean, integer, bigint, integer, bigint, boolean) from public, anon, authenticated;
revoke all on function public.admin_update_car_details(text, timestamptz, text, bigint, text, text, integer, text, integer, text, text, text[], text, text[], boolean, integer, bigint, integer, bigint) from public, anon, authenticated;
revoke all on function public.admin_set_car_active(text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.admin_set_car_image(text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.admin_archive_car(text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.admin_delete_car(text, timestamptz) from public, anon, authenticated;

grant execute on function public.admin_create_car(text, text, bigint, text, text, integer, text, integer, text, text, text[], text, text[], boolean, integer, bigint, integer, bigint, boolean) to authenticated;
grant execute on function public.admin_update_car_details(text, timestamptz, text, bigint, text, text, integer, text, integer, text, text, text[], text, text[], boolean, integer, bigint, integer, bigint) to authenticated;
grant execute on function public.admin_set_car_active(text, timestamptz, boolean) to authenticated;
grant execute on function public.admin_set_car_image(text, timestamptz, text) to authenticated;
grant execute on function public.admin_archive_car(text, timestamptz, boolean) to authenticated;
grant execute on function public.admin_delete_car(text, timestamptz) to authenticated;


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (KHÔNG tự chạy):
--   drop policy if exists car_images_admin_insert on storage.objects;
--   drop policy if exists car_images_admin_select on storage.objects;
--   drop policy if exists car_images_admin_delete on storage.objects;
--   drop trigger if exists booking_requests_guard_car_service on public.booking_requests;
--   drop function if exists public.admin_delete_car(text, timestamptz);
--   drop function if exists public.admin_archive_car(text, timestamptz, boolean);
--   drop function if exists public.admin_set_car_image(text, timestamptz, text);
--   drop function if exists public.admin_set_car_active(text, timestamptz, boolean);
--   drop function if exists public.admin_update_car_details(text, timestamptz, text, bigint, text, text, integer, text, integer, text, text, text[], text, text[], boolean, integer, bigint, integer, bigint);
--   drop function if exists public.admin_create_car(text, text, bigint, text, text, integer, text, integer, text, text, text[], text, text[], boolean, integer, bigint, integer, bigint, boolean);
--   drop function if exists public.admin_lock_car(text, timestamptz);
--   drop function if exists public.admin_car_validate(text, bigint, text, integer, text, text, text[], integer, text[], bigint, integer, bigint);
--   drop function if exists public.guard_booking_car_service();
--   drop table if exists public.car_change_events;
--   -- Cột mới của cars: chỉ xoá khi chấp nhận mất thông tin xe nhập từ Admin.
-- ---------------------------------------------------------------------
