# Eagle Capital Cars

App đặt thuê xe sang của Eagle Capital (Expo / React Native, Expo Router, Supabase).

- **Khách:** xem xe → đặt xe → "Đơn của tôi" (trạng thái, giá chính thức, lý do), tự hủy yêu cầu đang chờ.
  Thông báo trong app (badge chưa đọc) + push khi đơn được xác nhận / từ chối / huỷ / hết hạn / hoàn tất.
  Tài khoản (không bắt buộc): đăng nhập bằng số điện thoại (OTP) để giữ đơn trên mọi thiết bị — đơn đã
  gửi trên máy được chuyển vào tài khoản. Chính sách quyền riêng tư, Điều khoản, xoá tài khoản trong app.
- **Admin** (`/admin`, hoặc nhấn giữ logo trên Trang chủ): đăng nhập email, danh sách đơn theo trạng thái
  (nhãn GẤP cho đơn chờ sắp tới giờ nhận, số đơn chờ), tìm đơn theo mã EC / số điện thoại / tên khách,
  **tạo đơn cho khách gọi điện / đến trực tiếp** (xác nhận ngay để giữ lịch xe), cảnh báo đơn trùng lịch cùng xe,
  **sửa đơn** đang chờ / đã xác nhận (xe, giờ, hình thức, địa điểm, khách, giá chốt — có nhật ký sửa, báo khách),
  bảng **HÔM NAY** (nhận xe, trả xe, đang thuê, quá giờ trả cần hoàn tất),
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
| `0014_admin_offline_booking_guard.sql` | Cột `booking_requests.source` (app / admin), RPC `admin_create_booking` (admin nhập đơn ngoài app, mặc định xác nhận ngay), trigger chặn đơn trùng (`DUPLICATE_REQUEST`) và > 10 đơn / giờ / tài khoản (`TOO_MANY_REQUESTS`) |
| `0015_admin_edit_booking.sql` | RPC `admin_update_booking` (sửa đơn chờ / đã xác nhận, chống ghi đè đồng thời, exclusion constraint chặn trùng), bảng `booking_change_events` (nhật ký sửa, không lưu giá trị thông tin cá nhân), thông báo khách `booking_updated`; `admin_create_booking` chặn tạo đơn CHỜ với giờ nhận đã qua |
| `0016_telegram_admin_booking_message.sql` | Tin Telegram của đơn admin nhập có tiêu đề “ĐƠN ADMIN NHẬP” và ghi rõ không cần xử lý lại; tin đơn app giữ nguyên |
| `0017_car_images_storage.sql` | Cột `cars.image_url` (chỉ nhận URL công khai của bucket `car-images`), bucket Storage `car-images` public read — không có policy ghi (chỉ upload qua Dashboard) |
| `0018_fleet_admin.sql` | Quản trị đội xe: thông tin xe trong database (hãng, dòng, năm, phân khúc, số chỗ, nhiên liệu, hộp số, hình thức thuê, mô tả, tính năng, nổi bật, thứ tự, cọc, km/ngày, phụ phí km, lưu trữ); RPC `admin_create_car` / `admin_update_car_details` / `admin_set_car_active` / `admin_set_car_image` / `admin_archive_car` / `admin_delete_car` (chống ghi đè đồng thời, chỉ xoá xe chưa từng có đơn); bảng `car_change_events` (nhật ký); trigger chặn đơn mới sai hình thức thuê (`SERVICE_NOT_AVAILABLE`) / xe đã lưu trữ (`CAR_ARCHIVED`); policy Storage: chỉ admin upload / xoá ảnh trong `car-images/cars/<id-xe>/` |

Danh mục xe: Supabase (`public.cars`) là nguồn duy nhất (0018): xe nào đang cho thuê, thứ tự, mọi thông
tin hiển thị và điều kiện thuê. Admin thêm / sửa xe trong **Admin → XE & GIÁ**, khách thấy ngay — không
sửa code, không build / deploy. `src/data/cars.ts` chỉ còn ảnh dự phòng cho 5 xe ban đầu.
**Thứ tự triển khai:** chạy migration 0018 TRƯỚC khi phát hành bản app / web có code 0018 (bản mới đọc
các cột của 0018; database chưa có cột → danh sách xe báo lỗi tải).

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

## Quản trị đội xe (Admin → XE & GIÁ)

- **Thêm xe:** nhập tên, mã xe (đường dẫn, tự gợi ý), giá, thông tin, hình thức thuê, điều kiện thuê.
  Xe mới tạo ở trạng thái CHƯA cho thuê → thêm ảnh, kiểm tra, bấm “Mở cho thuê”.
- **Sửa:** mọi thông tin + giá. Giá mới chỉ áp dụng cho đơn tạo sau khi lưu (đơn đã có giữ giá lúc đặt).
  Bỏ một hình thức thuê chỉ chặn đơn mới. Hai người sửa cùng lúc → người lưu sau nhận thông báo tải lại.
- **Tạm ngừng / mở cho thuê**, **Lưu trữ** (ngừng kinh doanh: ẩn, không nhận đơn mới, giữ lịch sử đơn),
  **Xoá** (chỉ xe chưa từng có đơn). Mọi thay đổi ghi nhật ký `car_change_events`.
- Giá vẫn là một `price_per_day` cho mọi hình thức thuê. Khi cần giá riêng theo hình thức: thêm bảng
  `car_service_prices (car_id, service_type, price_per_day)` + sửa `create_booking_request` /
  `admin_create_booking` lấy giá theo hình thức (fallback `price_per_day`) — các cột hiện tại giữ nguyên.

## Ảnh xe

- Khung hiển thị chuẩn 16:10, ảnh hiển thị trọn xe (không phóng / cắt) trên web và app.
- **Đổi ảnh từ Admin** (điện thoại hoặc máy tính): Sửa xe → Chọn ảnh → app tự cắt 16:10 (phần giữa), thu về
  tối đa 1600px, nén JPEG → tải lên `car-images/cars/<id-xe>/<uuid>.jpg` → gắn cho xe → xoá ảnh cũ.
  Web + App dùng ảnh mới ngay. “Bỏ ảnh” → quay về ảnh repo (5 xe ban đầu) hoặc khung chờ ảnh.
- Chỉ admin upload / xoá được (policy Storage 0018); khách / anon chỉ xem ảnh công khai.
- Ảnh dự phòng trong repo: `assets/images/cars/` (gắn trong `src/data/cars.ts`).
- App iOS / Android: thêm `expo-image-picker` + `expo-image-manipulator` (module native) → cần build
  mới (EAS Build) để dùng chức năng chọn ảnh trên app; web dùng được ngay sau khi deploy.

## Web Production

- **EAS Hosting:** https://eagle-cars-app.expo.app — `npx expo export --platform web` rồi
  `npx eas-cli@latest deploy --prod` (app.json: `web.output` = `"server"` để route động chạy).
- **Shared hosting (OnePanel, https://eaglecapital.vn):** `npm run build:web-hosting` → build tĩnh
  (`EAGLE_WEB_OUTPUT=static`, xem `app.config.js`) + `.htaccess` rewrite từng route động về trang mẫu
  của Expo Router + quét secret → `web-hosting-build/eagle-cars-web-<ngày-giờ>.zip`. Giải nén ZIP vào
  `public_html` (index.html và .htaccess nằm ngay trong public_html). Cấu hình EAS không bị ảnh hưởng.

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
