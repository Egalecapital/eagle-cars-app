-- =====================================================================
-- Eagle Capital Cars — 0003_admin_access.sql
--
-- Bước 1 của Admin: CHỈ quyền đọc.
--   - public.admin_users : danh sách user được làm admin (nguồn sự thật).
--   - public.is_admin()  : hàm kiểm tra quyền admin phía server.
--   - Policy SELECT cho admin trên public.booking_requests.
--
-- KHÔNG có trong migration này:
--   - RPC xác nhận / từ chối đơn (bước sau).
--   - Trigger bảo vệ chuyển trạng thái, booking_status_events (bước sau).
--   - Bất kỳ quyền INSERT / UPDATE / DELETE nào cho client.
--   - Email, mật khẩu hay UUID admin cụ thể. Admin được thêm thủ công
--     bằng SQL Editor sau khi tạo tài khoản trên Supabase Auth.
--
-- Route guard trong app chỉ phục vụ UX. Lớp bảo mật là RLS + is_admin().
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. BẢNG admin_users
--   - Một dòng = một user Supabase Auth có quyền admin.
--   - on delete cascade: xoá user Auth thì quyền admin mất theo.
--   - role chỉ có 'admin' ở giai đoạn này; sau này có thể mở rộng
--     (vd 'staff') bằng cách thay CHECK.
-- ---------------------------------------------------------------------
create table public.admin_users (
  user_id    uuid primary key
             references auth.users (id) on delete cascade,
  role       text not null default 'admin'
             check (role in ('admin')),
  note       text
             check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

-- RLS bật và KHÔNG có policy nào: client (anon/authenticated) không đọc,
-- không ghi được bảng này. Chỉ is_admin() (security definer) và
-- SQL Editor / service_role mới truy cập được.
alter table public.admin_users enable row level security;

revoke all on table public.admin_users from anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. HÀM public.is_admin()
--   Trả true khi và chỉ khi:
--     (a) request có phiên đăng nhập (auth.uid() khác null),
--     (b) phiên KHÔNG phải anonymous (claim is_anonymous khác true),
--     (c) auth.uid() có trong public.admin_users.
--
--   security definer: hàm chạy với quyền chủ sở hữu (postgres) nên đọc
--   được admin_users dù client không có quyền trên bảng này.
--
--   Không đệ quy RLS: hàm chỉ đọc admin_users (bảng không có policy gọi
--   lại is_admin) và chủ sở hữu bảng bỏ qua RLS; hàm KHÔNG đọc
--   booking_requests, nên policy trên booking_requests gọi is_admin()
--   không thể tự gọi lại chính nó.
--
--   stable: kết quả không đổi trong một câu lệnh → Postgres có thể chỉ
--   tính một lần khi dùng trong policy dạng (select public.is_admin()).
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
    );
$$;

-- Policy chạy với role của người gọi → authenticated cần EXECUTE.
-- anon (không có phiên) không cần và không được gọi.
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;


-- ---------------------------------------------------------------------
-- 3. POLICY SELECT CHO ADMIN TRÊN booking_requests
--   - Postgres kết hợp các policy permissive bằng OR:
--       booking_requests_select_own   (0001): user_id = auth.uid()
--       booking_requests_select_admin (mới) : is_admin()
--     → khách vẫn chỉ thấy đơn của mình; admin thấy tất cả.
--   - Không thay đổi quyền bảng: authenticated vẫn chỉ có SELECT (0001),
--     không có INSERT / UPDATE / DELETE.
--   - (select ...) để Postgres tính is_admin() một lần mỗi câu lệnh
--     thay vì cho từng dòng.
-- ---------------------------------------------------------------------
create policy booking_requests_select_admin
  on public.booking_requests
  for select
  to authenticated
  using ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (chỉ dùng khi cần gỡ bước này, KHÔNG tự chạy):
--   drop policy if exists booking_requests_select_admin on public.booking_requests;
--   drop function if exists public.is_admin();
--   drop table if exists public.admin_users;
-- ---------------------------------------------------------------------
