# Eagle Capital Cars

App đặt thuê xe sang của Eagle Capital (Expo / React Native, Expo Router, Supabase).

- **Khách:** xem xe → đặt xe → "Đơn của tôi" (trạng thái, giá chính thức, lý do), tự hủy yêu cầu đang chờ.
  Thông báo trong app (badge chưa đọc) + push khi đơn được xác nhận / từ chối / huỷ / hết hạn / hoàn tất.
  Tài khoản (không bắt buộc): đăng nhập bằng số điện thoại (OTP) để giữ đơn trên mọi thiết bị — đơn đã
  gửi trên máy được chuyển vào tài khoản. Chính sách quyền riêng tư, Điều khoản, xoá tài khoản trong app.
- **Admin** (`/admin`, hoặc nhấn giữ logo trên Trang chủ): đăng nhập email, danh sách đơn theo trạng thái
  (nhãn GẤP cho đơn chờ sắp tới giờ nhận), tìm đơn theo mã EC / số điện thoại / tên khách,
  xác nhận / từ chối / hoàn tất / hủy đơn, gọi khách, lịch sử thao tác của từng đơn, Lịch xe,
  Xe & giá, theo dõi thông báo Telegram và push khách (thất bại / đang chờ / đã gửi) và gửi lại khi thất bại,
  loại tài khoản của đơn (ẩn danh / số điện thoại / đã xoá), thông báo đã gửi cho khách theo đơn.

## Chạy local

```bash
npm install
cp .env.example .env.local   # điền URL + publishable key của Supabase
npx expo start               # quét QR bằng Expo Go, nhấn w để mở web
```

`.env.local` không được commit. Chỉ dùng **publishable key**; không bao giờ đưa `service_role` / secret key vào app.

## Kiểm tra

```bash
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

## Database (Supabase)

Migration trong `supabase/migrations/`, chạy theo thứ tự (đã áp dụng trên Production):

| File | Nội dung |
|---|---|
| `0001_init.sql` | `cars`, `booking_requests`, RLS, chống trùng lịch, RPC tạo/hủy yêu cầu |
| `0002_seed_cars.sql` | Dữ liệu xe ban đầu (`is_active` mặc định `false`) |
| `0003_admin_access.sql` | `admin_users`, `is_admin()`, admin đọc mọi đơn |
| `0004_booking_status_guard.sql` | Bảo vệ vòng đời trạng thái, lịch sử `booking_status_events` |
| `0005_admin_booking_actions.sql` | Admin xác nhận / từ chối |
| `0006_admin_complete_cancel_expire.sql` | Admin hoàn tất / hủy, đánh dấu hết hạn |
| `0007_notify_new_booking.sql` | Báo đơn mới qua Telegram (pg_net + Vault: `telegram_bot_token`, `telegram_chat_id`) |
| `0008_notify_new_booking_fix_url.sql` | Sửa hàm báo Telegram: làm sạch secret, không ghi lỗi chi tiết vào log |
| `0009_car_availability.sql` | `check_car_availability` cho khách (chỉ trả boolean, chỉ confirmed giữ lịch) |
| `0010_notification_outbox.sql` | Outbox thông báo + `pg_cron` mỗi phút (job `eagle-notification-outbox`) đối soát và gửi lại Telegram khi lỗi |
| `0011_car_catalog_admin.sql` | Danh mục xe từ Supabase (anon đọc xe active), admin xem cả xe tắt, RPC `admin_update_car` (giá / bật-tắt) |
| `0012_admin_search_outbox_expire.sql` | Admin tìm đơn (`admin_search_booking_requests`), theo dõi / gửi lại thông báo Telegram (`admin_*notification*`), `pg_cron` mỗi 5 phút tự chuyển đơn chờ quá giờ nhận sang hết hạn (job `eagle-expire-stale-bookings`) |
| `0013_customer_accounts_notifications.sql` | Tài khoản khách: chuyển đơn ẩn danh → tài khoản (mã một lần), thông báo trong app (trigger), push outbox + `pg_cron` mỗi phút (job `eagle-push-outbox`), xoá tài khoản (ẩn danh hoá đơn), RPC admin; FK `booking_requests.user_id` → `ON DELETE SET NULL` |

Danh mục xe: Supabase (`public.cars`) quyết định xe nào đang cho thuê, tên và giá; `src/data/cars.ts`
chỉ bổ sung ảnh / mô tả. Xe có trong database nhưng chưa có dữ liệu trong `cars.ts` sẽ chưa hiển thị.

Tìm đơn theo số điện thoại / tên hiện quét toàn bảng (đủ nhanh ở quy mô hiện tại). Khi bảng vượt khoảng
50.000 đơn, cân nhắc `pg_trgm` + index GIN. Tìm theo tên phân biệt dấu ("nguyen" không khớp "Nguyễn").

Cron jobs (pg_cron): `eagle-notification-outbox` (mỗi phút, gửi / gửi lại Telegram),
`eagle-expire-stale-bookings` (mỗi 5 phút, đơn chờ quá giờ nhận → hết hạn; lịch sử ghi là Hệ thống) và
`eagle-push-outbox` (mỗi phút, gửi push cho khách qua Expo Push Service, retry tối đa 5 lần, xoá token
thiết bị đã gỡ app).

Nguyên tắc: app **không** ghi trực tiếp vào bảng; mọi thao tác ghi đi qua RPC (`security definer`,
kiểm tra quyền bên trong). Không sửa migration đã chạy — thay đổi mới tạo file migration mới.

Thêm admin: tạo user (email + mật khẩu) trong Supabase Authentication, rồi chạy trong SQL Editor:

```sql
insert into public.admin_users (user_id, note)
select u.id, 'Admin'
from auth.users u
where u.id = '<ADMIN_USER_UUID>'::uuid
  and coalesce(u.is_anonymous, false) = false
on conflict (user_id) do nothing;
```

## Cấu hình bên ngoài (bắt buộc trước khi dùng thật)

**Supabase Dashboard**
- Authentication → Sign In / Providers → **Phone**: bật, chọn nhà cung cấp SMS (Twilio / MessageBird /
  Vonage / Textlocal) và nhập credentials của nhà cung cấp **trong Dashboard** (không đưa vào repo).
  Chưa bật → màn đăng nhập báo "Đăng nhập bằng số điện thoại chưa được bật", app vẫn đặt xe bình thường.
- Authentication → Rate Limits: kiểm tra giới hạn gửi SMS / xác thực OTP phù hợp chi phí SMS.
- (Tuỳ chọn) Expo "Enhanced Push Security": tạo access token trên expo.dev, lưu vào Vault tên
  `expo_push_access_token`. Không bật thì không cần.

**Expo / EAS** (`npx eas-cli@latest …`)
- `eas login`, `eas init` (ghi `extra.eas.projectId` + `owner` vào app.json — cần để lấy push token).
- Biến môi trường cho build: `eas env:create` cho `EXPO_PUBLIC_SUPABASE_URL` và
  `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ở các environment development / preview / production.
- Build: `eas build --profile development|preview|production --platform ios|android`.
  Push KHÔNG chạy trên Expo Go Android (SDK 53+) — dùng development build.

**Apple** (Apple Developer Program): bundle id `vn.eaglecapital.cars`; khi `eas build` lần đầu cho iOS,
EAS tự tạo certificate + provisioning profile + APNs key (đăng nhập Apple ID có quyền). App Store
Connect: tạo app, điền URL chính sách quyền riêng tư công khai (cần website — nội dung có trong app).

**Google / Firebase**: tạo project Firebase, thêm Android app `vn.eaglecapital.cars`, tải
`google-services.json` về gốc repo và thêm `"googleServicesFile": "./google-services.json"` vào
`expo.android` trong app.json; tạo service account key FCM V1 và tải lên EAS
(`eas credentials` → Android → Push Notifications). Không commit file khoá service account.

## Backlog (chưa làm)

- **Phát hành lên App Store / Google Play**: cần các cấu hình ở mục trên và website có trang chính sách
  quyền riêng tư công khai.
- **MFA cho admin** (Supabase TOTP): chưa bật để không khoá đăng nhập admin hiện tại; cần màn nhập mã.
- **Tìm theo tên không dấu** (extension `unaccent`) và index `pg_trgm` khi dữ liệu lớn.
- **Đối soát push receipt** của Expo (hiện xử lý ở mức ticket: DeviceNotRegistered, InvalidCredentials…).
- **Báo cáo doanh thu / thống kê** cho admin.
