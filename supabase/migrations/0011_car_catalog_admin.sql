-- =====================================================================
-- Eagle Capital Cars — 0011_car_catalog_admin.sql
--
-- Danh mục xe & giá từ Supabase + admin quản lý xe.
--   - public.cars là nguồn DUY NHẤT cho: xe có cho thuê (is_active), tên,
--     giá/ngày. App chỉ bổ sung ảnh/mô tả từ dữ liệu trong app.
--   - anon (chưa có phiên) được đọc DANH MỤC XE ACTIVE (thông tin công khai).
--   - admin đọc được cả xe đang tắt.
--   - admin đổi giá / bật-tắt xe CHỈ qua RPC admin_update_car; không ai có
--     INSERT / UPDATE / DELETE trực tiếp trên public.cars.
--   - Đổi giá KHÔNG ảnh hưởng đơn đã tạo: mỗi đơn lưu price_per_day lúc đặt.
--
-- Không thay đổi: booking_requests, exclusion constraint, guard trạng thái,
-- create_booking_request / check_car_availability (vốn đã đọc is_active và
-- giá từ public.cars), notification_outbox, migrations 0001–0010.
--
-- Lỗi trả về: NOT_ADMIN, CAR_NOT_FOUND, INVALID_PRICE, INVALID_ACTIVE.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ĐỌC DANH MỤC
--   0001 đã có: grant select cho authenticated + policy cars_select_active
--   (authenticated đọc xe active). Bổ sung:
-- ---------------------------------------------------------------------
grant select on table public.cars to anon;

drop policy if exists cars_select_active_anon on public.cars;
create policy cars_select_active_anon
  on public.cars
  for select
  to anon
  using (is_active);

-- Admin thấy cả xe đang tắt (cộng OR với cars_select_active).
drop policy if exists cars_select_admin on public.cars;
create policy cars_select_admin
  on public.cars
  for select
  to authenticated
  using ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 2. RPC: admin_update_car — đổi giá và bật/tắt xe
--   - security definer, search_path rỗng, tên đầy đủ schema.
--   - Kiểm tra is_admin() TRƯỚC mọi thứ (không lộ xe có tồn tại hay không).
--   - Giá: 1 ≤ price_per_day ≤ 1.000.000.000 (VNĐ, bigint).
--   - FOR UPDATE: hai admin sửa cùng lúc chạy tuần tự.
-- ---------------------------------------------------------------------
create or replace function public.admin_update_car(
  p_car_id        text,
  p_price_per_day bigint,
  p_is_active     boolean
)
returns public.cars
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_price constant bigint := 1000000000;
  v_car       public.cars%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if p_price_per_day is null or p_price_per_day < 1 or p_price_per_day > c_max_price then
    raise exception 'INVALID_PRICE';
  end if;

  if p_is_active is null then
    raise exception 'INVALID_ACTIVE';
  end if;

  select * into v_car
  from public.cars
  where id = p_car_id
  for update;

  if not found then
    raise exception 'CAR_NOT_FOUND';
  end if;

  update public.cars
  set price_per_day = p_price_per_day,
      is_active     = p_is_active
  where id = p_car_id
  returning * into v_car;

  return v_car;
end;
$$;

revoke all on function public.admin_update_car(text, bigint, boolean)
  from public, anon, authenticated;

grant execute on function public.admin_update_car(text, bigint, boolean)
  to authenticated;


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (KHÔNG tự chạy):
--   drop function if exists public.admin_update_car(text, bigint, boolean);
--   drop policy if exists cars_select_admin on public.cars;
--   drop policy if exists cars_select_active_anon on public.cars;
--   revoke select on table public.cars from anon;
-- ---------------------------------------------------------------------
