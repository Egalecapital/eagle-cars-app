-- =====================================================================
-- Eagle Capital Cars — 0006_admin_complete_cancel_expire.sql
--
-- Thao tác vận hành còn thiếu cho MVP:
--   - public.admin_complete_booking_request : confirmed → completed (admin)
--   - public.admin_cancel_booking_request   : confirmed → cancelled (admin,
--                                              bắt buộc lý do)
--   - public.expire_stale_booking_requests  : pending quá giờ nhận → expired
--       + admin gọi  → xử lý mọi đơn
--       + khách gọi  → chỉ xử lý đơn của chính mình
--     App gọi hàm này mỗi khi mở "Đơn của tôi" và danh sách đơn của admin
--     (không cần pg_cron cho MVP).
--
-- Phụ thuộc: 0001 (booking_requests, cars), 0003 (is_admin),
--            0004 (guard cho phép các chuyển trên + trigger log),
--            0005 (cùng mẫu RPC admin).
--
-- KHÔNG có: bảng / cột / policy / trigger mới; quyền UPDATE trực tiếp.
--
-- Lỗi trả về dạng mã cố định:
--   NOT_ADMIN, BOOKING_NOT_FOUND, NOT_CONFIRMED, RENTAL_NOT_STARTED,
--   NOTE_TOO_LONG, REASON_REQUIRED, REASON_TOO_LONG, NOT_AUTHENTICATED.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. RPC: admin_complete_booking_request
--   - Chỉ confirmed → completed, và chỉ khi đã tới giờ nhận xe.
--   - p_note (tuỳ chọn, ≤ 500 ký tự) thay status_reason; bỏ trống thì giữ
--     ghi chú hiện có. Khách nhìn thấy.
--   - FOR UPDATE: chạy tuần tự với các thao tác khác trên cùng đơn.
-- ---------------------------------------------------------------------
create or replace function public.admin_complete_booking_request(
  p_booking_id uuid,
  p_note       text default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_row  public.booking_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'NOTE_TOO_LONG';
  end if;

  select * into v_row
  from public.booking_requests
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_row.status <> 'confirmed' then
    raise exception 'NOT_CONFIRMED'
      using detail = format('current status: %s', v_row.status);
  end if;

  if v_row.pickup_at > now() then
    raise exception 'RENTAL_NOT_STARTED';
  end if;

  update public.booking_requests
  set status        = 'completed',
      status_reason = coalesce(v_note, v_row.status_reason)
  where id = p_booking_id
  returning * into v_row;

  return v_row;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. RPC: admin_cancel_booking_request
--   - Chỉ confirmed → cancelled (đơn pending dùng admin_reject_booking_request).
--   - p_reason bắt buộc, 3–500 ký tự sau khi cắt khoảng trắng; khách thấy.
--   - Huỷ giải phóng lịch xe (cancelled không nằm trong exclusion constraint).
-- ---------------------------------------------------------------------
create or replace function public.admin_cancel_booking_request(
  p_booking_id uuid,
  p_reason     text
)
returns public.booking_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_row    public.booking_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if char_length(v_reason) < 3 then
    raise exception 'REASON_REQUIRED';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'REASON_TOO_LONG';
  end if;

  select * into v_row
  from public.booking_requests
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_row.status <> 'confirmed' then
    raise exception 'NOT_CONFIRMED'
      using detail = format('current status: %s', v_row.status);
  end if;

  update public.booking_requests
  set status        = 'cancelled',
      status_reason = v_reason
  where id = p_booking_id
  returning * into v_row;

  return v_row;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. RPC: expire_stale_booking_requests
--   - pending có pickup_at <= now() → expired, kèm lý do cố định.
--   - Admin: mọi đơn. User thường (kể cả anonymous): chỉ đơn của mình.
--   - Không nhận tham số → không thể dùng để đổi đơn khác hay trạng thái khác.
--   - Trả về số đơn vừa được đánh dấu hết hạn.
--   - Chạy đồng thời với admin_confirm (FOR UPDATE): UPDATE chờ khoá rồi
--     đánh giá lại điều kiện; đơn đã được xác nhận sẽ bị bỏ qua. Ngược lại
--     admin_confirm vốn từ chối đơn đã quá giờ (PICKUP_IN_PAST).
-- ---------------------------------------------------------------------
create or replace function public.expire_stale_booking_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_is_admin boolean := public.is_admin();
  v_count    integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.booking_requests
  set status        = 'expired',
      status_reason = 'Quá giờ nhận xe nhưng yêu cầu chưa được xác nhận.'
  where status = 'pending'
    and pickup_at <= now()
    and (v_is_admin or user_id = v_uid);

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. QUYỀN FUNCTION — chỉ authenticated; quyền thật kiểm tra trong hàm.
-- ---------------------------------------------------------------------
revoke all on function public.admin_complete_booking_request(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_complete_booking_request(uuid, text)
  to authenticated;

revoke all on function public.admin_cancel_booking_request(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_cancel_booking_request(uuid, text)
  to authenticated;

revoke all on function public.expire_stale_booking_requests()
  from public, anon, authenticated;
grant execute on function public.expire_stale_booking_requests()
  to authenticated;


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (chỉ dùng khi cần gỡ, KHÔNG tự chạy):
--   drop function if exists public.expire_stale_booking_requests();
--   drop function if exists public.admin_cancel_booking_request(uuid, text);
--   drop function if exists public.admin_complete_booking_request(uuid, text);
-- ---------------------------------------------------------------------
