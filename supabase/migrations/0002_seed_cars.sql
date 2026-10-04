-- =====================================================================
-- Eagle Capital Cars — 0002_seed_cars.sql
--
-- Dữ liệu xe ban đầu. CHỈ gồm các trường map chính xác từ
-- src/data/cars.ts: id, name, pricePerDay → price_per_day.
--
-- KHÔNG seed:
--   - is_active: cars.ts không có trường này → dùng mặc định của bảng
--     (false). Xe chỉ nhận đặt sau khi được bật có chủ đích, ví dụ:
--       update public.cars set is_active = true where id = '<car-id>';
--   - hình thức thuê, ảnh, mô tả, isFeatured: chưa có trên database.
--
-- on conflict do nothing: chạy lại không ghi đè dữ liệu admin đã sửa.
--
-- TODO (giai đoạn sau): app đọc xe và giá từ Supabase, thay cho
-- src/data/cars.ts, để không còn hai nguồn giá có thể lệch nhau.
-- =====================================================================
insert into public.cars (id, name, price_per_day) values
  ('porsche-panamera',  'Porsche Panamera 4 Sport Turismo', 4500000),
  ('bmw-530i-m-sport',  'BMW 530i M Sport',                 2500000),
  ('mercedes-e300-amg', 'Mercedes-Benz E300 AMG',           2000000),
  ('mercedes-glc200',   'Mercedes-Benz GLC 200',            2300000),
  ('vinfast-lux-a',     'VinFast Lux A',                    1200000)
on conflict (id) do nothing;
