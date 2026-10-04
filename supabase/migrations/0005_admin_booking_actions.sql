-- =====================================================================
-- Eagle Capital Cars — 0005_admin_booking_actions.sql
--
-- Bước 3 của Admin: thao tác GHI của admin trên yêu cầu đặt xe.
--   - public.admin_confirm_booking_request : pending → confirmed
--   - public.admin_reject_booking_request  : pending → rejected
--
-- Phụ thuộc:
--   0001 booking_requests, cars, exclusion constraint
--        booking_requests_no_overlap_confirmed.
--   0003 public.is_admin().
--   0004 trigger guard (vòng đời) + trigger log (booking_status_events).
--
-- KHÔNG có trong migration này:
--   - Bảng / cột / policy / trigger mới.
--   - Quyền UPDATE trực tiếp cho client hay admin.
--   - Hoàn tất / huỷ đơn đã xác nhận (0006).
--
-- Bảo mật:
--   - Hai hàm SECURITY DEFINER, search_path rỗng, tên đầy đủ schema.
--   - Quyền admin kiểm tra BÊN TRONG hàm bằng public.is_admin() (đọc
--     auth.uid()/JWT của người gọi). Không phải admin → NOT_ADMIN, kiểm
--     tra trước mọi thứ khác nên không lộ đơn có tồn tại hay không.
--   - Admin chỉ chọn hành động + giá chốt / ghi chú / lý do. Không sửa
--     được xe, giờ, giá/ngày, thông tin khách hay trạng thái tuỳ ý.
--
-- Lịch sử: trigger log của 0004 tự ghi changed_by = auth.uid() (admin),
-- actor_role = 'authenticated', reason = status_reason.
--
-- Lỗi trả về dạng mã cố định để app dịch sang tiếng Việt:
--   NOT_ADMIN, BOOKING_NOT_FOUND, NOT_PENDING, PICKUP_IN_PAST,
--   CAR_NOT_AVAILABLE, INVALID_FINAL_TOTAL, NOTE_TOO_LONG,
--   BOOKING_CONFLICT, REASON_REQUIRED, REASON_TOO_LONG.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. RPC: admin_confirm_booking_request
--   - Chỉ pending → confirmed.
--   - Giờ nhận phải còn ở tương lai; xe phải còn is_active.
--   - p_final_total bỏ trống → final_total = estimated_total.
--   - p_note (tuỳ chọn, ≤ 500 ký tự) lưu vào status_reason; khách thấy.
--   - Trùng lịch với đơn confirmed khác: exclusion constraint chặn
--     (23P01) → BOOKING_CONFLICT, DETAIL nêu mã đơn đang giữ lịch.
--   - FOR UPDATE trên đơn: chạy tuần tự với cancel_my_booking_request
--     và các lần admin thao tác khác trên cùng đơn.
--   - FOR SHARE trên xe: không ai tắt is_active của xe giữa lúc kiểm tra
--     và lúc xác nhận.
-- ---------------------------------------------------------------------
create or replace function public.admin_confirm_booking_request(
  p_booking_id  uuid,
  p_final_total bigint default null,
  p_note        text   default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_row      public.booking_requests%rowtype;
  v_conflict text;
begin
  -- 1. Quyền admin (trước mọi kiểm tra khác)
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  -- 2. Tham số
  if p_final_total is not null and p_final_total < 0 then
    raise exception 'INVALID_FINAL_TOTAL';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'NOTE_TOO_LONG';
  end if;

  -- 3. Khoá đơn
  select * into v_row
  from public.booking_requests
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- 4. Trạng thái + thời gian
  if v_row.status <> 'pending' then
    raise exception 'NOT_PENDING'
      using detail = format('current status: %s', v_row.status);
  end if;

  if v_row.pickup_at <= now() then
    raise exception 'PICKUP_IN_PAST';
  end if;

  -- 5. Xe còn hoạt động (khoá chia sẻ dòng xe tới hết transaction)
  perform 1
  from public.cars c
  where c.id = v_row.car_id
    and c.is_active
  for share;

  if not found then
    raise exception 'CAR_NOT_AVAILABLE';
  end if;

  -- 6. Xác nhận; exclusion constraint là lớp bảo vệ cuối chống trùng lịch
  begin
    update public.booking_requests
    set status        = 'confirmed',
        final_total   = coalesce(p_final_total, v_row.estimated_total),
        status_reason = v_note
    where id = p_booking_id
    returning * into v_row;
  exception
    when exclusion_violation then
      -- Chỉ để hiển thị cho admin; không phải lớp bảo vệ.
      select b.booking_code into v_conflict
      from public.booking_requests b
      where b.car_id = v_row.car_id
        and b.status = 'confirmed'
        and b.id <> p_booking_id
        and tstzrange(b.pickup_at, b.return_at, '[)')
            && tstzrange(v_row.pickup_at, v_row.return_at, '[)')
      order by b.pickup_at
      limit 1;

      -- format() coi NULL là chuỗi rỗng → dùng CASE thay vì coalesce.
      raise exception 'BOOKING_CONFLICT'
        using detail = case
          when v_conflict is null then 'conflicts with a confirmed booking'
          else format('conflicts with confirmed booking %s', v_conflict)
        end;
  end;

  return v_row;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. RPC: admin_reject_booking_request
--   - Chỉ pending → rejected.
--   - p_reason bắt buộc, 3–500 ký tự sau khi cắt khoảng trắng; lưu vào
--     status_reason, khách sẽ thấy.
--   - Không kiểm tra giờ nhận: từ chối đơn đã quá giờ là hợp lệ.
--   - FOR UPDATE trên đơn như hàm xác nhận.
-- ---------------------------------------------------------------------
create or replace function public.admin_reject_booking_request(
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
  -- 1. Quyền admin (trước mọi kiểm tra khác)
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  -- 2. Lý do
  if char_length(v_reason) < 3 then
    raise exception 'REASON_REQUIRED';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'REASON_TOO_LONG';
  end if;

  -- 3. Khoá đơn
  select * into v_row
  from public.booking_requests
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- 4. Trạng thái
  if v_row.status <> 'pending' then
    raise exception 'NOT_PENDING'
      using detail = format('current status: %s', v_row.status);
  end if;

  -- 5. Từ chối
  update public.booking_requests
  set status        = 'rejected',
      status_reason = v_reason
  where id = p_booking_id
  returning * into v_row;

  return v_row;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. QUYỀN FUNCTION
--   PostgreSQL mặc định cấp EXECUTE cho PUBLIC, Supabase cấp thêm cho
--   anon/authenticated → thu hồi hết, chỉ cấp lại cho authenticated.
--   anon (không có phiên) không gọi được. User authenticated không phải
--   admin (kể cả anonymous user) gọi được nhưng nhận NOT_ADMIN.
-- ---------------------------------------------------------------------
revoke all on function public.admin_confirm_booking_request(uuid, bigint, text)
  from public, anon, authenticated;

grant execute on function public.admin_confirm_booking_request(uuid, bigint, text)
  to authenticated;

revoke all on function public.admin_reject_booking_request(uuid, text)
  from public, anon, authenticated;

grant execute on function public.admin_reject_booking_request(uuid, text)
  to authenticated;


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (chỉ dùng khi cần gỡ bước này, KHÔNG tự chạy):
--   drop function if exists public.admin_reject_booking_request(uuid, text);
--   drop function if exists public.admin_confirm_booking_request(uuid, bigint, text);
-- ---------------------------------------------------------------------
