-- =====================================================================
-- Eagle Capital Cars — 0013_customer_accounts_notifications.sql
--
-- Tài khoản khách + thông báo cho khách (gộp một migration):
--   1. booking_requests.user_id: FK → ON DELETE SET NULL (cho phép xoá tài
--      khoản mà vẫn giữ đơn — đã ẩn danh hoá — cho nghiệp vụ / lịch sử).
--   2. Chuyển đơn từ phiên ẩn danh sang tài khoản số điện thoại:
--      account_link_tokens + create_account_link_token / claim_anonymous_bookings,
--      lưu vết ở booking_ownership_transfers.
--   3. Thông báo trong app: customer_notifications, tạo bằng trigger khi
--      trạng thái đơn đổi (không phụ thuộc app admin đang mở).
--   4. Push (Expo Push Service): push_tokens + push_outbox + process_push_outbox
--      (pg_cron mỗi phút, retry có giới hạn, xoá token DeviceNotRegistered).
--   5. Xoá tài khoản: delete_my_account (ẩn danh hoá đơn, xoá auth user).
--   6. RPC admin: lịch sử có người thực hiện tính ở server, loại tài khoản
--      của đơn, thông báo của khách theo đơn, theo dõi / gửi lại push.
--
-- KHÔNG có trong migration này:
--   - Sửa create_booking_request, cancel_my_booking_request, các RPC admin
--     0005/0006/0011/0012, guard/log 0004, exclusion constraint, catalog,
--     availability, outbox Telegram 0010 và các cron job hiện có.
--   - Secret: push gửi tới https://exp.host không cần secret. Nếu bật
--     "Enhanced Push Security" của Expo, lưu access token vào Vault với tên
--     'expo_push_access_token' (KHÔNG đưa vào repo).
--
-- Phụ thuộc: 0001, 0003 (is_admin), 0004, 0010 (notification_outbox_response,
-- pg_net, pg_cron), 0012.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. booking_requests.user_id → ON DELETE SET NULL
--   - Trước: NOT NULL + ON DELETE RESTRICT (không xoá được auth user có đơn).
--   - Sau : NULL được phép = "tài khoản đã xoá". RLS khách so sánh
--     auth.uid() = user_id → đơn user_id null không khách nào thấy; admin
--     vẫn thấy. create_booking_request luôn ghi user_id = auth.uid().
--   - Chỉ đổi metadata ràng buộc, không đổi dữ liệu đơn nào.
-- ---------------------------------------------------------------------
alter table public.booking_requests alter column user_id drop not null;

do $$
declare
  v_con text;
begin
  for v_con in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.booking_requests'::regclass
      and c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and a.attname = 'user_id'
  loop
    execute format('alter table public.booking_requests drop constraint %I', v_con);
  end loop;
end
$$;

alter table public.booking_requests
  add constraint booking_requests_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;


-- ---------------------------------------------------------------------
-- 2. BẢNG
-- ---------------------------------------------------------------------

-- 2a. Thông báo trong app cho khách
create table if not exists public.customer_notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  booking_id  uuid references public.booking_requests (id) on delete cascade,
  kind        text not null check (kind in (
                'booking_confirmed', 'booking_rejected', 'booking_cancelled',
                'booking_expired', 'booking_completed')),
  title       text not null check (char_length(title) between 1 and 120),
  body        text not null check (char_length(body) between 1 and 500),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists customer_notifications_user_created_idx
  on public.customer_notifications (user_id, created_at desc);
create index if not exists customer_notifications_user_unread_idx
  on public.customer_notifications (user_id) where read_at is null;
create index if not exists customer_notifications_booking_idx
  on public.customer_notifications (booking_id);

-- 2b. Expo push token theo thiết bị (không client nào đọc trực tiếp)
create table if not exists public.push_tokens (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  token         text not null unique
                check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$'),
  platform      text not null check (platform in ('ios', 'android')),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- 2c. Hàng đợi push (1 dòng / thông báo). Không lưu token, chỉ id token
--     của lần gửi gần nhất để xử lý phản hồi DeviceNotRegistered.
create table if not exists public.push_outbox (
  id               bigint generated always as identity primary key,
  notification_id  bigint not null unique
                   references public.customer_notifications (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  status           text not null default 'pending'
                   check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts         integer not null default 0 check (attempts >= 0),
  max_attempts     integer not null default 5 check (max_attempts between 1 and 20),
  last_request_id  bigint,
  last_token_ids   bigint[],
  last_attempt_at  timestamptz,
  next_attempt_at  timestamptz not null default now(),
  last_status_code integer,
  last_error       text check (last_error is null or char_length(last_error) <= 100),
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists push_outbox_due_idx
  on public.push_outbox (next_attempt_at) where status = 'pending';
create index if not exists push_outbox_user_idx on public.push_outbox (user_id);

drop trigger if exists push_outbox_set_updated_at on public.push_outbox;
create trigger push_outbox_set_updated_at
  before update on public.push_outbox
  for each row execute function public.set_updated_at();

-- 2d. Mã một lần để chuyển đơn của phiên ẩn danh sang tài khoản thật.
--     Chỉ lưu SHA-256 của mã; mã gốc chỉ trả về cho phiên ẩn danh đã tạo.
create table if not exists public.account_link_tokens (
  id              bigint generated always as identity primary key,
  source_user_id  uuid not null references auth.users (id) on delete cascade,
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at      timestamptz not null,
  used_at         timestamptz,
  used_by         uuid,
  created_at      timestamptz not null default now()
);

create index if not exists account_link_tokens_source_idx
  on public.account_link_tokens (source_user_id, created_at);

-- 2e. Lưu vết chuyển chủ đơn (không FK tới auth.users để còn khi user bị xoá)
create table if not exists public.booking_ownership_transfers (
  id            bigint generated always as identity primary key,
  booking_id    uuid not null references public.booking_requests (id) on delete cascade,
  from_user_id  uuid not null,
  to_user_id    uuid not null,
  created_at    timestamptz not null default now()
);

create index if not exists booking_ownership_transfers_booking_idx
  on public.booking_ownership_transfers (booking_id);


-- ---------------------------------------------------------------------
-- 3. QUYỀN BẢNG + RLS
--   - customer_notifications: khách SELECT của mình, admin SELECT tất cả.
--     Đánh dấu đã đọc chỉ qua RPC. Không INSERT/UPDATE/DELETE trực tiếp.
--   - booking_ownership_transfers: chỉ admin SELECT.
--   - push_tokens, push_outbox, account_link_tokens: không quyền gì cho client.
-- ---------------------------------------------------------------------
alter table public.customer_notifications      enable row level security;
alter table public.push_tokens                 enable row level security;
alter table public.push_outbox                 enable row level security;
alter table public.account_link_tokens         enable row level security;
alter table public.booking_ownership_transfers enable row level security;

revoke all on table public.customer_notifications      from public, anon, authenticated;
revoke all on table public.push_tokens                 from public, anon, authenticated;
revoke all on table public.push_outbox                 from public, anon, authenticated;
revoke all on table public.account_link_tokens         from public, anon, authenticated;
revoke all on table public.booking_ownership_transfers from public, anon, authenticated;

grant select on table public.customer_notifications      to authenticated;
grant select on table public.booking_ownership_transfers to authenticated;

drop policy if exists customer_notifications_select_own on public.customer_notifications;
create policy customer_notifications_select_own
  on public.customer_notifications
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists customer_notifications_select_admin on public.customer_notifications;
create policy customer_notifications_select_admin
  on public.customer_notifications
  for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists booking_ownership_transfers_select_admin on public.booking_ownership_transfers;
create policy booking_ownership_transfers_select_admin
  on public.booking_ownership_transfers
  for select
  to authenticated
  using ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 4. NỘI DUNG THÔNG BÁO + TRIGGER TẠO THÔNG BÁO
--   - Trạng thái báo khách: confirmed, rejected, cancelled (trừ khi chính
--     khách huỷ), expired, completed. pending (tạo đơn) không báo.
--   - Trigger AFTER UPDATE OF status, SECURITY DEFINER (client không có
--     quyền INSERT). Mọi lỗi bị nuốt: đổi trạng thái đơn KHÔNG BAO GIỜ thất
--     bại vì thông báo.
--   - Đơn không còn chủ (user_id null: tài khoản đã xoá) → không báo.
-- ---------------------------------------------------------------------
create or replace function public.customer_notification_content(
  b         public.booking_requests,
  out kind  text,
  out title text,
  out body  text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_pickup text := to_char(b.pickup_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY');
  v_reason text := nullif(btrim(coalesce(b.status_reason, '')), '');
begin
  case b.status
    when 'confirmed' then
      kind  := 'booking_confirmed';
      title := format('Đơn %s đã được xác nhận', b.booking_code);
      body  := format('%s · nhận xe %s. Giá chốt %sđ.%s',
                 b.car_name, v_pickup,
                 replace(to_char(coalesce(b.final_total, b.estimated_total), 'FM999,999,999,999'), ',', '.'),
                 case when v_reason is null then '' else ' Ghi chú: ' || v_reason end);
    when 'rejected' then
      kind  := 'booking_rejected';
      title := format('Đơn %s chưa được xác nhận', b.booking_code);
      body  := format('%s · %s', b.car_name,
                 coalesce('Lý do: ' || v_reason, 'Vui lòng liên hệ Eagle Capital để được hỗ trợ.'));
    when 'cancelled' then
      kind  := 'booking_cancelled';
      title := format('Đơn %s đã bị huỷ', b.booking_code);
      body  := format('%s · %s', b.car_name,
                 coalesce('Lý do: ' || v_reason, 'Vui lòng liên hệ Eagle Capital để được hỗ trợ.'));
    when 'expired' then
      kind  := 'booking_expired';
      title := format('Đơn %s đã hết hạn', b.booking_code);
      body  := format('%s · Yêu cầu chưa được xác nhận trước giờ nhận xe. Vui lòng đặt lại hoặc liên hệ Eagle Capital.',
                 b.car_name);
    when 'completed' then
      kind  := 'booking_completed';
      title := format('Chuyến %s đã hoàn tất', b.booking_code);
      body  := format('Cảm ơn quý khách đã thuê %s cùng Eagle Capital Cars.', b.car_name);
    else
      kind := null;
  end case;

  title := left(title, 120);
  body  := left(body, 500);
end;
$$;

create or replace function public.notify_customer_booking_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content record;
  v_id      bigint;
begin
  if new.user_id is null then
    return null;
  end if;

  -- Khách tự huỷ trên app: không cần báo lại chính họ.
  if new.status = 'cancelled' and auth.uid() is not distinct from new.user_id then
    return null;
  end if;

  begin
    select * into v_content from public.customer_notification_content(new);

    if v_content.kind is null then
      return null;
    end if;

    insert into public.customer_notifications (user_id, booking_id, kind, title, body)
    values (new.user_id, new.id, v_content.kind, v_content.title, v_content.body)
    returning id into v_id;

    insert into public.push_outbox (notification_id, user_id)
    values (v_id, new.user_id);
  exception
    when others then
      raise warning 'customer notification failed (SQLSTATE %), skipped', sqlstate;
  end;

  return null;  -- AFTER trigger
end;
$$;

drop trigger if exists booking_requests_notify_customer_status on public.booking_requests;
create trigger booking_requests_notify_customer_status
  after update of status on public.booking_requests
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_customer_booking_status();


-- ---------------------------------------------------------------------
-- 5. GỬI PUSH (Expo Push Service) — một lần thử, không bao giờ raise.
--   - Gửi tới mọi token của user (tối đa 20) trong MỘT request; lưu id
--     token theo đúng thứ tự để đối chiếu ticket trả về.
--   - Không có token → skipped (NO_DEVICE).
--   - Không ghi sqlerrm (giống 0010).
-- ---------------------------------------------------------------------
create or replace function public.expo_push_send(p_outbox_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row     public.push_outbox%rowtype;
  v_notif   public.customer_notifications%rowtype;
  v_ids     bigint[];
  v_msgs    jsonb;
  v_access  text;
  v_headers jsonb := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb;
  v_req     bigint;
begin
  select * into v_row from public.push_outbox where id = p_outbox_id;
  if not found or v_row.status <> 'pending' then
    return;
  end if;

  begin
    select * into v_notif from public.customer_notifications where id = v_row.notification_id;

    select
      array_agg(t.id order by t.id),
      jsonb_agg(jsonb_build_object(
        'to', t.token,
        'title', v_notif.title,
        'body', v_notif.body,
        'sound', 'default',
        'channelId', 'default',
        'data', jsonb_build_object('bookingId', v_notif.booking_id, 'notificationId', v_notif.id)
      ) order by t.id)
    into v_ids, v_msgs
    from (
      select pt.id, pt.token
      from public.push_tokens pt
      where pt.user_id = v_row.user_id
      order by pt.id
      limit 20
    ) t;

    if v_ids is null then
      update public.push_outbox
      set status          = 'skipped',
          last_attempt_at = now(),
          last_request_id = null,
          last_token_ids  = null,
          last_error      = 'NO_DEVICE'
      where id = p_outbox_id;
      return;
    end if;

    -- Tuỳ chọn: access token của Expo (Enhanced Push Security) trong Vault.
    select ds.decrypted_secret into v_access
    from vault.decrypted_secrets ds where ds.name = 'expo_push_access_token';
    v_access := btrim(coalesce(v_access, ''), E' \t\r\n');

    if v_access <> '' then
      v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_access);
    end if;

    v_req := net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      body    := v_msgs,
      headers := v_headers,
      timeout_milliseconds := 15000
    );

    update public.push_outbox
    set attempts        = attempts + 1,
        last_attempt_at = now(),
        last_request_id = v_req,
        last_token_ids  = v_ids,
        last_error      = null,
        next_attempt_at = now() + interval '30 seconds'
    where id = p_outbox_id;
  exception
    when others then
      update public.push_outbox
      set attempts        = attempts + 1,
          last_attempt_at = now(),
          last_request_id = null,
          last_error      = 'SEND_ERROR_' || sqlstate,
          status          = case when attempts + 1 >= max_attempts then 'failed' else 'pending' end,
          next_attempt_at = now() + interval '5 minutes'
      where id = p_outbox_id;
  end;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. XỬ LÝ push_outbox (pg_cron mỗi phút). Trả số dòng đã xử lý.
--   pending + chưa có request → gửi.
--   pending + có request → đọc phản hồi (notification_outbox_response, 0010):
--     chưa có, < 5 phút → chờ; ≥ 5 phút → retry (NO_RESPONSE)
--     timeout / lỗi mạng / 5xx / 429 → retry
--     2xx: đọc ticket từng token —
--        ≥ 1 ok                       → sent
--        DeviceNotRegistered          → xoá token đó
--        tất cả token đều đã hỏng     → skipped (DEVICE_NOT_REGISTERED)
--        MessageRateExceeded (không ok nào) → retry
--        lỗi ticket khác (vd InvalidCredentials khi chưa cấu hình APNs/FCM)
--                                     → failed (TICKET_<mã>)
--     4xx khác → failed.
--   retry: hết lượt (attempts ≥ max_attempts = 5) → failed; còn → backoff
--   1, 2, 5, 10, 30 phút.
-- ---------------------------------------------------------------------
create or replace function public.process_push_outbox()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r          public.push_outbox%rowtype;
  v_resp     record;
  v_json     jsonb;
  v_tickets  jsonb;
  v_ticket   jsonb;
  v_err      text;
  v_ok       integer;
  v_dead     integer;
  v_rate     integer;
  v_other    text;
  v_total    integer;
  v_retry    boolean;
  v_wait     interval;
  v_error    text;
  v_n        integer := 0;
  i          integer;
begin
  for r in
    select * from public.push_outbox
    where status = 'pending' and next_attempt_at <= now()
    order by next_attempt_at
    limit 50
    for update skip locked
  loop
    v_n := v_n + 1;

    begin
      if r.last_request_id is null then
        if r.attempts >= r.max_attempts then
          update public.push_outbox
          set status = 'failed', last_error = coalesce(last_error, 'MAX_ATTEMPTS')
          where id = r.id;
        else
          perform public.expo_push_send(r.id);
        end if;
        continue;
      end if;

      select * into v_resp from public.notification_outbox_response(r.last_request_id);
      v_retry := false;
      v_wait  := null;
      v_error := null;

      if not v_resp.has_response then
        if now() - r.last_attempt_at < interval '5 minutes' then
          update public.push_outbox set next_attempt_at = now() + interval '1 minute' where id = r.id;
          continue;
        end if;
        v_retry := true;
        v_error := 'NO_RESPONSE';

      elsif v_resp.timed_out or v_resp.has_error or v_resp.status_code is null then
        v_retry := true;
        v_error := case when v_resp.timed_out then 'TIMEOUT' else 'NETWORK_ERROR' end;

      elsif v_resp.status_code between 200 and 299 then
        v_tickets := null;
        begin
          v_json    := v_resp.content::jsonb;
          v_tickets := v_json -> 'data';
        exception when others then
          v_tickets := null;
        end;

        if v_tickets is null or jsonb_typeof(v_tickets) <> 'array' then
          update public.push_outbox
          set status = 'failed', last_status_code = v_resp.status_code, last_error = 'BAD_RESPONSE'
          where id = r.id;
          continue;
        end if;

        v_ok := 0; v_dead := 0; v_rate := 0; v_other := null;
        v_total := jsonb_array_length(v_tickets);

        for i in 0 .. v_total - 1 loop
          v_ticket := v_tickets -> i;

          if v_ticket ->> 'status' = 'ok' then
            v_ok := v_ok + 1;
          else
            v_err := coalesce(v_ticket -> 'details' ->> 'error', 'UNKNOWN');

            if v_err = 'DeviceNotRegistered' then
              v_dead := v_dead + 1;
              if r.last_token_ids is not null and i + 1 <= cardinality(r.last_token_ids) then
                delete from public.push_tokens where id = r.last_token_ids[i + 1];
              end if;
            elsif v_err = 'MessageRateExceeded' then
              v_rate := v_rate + 1;
            else
              v_other := v_err;
            end if;
          end if;
        end loop;

        if v_ok > 0 then
          update public.push_outbox
          set status = 'sent', sent_at = now(), last_status_code = v_resp.status_code,
              last_error = case when v_ok < v_total then 'PARTIAL' else null end
          where id = r.id;
          continue;
        elsif v_total > 0 and v_dead = v_total then
          update public.push_outbox
          set status = 'skipped', last_status_code = v_resp.status_code,
              last_error = 'DEVICE_NOT_REGISTERED'
          where id = r.id;
          continue;
        elsif v_rate > 0 and v_other is null then
          v_retry := true;
          v_error := 'RATE_LIMITED';
          v_wait  := interval '1 minute';
        else
          update public.push_outbox
          set status = 'failed', last_status_code = v_resp.status_code,
              last_error = left('TICKET_' || coalesce(v_other, 'EMPTY'), 100)
          where id = r.id;
          continue;
        end if;

      elsif v_resp.status_code = 429 then
        v_retry := true;
        v_error := 'RATE_LIMITED';
        v_wait  := interval '1 minute';

      elsif v_resp.status_code >= 500 then
        v_retry := true;
        v_error := 'HTTP_' || v_resp.status_code;

      else
        update public.push_outbox
        set status = 'failed', last_status_code = v_resp.status_code,
            last_error = 'HTTP_' || v_resp.status_code
        where id = r.id;
        continue;
      end if;

      if v_retry then
        if r.attempts >= r.max_attempts then
          update public.push_outbox
          set status = 'failed', last_status_code = v_resp.status_code, last_error = v_error
          where id = r.id;
        else
          update public.push_outbox
          set last_request_id  = null,
              last_status_code = v_resp.status_code,
              last_error       = v_error,
              next_attempt_at  = now() + coalesce(
                v_wait,
                case r.attempts
                  when 1 then interval '1 minute'
                  when 2 then interval '2 minutes'
                  when 3 then interval '5 minutes'
                  when 4 then interval '10 minutes'
                  else interval '30 minutes'
                end)
          where id = r.id;
        end if;
      end if;
    exception
      when others then
        update public.push_outbox
        set last_error = 'PROCESS_ERROR_' || sqlstate,
            next_attempt_at = now() + interval '5 minutes'
        where id = r.id;
    end;
  end loop;

  return v_n;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. RPC KHÁCH
-- ---------------------------------------------------------------------

-- 7a. Đăng ký push token của thiết bị cho user hiện tại.
--   Token đã thuộc user khác (thiết bị đổi tài khoản) → chuyển sang user
--   hiện tại. Mỗi user giữ tối đa 10 token mới nhất.
create or replace function public.register_push_token(
  p_token    text,
  p_platform text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_token text := btrim(coalesce(p_token, ''));
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if v_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$' then
    raise exception 'INVALID_PUSH_TOKEN';
  end if;

  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'INVALID_PLATFORM';
  end if;

  insert into public.push_tokens (user_id, token, platform)
  values (v_uid, v_token, p_platform)
  on conflict (token) do update
    set user_id      = excluded.user_id,
        platform     = excluded.platform,
        last_seen_at = now();

  delete from public.push_tokens t
  where t.user_id = v_uid
    and t.id not in (
      select k.id from public.push_tokens k
      where k.user_id = v_uid
      order by k.last_seen_at desc, k.id desc
      limit 10
    );
end;
$$;

-- 7b. Gỡ token của chính mình (khi đăng xuất). Token của người khác: bỏ qua.
create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  delete from public.push_tokens
  where token = btrim(coalesce(p_token, ''))
    and user_id = v_uid;
end;
$$;

-- 7c. Đánh dấu đã đọc (p_ids null = tất cả). Chỉ thông báo của chính mình.
create or replace function public.mark_customer_notifications_read(
  p_ids bigint[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_ids is not null and cardinality(p_ids) > 200 then
    raise exception 'TOO_MANY_IDS';
  end if;

  update public.customer_notifications
  set read_at = now()
  where user_id = v_uid
    and read_at is null
    and (p_ids is null or id = any (p_ids));

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

-- 7d. Phiên ẨN DANH tạo mã một lần (30 phút) để sau khi đăng nhập tài khoản
--     thật mang đơn cũ theo. Bằng chứng sở hữu = đang giữ phiên ẩn danh đó
--     (không dùng số điện thoại / mã EC). Tối đa 10 mã / giờ / user.
create or replace function public.create_account_link_token()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     or not exists (select 1 from auth.users u where u.id = v_uid and u.is_anonymous) then
    raise exception 'NOT_ANONYMOUS';
  end if;

  if (select count(*) from public.account_link_tokens t
      where t.source_user_id = v_uid and t.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'RATE_LIMITED';
  end if;

  delete from public.account_link_tokens t
  where t.source_user_id = v_uid and t.expires_at < now() - interval '1 day';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.account_link_tokens (source_user_id, token_hash, expires_at)
  values (v_uid, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + interval '30 minutes');

  return v_token;
end;
$$;

-- 7e. Tài khoản THẬT (không ẩn danh, không phải admin) dùng mã để nhận các
--     đơn của phiên ẩn danh nguồn. Mã sai / đã dùng / hết hạn / nguồn không
--     còn ẩn danh → cùng một lỗi INVALID_TOKEN (không lộ lý do).
--     Chuyển: đơn, thông báo, hàng đợi push; xoá push token của phiên nguồn
--     (thiết bị sẽ đăng ký lại cho tài khoản mới). Lịch sử trạng thái giữ
--     nguyên changed_by cũ; lưu vết ở booking_ownership_transfers.
create or replace function public.claim_anonymous_bookings(p_token text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_token  text := lower(btrim(coalesce(p_token, '')));
  v_link   public.account_link_tokens%rowtype;
  v_count  integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     or exists (select 1 from auth.users u where u.id = v_uid and u.is_anonymous) then
    raise exception 'NOT_ALLOWED';
  end if;

  if public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  if v_token !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_TOKEN';
  end if;

  select * into v_link
  from public.account_link_tokens t
  where t.token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
  for update;

  if not found
     or v_link.used_at is not null
     or v_link.expires_at <= now()
     or v_link.source_user_id = v_uid
     or not exists (select 1 from auth.users u
                    where u.id = v_link.source_user_id and u.is_anonymous) then
    raise exception 'INVALID_TOKEN';
  end if;

  insert into public.booking_ownership_transfers (booking_id, from_user_id, to_user_id)
  select b.id, v_link.source_user_id, v_uid
  from public.booking_requests b
  where b.user_id = v_link.source_user_id;

  update public.booking_requests
  set user_id = v_uid
  where user_id = v_link.source_user_id;

  get diagnostics v_count = row_count;

  update public.customer_notifications set user_id = v_uid where user_id = v_link.source_user_id;
  update public.push_outbox            set user_id = v_uid where user_id = v_link.source_user_id;
  delete from public.push_tokens where user_id = v_link.source_user_id;

  update public.account_link_tokens
  set used_at = now(), used_by = v_uid
  where id = v_link.id;

  return v_count;
end;
$$;

-- 7f. Xoá tài khoản của chính mình.
--   - Admin không tự xoá được (tránh khoá quyền quản trị).
--   - Còn đơn đang hiệu lực (pending chưa tới giờ nhận, hoặc confirmed chưa
--     tới giờ trả) → ACTIVE_BOOKINGS: khách huỷ đơn chờ / liên hệ trước.
--   - Đơn cũ GIỮ LẠI cho nghiệp vụ (xe, thời gian, giá, trạng thái, lịch sử)
--     nhưng ẩn danh hoá: tên, số điện thoại, ghi chú, địa điểm.
--   - Xoá auth user → user_id của đơn thành null (FK mục 1); thông báo,
--     push token, mã liên kết của user bị xoá theo (ON DELETE CASCADE).
--   - Trả số đơn đã ẩn danh hoá. Toàn bộ trong một transaction.
create or replace function public.delete_my_account()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if public.is_admin() or exists (select 1 from public.admin_users a where a.user_id = v_uid) then
    raise exception 'ADMIN_ACCOUNT';
  end if;

  if exists (
    select 1 from public.booking_requests b
    where b.user_id = v_uid
      and ((b.status = 'pending' and b.pickup_at > now())
        or (b.status = 'confirmed' and b.return_at > now()))
  ) then
    raise exception 'ACTIVE_BOOKINGS';
  end if;

  update public.booking_requests
  set customer_name   = 'Khách đã xoá tài khoản',
      customer_phone  = '0000000000',
      customer_note   = null,
      pickup_location = '(đã xoá)',
      return_location = '(đã xoá)'
  where user_id = v_uid;

  get diagnostics v_count = row_count;

  delete from auth.users where id = v_uid;

  return v_count;
end;
$$;


-- ---------------------------------------------------------------------
-- 8. RPC ADMIN (SECURITY DEFINER, is_admin() kiểm tra đầu tiên)
-- ---------------------------------------------------------------------

-- 8a. Lịch sử trạng thái với người thực hiện tính ở server (đúng cả khi
--     đơn đã được chuyển chủ hoặc tài khoản khách đã xoá).
create or replace function public.admin_list_booking_status_events(p_booking_id uuid)
returns table (
  id          bigint,
  from_status text,
  to_status   text,
  actor       text,
  is_viewer   boolean,
  reason      text,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  return query
  select
    e.id,
    e.from_status,
    e.to_status,
    case
      when e.to_status = 'expired' then 'system'
      when e.actor_role = 'migration_0004' then 'legacy'
      when e.changed_by is null then 'database'
      when exists (select 1 from public.admin_users a where a.user_id = e.changed_by) then 'admin'
      else 'customer'
    end,
    e.changed_by is not distinct from auth.uid() and e.changed_by is not null,
    e.reason,
    e.created_at
  from public.booking_status_events e
  where e.booking_id = p_booking_id
  order by e.created_at, e.id
  limit 200;
end;
$$;

-- 8b. Loại tài khoản sở hữu đơn: anonymous | phone | email | deleted.
--     verified_phone: số đã xác thực OTP (dạng 84…), chỉ khi kind = phone.
create or replace function public.admin_booking_account(
  p_booking_id       uuid,
  out account_kind   text,
  out verified_phone text,
  out claimed        boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_found   boolean;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select true, b.user_id into v_found, v_user_id
  from public.booking_requests b where b.id = p_booking_id;

  if v_found is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  claimed := exists (select 1 from public.booking_ownership_transfers t where t.booking_id = p_booking_id);

  if v_user_id is null then
    account_kind := 'deleted';
    return;
  end if;

  select
    case
      when u.is_anonymous then 'anonymous'
      when u.phone is not null and u.phone <> '' then 'phone'
      when u.email is not null and u.email <> '' then 'email'
      else 'anonymous'
    end,
    case when not coalesce(u.is_anonymous, false) and u.phone <> '' then u.phone end
  into account_kind, verified_phone
  from auth.users u
  where u.id = v_user_id;

  if account_kind is null then
    account_kind := 'deleted';
  end if;
end;
$$;

-- 8c. Thông báo của khách cho một đơn + trạng thái push (không có token).
create or replace function public.admin_list_customer_notifications(p_booking_id uuid)
returns table (
  id                bigint,
  kind              text,
  title             text,
  created_at        timestamptz,
  read_at           timestamptz,
  push_id           bigint,
  push_status       text,
  push_attempts     integer,
  push_max_attempts integer,
  push_last_error   text,
  push_sent_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  return query
  select n.id, n.kind, n.title, n.created_at, n.read_at,
         p.id, p.status, p.attempts, p.max_attempts, p.last_error, p.sent_at
  from public.customer_notifications n
  left join public.push_outbox p on p.notification_id = n.id
  where n.booking_id = p_booking_id
  order by n.created_at, n.id
  limit 100;
end;
$$;

-- 8d. Đếm push theo trạng thái. overdue_pending: pending tạo > 10 phút.
create or replace function public.admin_push_outbox_summary(
  out failed_count          integer,
  out pending_count         integer,
  out overdue_pending_count integer,
  out sent_count            integer,
  out skipped_count         integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select
    count(*) filter (where o.status = 'failed')::integer,
    count(*) filter (where o.status = 'pending')::integer,
    count(*) filter (where o.status = 'pending'
                       and o.created_at < now() - interval '10 minutes')::integer,
    count(*) filter (where o.status = 'sent')::integer,
    count(*) filter (where o.status = 'skipped')::integer
  into failed_count, pending_count, overdue_pending_count, sent_count, skipped_count
  from public.push_outbox o;
end;
$$;

-- 8e. Danh sách push: failed trước, rồi pending, sent, skipped; mới nhất trước.
create or replace function public.admin_list_push_outbox(
  p_status text    default null,
  p_limit  integer default 50
)
returns table (
  id               bigint,
  booking_id       uuid,
  booking_code     text,
  title            text,
  status           text,
  attempts         integer,
  max_attempts     integer,
  last_attempt_at  timestamptz,
  next_attempt_at  timestamptz,
  last_status_code integer,
  last_error       text,
  sent_at          timestamptz,
  created_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if p_status is not null and p_status not in ('pending', 'sent', 'failed', 'skipped') then
    raise exception 'INVALID_STATUS';
  end if;

  return query
  select o.id, n.booking_id, b.booking_code, n.title, o.status,
         o.attempts, o.max_attempts, o.last_attempt_at, o.next_attempt_at,
         o.last_status_code, o.last_error, o.sent_at, o.created_at
  from public.push_outbox o
  join public.customer_notifications n on n.id = o.notification_id
  left join public.booking_requests b on b.id = n.booking_id
  where (p_status is null or o.status = p_status)
  order by
    case o.status when 'failed' then 0 when 'pending' then 1 when 'sent' then 2 else 3 end,
    o.created_at desc,
    o.id desc
  limit v_limit;
end;
$$;

-- 8f. Gửi lại push FAILED: về pending (attempts = 0), cron gửi ở lượt kế
--     tiếp. Không gửi trong hàm. Bấm hai lần → NOTIFICATION_NOT_FAILED.
create or replace function public.admin_retry_push(p_outbox_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select o.status into v_status
  from public.push_outbox o
  where o.id = p_outbox_id
  for update;

  if not found then
    raise exception 'NOTIFICATION_NOT_FOUND';
  end if;

  if v_status <> 'failed' then
    raise exception 'NOTIFICATION_NOT_FAILED';
  end if;

  update public.push_outbox
  set status           = 'pending',
      attempts         = 0,
      last_request_id  = null,
      last_token_ids   = null,
      last_status_code = null,
      last_error       = 'MANUAL_RETRY',
      next_attempt_at  = now()
  where id = p_outbox_id;

  return 'pending';
end;
$$;


-- ---------------------------------------------------------------------
-- 9. QUYỀN FUNCTION
-- ---------------------------------------------------------------------
-- Nội bộ (trigger / cron): không client nào gọi.
revoke all on function public.customer_notification_content(public.booking_requests) from public, anon, authenticated;
revoke all on function public.notify_customer_booking_status()                      from public, anon, authenticated;
revoke all on function public.expo_push_send(bigint)                                from public, anon, authenticated;
revoke all on function public.process_push_outbox()                                 from public, anon, authenticated;

-- Khách (kể cả phiên ẩn danh) + admin: chỉ authenticated.
revoke all on function public.register_push_token(text, text)               from public, anon, authenticated;
revoke all on function public.unregister_push_token(text)                   from public, anon, authenticated;
revoke all on function public.mark_customer_notifications_read(bigint[])    from public, anon, authenticated;
revoke all on function public.create_account_link_token()                   from public, anon, authenticated;
revoke all on function public.claim_anonymous_bookings(text)                from public, anon, authenticated;
revoke all on function public.delete_my_account()                           from public, anon, authenticated;
revoke all on function public.admin_list_booking_status_events(uuid)        from public, anon, authenticated;
revoke all on function public.admin_booking_account(uuid)                   from public, anon, authenticated;
revoke all on function public.admin_list_customer_notifications(uuid)       from public, anon, authenticated;
revoke all on function public.admin_push_outbox_summary()                   from public, anon, authenticated;
revoke all on function public.admin_list_push_outbox(text, integer)         from public, anon, authenticated;
revoke all on function public.admin_retry_push(bigint)                      from public, anon, authenticated;

grant execute on function public.register_push_token(text, text)            to authenticated;
grant execute on function public.unregister_push_token(text)                to authenticated;
grant execute on function public.mark_customer_notifications_read(bigint[]) to authenticated;
grant execute on function public.create_account_link_token()                to authenticated;
grant execute on function public.claim_anonymous_bookings(text)             to authenticated;
grant execute on function public.delete_my_account()                        to authenticated;
grant execute on function public.admin_list_booking_status_events(uuid)     to authenticated;
grant execute on function public.admin_booking_account(uuid)                to authenticated;
grant execute on function public.admin_list_customer_notifications(uuid)    to authenticated;
grant execute on function public.admin_push_outbox_summary()                to authenticated;
grant execute on function public.admin_list_push_outbox(text, integer)      to authenticated;
grant execute on function public.admin_retry_push(bigint)                   to authenticated;


-- ---------------------------------------------------------------------
-- 10. CRON: push mỗi phút. Cùng tên → cập nhật job, không tạo trùng.
-- ---------------------------------------------------------------------
select cron.schedule(
  'eagle-push-outbox',
  '* * * * *',
  'select public.process_push_outbox();'
);


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (KHÔNG tự chạy). Dữ liệu thông báo / token sẽ mất;
-- các đơn đã được chuyển chủ giữ nguyên chủ mới.
--   select cron.unschedule('eagle-push-outbox');
--   drop trigger if exists booking_requests_notify_customer_status on public.booking_requests;
--   drop function if exists public.admin_retry_push(bigint);
--   drop function if exists public.admin_list_push_outbox(text, integer);
--   drop function if exists public.admin_push_outbox_summary();
--   drop function if exists public.admin_list_customer_notifications(uuid);
--   drop function if exists public.admin_booking_account(uuid);
--   drop function if exists public.admin_list_booking_status_events(uuid);
--   drop function if exists public.delete_my_account();
--   drop function if exists public.claim_anonymous_bookings(text);
--   drop function if exists public.create_account_link_token();
--   drop function if exists public.mark_customer_notifications_read(bigint[]);
--   drop function if exists public.unregister_push_token(text);
--   drop function if exists public.register_push_token(text, text);
--   drop function if exists public.process_push_outbox();
--   drop function if exists public.expo_push_send(bigint);
--   drop function if exists public.notify_customer_booking_status();
--   drop function if exists public.customer_notification_content(public.booking_requests);
--   drop table if exists public.push_outbox;
--   drop table if exists public.push_tokens;
--   drop table if exists public.customer_notifications;
--   drop table if exists public.account_link_tokens;
--   drop table if exists public.booking_ownership_transfers;
--   -- Trả FK về RESTRICT + NOT NULL chỉ khi KHÔNG còn đơn user_id null:
--   --   alter table public.booking_requests drop constraint booking_requests_user_id_fkey;
--   --   alter table public.booking_requests add constraint booking_requests_user_id_fkey
--   --     foreign key (user_id) references auth.users (id) on delete restrict;
--   --   alter table public.booking_requests alter column user_id set not null;
-- ---------------------------------------------------------------------
