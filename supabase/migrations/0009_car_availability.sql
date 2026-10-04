-- =====================================================================
-- Eagle Capital Cars — 0009_car_availability.sql
--
-- Kiểm tra xe còn trống cho KHÁCH trước khi gửi yêu cầu (chỉ phục vụ UX).
--   public.check_car_availability(car_id, pickup_at, return_at) → boolean
--     true  = không trùng đơn CONFIRMED nào trong [pickup_at, return_at)
--     false = trùng ít nhất một đơn confirmed
--
-- Nguyên tắc:
--   - Chỉ trả boolean: không booking_id, mã đơn, PII, trạng thái hay lịch bận.
--   - Chỉ 'confirmed' giữ lịch (đúng điều kiện exclusion constraint 0001);
--     pending / rejected / cancelled / completed / expired không giữ lịch.
--   - Least privilege: chỉ authenticated được EXECUTE (app gọi ensureSession).
--   - Giới hạn phạm vi dò: ≤ 30 ngày thuê, giờ nhận trong 180 ngày tới.
--   - Lớp bảo vệ cuối vẫn là create_booking_request (CAR_ALREADY_BOOKED) và
--     exclusion constraint khi admin xác nhận (BOOKING_CONFLICT).
--
-- KHÔNG thay đổi: bảng, cột, RLS, exclusion constraint, RPC hiện có.
-- Admin xem lịch bằng quyền SELECT sẵn có (policy 0003), không cần RPC.
--
-- Lỗi trả về (cùng mã với create_booking_request khi có thể):
--   NOT_AUTHENTICATED, CAR_NOT_AVAILABLE, INVALID_TIME_RANGE,
--   PICKUP_IN_PAST, RENTAL_TOO_LONG, PICKUP_TOO_FAR.
-- =====================================================================

create or replace function public.check_car_availability(
  p_car_id    text,
  p_pickup_at timestamptz,
  p_return_at timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c_max_days      constant integer  := 30;
  c_max_lead_time constant interval := interval '180 days';
  v_days          integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_car_id is null or not exists (
    select 1 from public.cars c where c.id = p_car_id and c.is_active
  ) then
    raise exception 'CAR_NOT_AVAILABLE';
  end if;

  if p_pickup_at is null or p_return_at is null or p_return_at <= p_pickup_at then
    raise exception 'INVALID_TIME_RANGE';
  end if;

  if p_pickup_at <= now() then
    raise exception 'PICKUP_IN_PAST';
  end if;

  if p_pickup_at > now() + c_max_lead_time then
    raise exception 'PICKUP_TOO_FAR';
  end if;

  -- Cùng cách tính với create_booking_request: làm tròn lên theo 24 giờ.
  v_days := greatest(
    1,
    ceil(extract(epoch from (p_return_at - p_pickup_at)) / 86400)::integer
  );

  if v_days > c_max_days then
    raise exception 'RENTAL_TOO_LONG';
  end if;

  -- Cùng điều kiện với exclusion constraint → dùng index GiST partial sẵn có.
  return not exists (
    select 1
    from public.booking_requests b
    where b.car_id = p_car_id
      and b.status in ('confirmed')
      and tstzrange(b.pickup_at, b.return_at, '[)')
          && tstzrange(p_pickup_at, p_return_at, '[)')
  );
end;
$$;

revoke all on function public.check_car_availability(text, timestamptz, timestamptz)
  from public, anon, authenticated;

grant execute on function public.check_car_availability(text, timestamptz, timestamptz)
  to authenticated;


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (KHÔNG tự chạy):
--   drop function if exists public.check_car_availability(text, timestamptz, timestamptz);
-- ---------------------------------------------------------------------
