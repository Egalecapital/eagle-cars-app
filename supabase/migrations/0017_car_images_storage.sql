-- =====================================================================
-- Eagle Capital Cars — 0017_car_images_storage.sql
--
-- Ảnh bìa xe từ Supabase Storage (thay ảnh không cần build / deploy lại):
--   1. public.cars.image_url (nullable). NULL → app dùng ảnh trong repo như cũ.
--   2. Bucket Storage 'car-images': PUBLIC READ qua URL công khai.
--
-- QUYỀN STORAGE:
--   - Bucket public = file đọc được qua /storage/v1/object/public/car-images/…
--     (không cần policy SELECT; không mở quyền liệt kê file qua API).
--   - KHÔNG tạo policy INSERT / UPDATE / DELETE nào trên storage.objects →
--     anon và authenticated (kể cả admin của app) KHÔNG upload / sửa / xoá
--     được. Ảnh được upload bởi chủ project qua Supabase Dashboard.
--   - Không đụng tới bucket / policy khác.
--
-- RÀNG BUỘC image_url: chỉ nhận URL công khai của bucket car-images trên
-- một project Supabase (https://<ref 20 ký tự>.supabase.co/storage/v1/object/
-- public/car-images/<đường dẫn>.<jpg|jpeg|png|webp>), không query string,
-- không "..", tối đa 500 ký tự. Không gắn cứng mã project để vẫn khôi phục
-- được sang project khác (xem KHOI-PHUC-SU-CO.md); app kiểm tra thêm host
-- phải đúng project đang dùng.
--
-- KHÔNG có trong migration này: sửa quyền / policy / RPC của cars
-- (admin_update_car 0011 giữ nguyên — chưa sửa ảnh qua app), booking, lịch
-- xe, giá, cron, Telegram, push. Không cập nhật image_url của xe nào.
-- Phụ thuộc: 0001 (cars), 0011 (quyền đọc cars).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. public.cars.image_url
--   Thêm cột nullable không có default: chỉ đổi metadata, không ghi lại bảng.
--   Quyền SELECT (0001 / 0011) là quyền theo bảng → anon / authenticated đọc
--   được cột mới theo đúng policy hiện có (khách: xe active; admin: mọi xe).
-- ---------------------------------------------------------------------
alter table public.cars add column if not exists image_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cars'::regclass
      and conname = 'cars_image_url_check'
  ) then
    alter table public.cars
      add constraint cars_image_url_check check (
        image_url is null
        or (
          char_length(image_url) <= 500
          and position('..' in image_url) = 0
          and image_url ~ '^https://[a-z0-9]{20}\.supabase\.co/storage/v1/object/public/car-images/[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*\.(jpg|jpeg|png|webp)$'
        )
      );
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 2. Bucket car-images (public read, chỉ ảnh, tối đa 5 MB / file)
--   Chạy lại: chỉ cập nhật lại đúng các thuộc tính này của 'car-images'.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('car-images', 'car-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ---------------------------------------------------------------------
-- ROLLBACK THỦ CÔNG (KHÔNG tự chạy):
--   update public.cars set image_url = null;            -- app quay về ảnh trong repo
--   alter table public.cars drop constraint if exists cars_image_url_check;
--   alter table public.cars drop column if exists image_url;
--   -- Bucket: xoá file trong car-images qua Dashboard trước, rồi:
--   --   delete from storage.buckets where id = 'car-images';
-- ---------------------------------------------------------------------
