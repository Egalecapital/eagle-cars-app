-- =====================================================================
-- Eagle Capital Cars — 0004_booking_status_guard.sql
--
-- Bước 2 của Admin: bảo vệ vòng đời trạng thái + lịch sử thay đổi.
--   - public.booking_status_events : lịch sử trạng thái của từng đơn.
--   - Trigger guard : chỉ cho phép các chuyển trạng thái hợp lệ, áp dụng
--     cho MỌI đường ghi (RPC, Supabase Dashboard, SQL Editor, service_role).
--   - Trigger log   : ghi một dòng lịch sử mỗi khi tạo đơn hoặc đổi trạng thái.
--
-- Phụ thuộc: 0001_init.sql (booking_requests), 0003_admin_access.sql (is_admin).
--
-- KHÔNG có trong migration này:
--   - RPC admin xác nhận / từ chối (0005).
--   - Thay đổi create_booking_request / cancel_my_booking_request.
--   - Bất kỳ quyền ghi nào cho client.
--   - Cơ chế "override" bỏ qua guard (xem ghi chú khẩn cấp cuối file).
--
-- Vòng đời hợp lệ:
--   (tạo mới)  → pending
--   pending    → confirmed | rejected | cancelled | expired
--   confirmed  → completed | cancelled
--   rejected, cancelled, completed, expired : trạng thái cuối.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. BẢNG booking_status_events
--   - from_status null  : sự kiện tạo đơn (hoặc dòng backfill).
--   - changed_by        : auth.uid() của phiên gây ra thay đổi
--                         (khách, admin qua RPC). Null khi đổi từ
--                         Dashboard / SQL Editor / service_role không có JWT.
--                         Không đặt FK tới auth.users để lịch sử vẫn giữ
--                         nguyên UUID kể cả khi user bị xoá.
--   - actor_role        : role trong JWT ('authenticated', 'service_role')
--                         hoặc session_user khi không có JWT (vd 'postgres').
--   - reason            : status_reason của đơn tại thời điểm thay đổi.
--   - on delete restrict: không xoá được đơn khi còn lịch sử; muốn dọn dữ liệu
--                         test phải xoá lịch sử của đơn đó trước, có chủ đích.
-- ---------------------------------------------------------------------
create table public.booking_status_events (
  id          bigint generated always as identity primary key,
  booking_id  uuid not null
              references public.booking_requests (id) on delete restrict,
  from_status text
              check (from_status is null or from_status in (
                'pending', 'confirmed', 'rejected',
                'cancelled', 'completed', 'expired'
              )),
  to_status   text not null
              check (to_status in (
                'pending', 'confirmed', 'rejected',
                'cancelled', 'completed', 'expired'
              )),
  changed_by  uuid,
  actor_role  text not null
              check (char_length(actor_role) between 1 and 64),
  reason      text
              check (reason is null or char_length(reason) <= 500),
  created_at  timestamptz not null default now()
);

-- Xem lịch sử một đơn theo thời gian.
create index booking_status_events_booking_created_idx
  on public.booking_status_events (booking_id, created_at);


-- ---------------------------------------------------------------------
-- 2. QUYỀN + RLS CHO booking_status_events
--   - Client không có INSERT / UPDATE / DELETE: chỉ trigger ghi được.
--   - Chỉ admin (is_admin() từ 0003) đọc được; khách và anon không đọc.
-- ---------------------------------------------------------------------
alter table public.booking_status_events enable row level security;

revoke all on table public.booking_status_events from anon, authenticated;

grant select on table public.booking_status_events to authenticated;

create policy booking_status_events_select_admin
  on public.booking_status_events
  for select
  to authenticated
  using ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 3. TRIGGER GUARD — chặn chuyển trạng thái không hợp lệ
--   - SECURITY INVOKER (mặc định): hàm không đọc/ghi bảng nào, chỉ so
--     sánh OLD/NEW, nên không cần quyền đặc biệt.
--   - BEFORE INSERT: đơn mới bắt buộc ở 'pending'.
--   - BEFORE UPDATE OF status: chỉ cho phép các cặp trong vòng đời;
--     giữ nguyên trạng thái (OLD = NEW) luôn được phép.
--   - Lỗi trả về mã cố định INVALID_STATUS_TRANSITION / INVALID_INITIAL_STATUS
--     (kèm DETAIL from → to) để app/admin dịch thông báo.
--   - Tên trigger bắt đầu bằng "booking_requests_guard_" để chạy TRƯỚC
--     các trigger BEFORE khác (Postgres chạy theo thứ tự tên).
-- ---------------------------------------------------------------------
create or replace function public.guard_booking_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'INVALID_INITIAL_STATUS'
        using detail = format('new booking must start as pending, got %s', new.status);
    end if;

    return new;
  end if;

  -- UPDATE
  if new.status = old.status then
    return new;
  end if;

  if (old.status = 'pending'   and new.status in ('confirmed', 'rejected', 'cancelled', 'expired'))
     or (old.status = 'confirmed' and new.status in ('completed', 'cancelled')) then
    return new;
  end if;

  raise exception 'INVALID_STATUS_TRANSITION'
    using detail = format('%s -> %s is not allowed', old.status, new.status);
end;
$$;

create trigger booking_requests_guard_status_transition
  before insert or update of status on public.booking_requests
  for each row execute function public.guard_booking_status_transition();


-- ---------------------------------------------------------------------
-- 4. TRIGGER LOG — ghi lịch sử trạng thái
--   - AFTER INSERT / AFTER UPDATE OF status: chỉ ghi khi đơn đã được lưu
--     thành công (sau guard, sau CHECK và exclusion constraint).
--   - WHEN (old.status is distinct from new.status): không ghi khi
--     UPDATE giữ nguyên trạng thái.
--   - SECURITY DEFINER: client không có quyền INSERT vào
--     booking_status_events; hàm chạy với quyền chủ sở hữu để ghi lịch sử
--     cho mọi đường thay đổi. Hàm trigger không gọi trực tiếp được
--     (kể cả qua RPC), và chỉ chèn giá trị lấy từ OLD/NEW + phiên hiện tại,
--     nên không mở đường ghi tuỳ ý.
--   - search_path rỗng + tên bảng/hàm đầy đủ schema.
-- ---------------------------------------------------------------------
create or replace function public.log_booking_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.booking_status_events (
    booking_id, from_status, to_status, changed_by, actor_role, reason
  )
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    auth.uid(),
    coalesce(nullif(auth.jwt() ->> 'role', ''), session_user::text),
    new.status_reason
  );

  return null;  -- AFTER trigger: giá trị trả về bị bỏ qua
end;
$$;

create trigger booking_requests_log_status_insert
  after insert on public.booking_requests
  for each row execute function public.log_booking_status_event();

create trigger booking_requests_log_status_update
  after update of status on public.booking_requests
  for each row
  when (old.status is distinct from new.status)
  execute function public.log_booking_status_event();


-- ---------------------------------------------------------------------
-- 5. QUYỀN FUNCTION
--   Hàm trigger không cần EXECUTE cho client (Postgres không kiểm tra
--   EXECUTE khi trigger chạy). Thu hồi để không lộ qua Data API.
-- ---------------------------------------------------------------------
revoke all on function public.guard_booking_status_transition()
  from public, anon, authenticated;

revoke all on function public.log_booking_status_event()
  from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. BACKFILL — đơn đã tồn tại trước migration này
--   Một dòng cho mỗi đơn hiện có, ghi trạng thái TẠI THỜI ĐIỂM chạy
--   migration (không tái tạo được lịch sử trước đó).
--   from_status = null, actor_role = 'migration_0004', changed_by = null.
--   WHERE NOT EXISTS: chạy lại khối này không tạo thêm dòng backfill cho
--   đơn đã có dòng 'migration_0004'; không xét các event thật khác.
-- ---------------------------------------------------------------------
insert into public.booking_status_events (
  booking_id, from_status, to_status, changed_by, actor_role, reason, created_at
)
select
  b.id,
  null,
  b.status,
  null,
  'migration_0004',
  'Backfill 0004: trạng thái tại thời điểm bật lịch sử',
  coalesce(b.status_changed_at, b.created_at)
from public.booking_requests b
where not exists (
  select 1
  from public.booking_status_events e
  where e.booking_id = b.id
    and e.actor_role = 'migration_0004'
);


-- ---------------------------------------------------------------------
-- GHI CHÚ KHẨN CẤP (không phải code chạy):
--   Không có cơ chế override trong app/RPC. Nếu chủ dự án thật sự cần sửa
--   sai trạng thái (vd lỡ xác nhận), chỉ làm trong SQL Editor, trong một
--   transaction, bằng cách tạm tắt riêng trigger guard rồi bật lại:
--     begin;
--     alter table public.booking_requests disable trigger booking_requests_guard_status_transition;
--     update public.booking_requests set status = '...' , status_reason = '...' where id = '...';
--     alter table public.booking_requests enable trigger booking_requests_guard_status_transition;
--     commit;
--   Trigger log vẫn chạy nên thay đổi này vẫn có trong lịch sử.
--
-- ROLLBACK THỦ CÔNG (chỉ dùng khi cần gỡ bước này, KHÔNG tự chạy):
--   drop trigger if exists booking_requests_log_status_update on public.booking_requests;
--   drop trigger if exists booking_requests_log_status_insert on public.booking_requests;
--   drop trigger if exists booking_requests_guard_status_transition on public.booking_requests;
--   drop function if exists public.log_booking_status_event();
--   drop function if exists public.guard_booking_status_transition();
--   drop table if exists public.booking_status_events;
-- ---------------------------------------------------------------------
