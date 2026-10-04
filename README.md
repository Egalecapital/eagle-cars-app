# Eagle Capital Cars

App đặt thuê xe sang của Eagle Capital (Expo / React Native, Expo Router, Supabase).

- **Khách:** xem xe → đặt xe → "Đơn của tôi" (trạng thái, giá chính thức, lý do), tự hủy yêu cầu đang chờ.
- **Admin** (`/admin`, hoặc nhấn giữ logo trên Trang chủ): đăng nhập email, danh sách đơn theo trạng thái,
  xác nhận / từ chối / hoàn tất / hủy đơn.

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
