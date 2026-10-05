/**
 * QUẢN TRỊ ĐỘI XE — ADMIN (0018)
 *
 * - Đọc: SELECT public.cars (policy cars_select_admin, 0011: admin thấy cả xe
 *   tắt / đã lưu trữ).
 * - Ghi: CHỈ qua RPC 0018 (SECURITY DEFINER, kiểm tra is_admin() đầu tiên).
 *   Mỗi thao tác gửi kèm updated_at đã đọc → server từ chối (STALE_CAR) nếu
 *   xe vừa bị sửa ở nơi khác (không ghi đè lẫn nhau).
 * - Ảnh: chọn ảnh → admin zoom / kéo trong trình chỉnh 16:10 → dựng đúng bố cục
 *   đó (tối đa 1600px, JPEG) → upload
 *   bucket car-images tại cars/<id-xe>/<uuid>.jpg (policy chỉ cho admin, đúng
 *   thư mục) → admin_set_car_image (server kiểm tra file tồn tại, đúng thư mục
 *   xe) → xoá ảnh cũ (không bắt buộc thành công).
 */

import type { PostgrestError } from '@supabase/supabase-js';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { serviceLabel } from '@/constants/car-options';
import { supabase } from '@/lib/supabase';
import { AdminBookingError, toAdminError } from '@/services/admin-booking-service';
import { CAR_COLUMNS, type CarRow, resolveCarImage } from '@/services/car-service';
import { CAR_IMAGE_BACKGROUND, type CropState, outputPlan } from '@/utils/car-image-crop';
import type {
  CarCategory,
  CarImageSource,
  FuelType,
  ServiceType,
  ServiceTypeKey,
  TransmissionType,
} from '@/types/car';

const BUCKET = 'car-images';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Lỗi riêng của quản trị xe; mã khác dùng chung bảng lỗi admin. */
const FLEET_ERROR_MESSAGES: Record<string, string> = {
  INVALID_CAR_ID: 'Mã xe cần 3–60 ký tự: chữ thường không dấu, số, gạch nối (vd: toyota-camry-2023).',
  CAR_ID_TAKEN: 'Mã xe này đã tồn tại. Chọn mã khác.',
  INVALID_NAME: 'Tên xe cần từ 1 đến 120 ký tự.',
  INVALID_CATEGORY: 'Dòng xe không hợp lệ.',
  INVALID_SEATS: 'Số chỗ phải từ 2 đến 50.',
  INVALID_FUEL_TYPE: 'Nhiên liệu không hợp lệ.',
  INVALID_TRANSMISSION: 'Hộp số không hợp lệ.',
  INVALID_SERVICE_TYPES: 'Chọn ít nhất một hình thức thuê.',
  INVALID_YEAR: 'Năm sản xuất phải từ 1990 đến 2100.',
  INVALID_FEATURES: 'Tối đa 20 tính năng, mỗi tính năng 1–80 ký tự.',
  INVALID_DEPOSIT: 'Tiền cọc không hợp lệ.',
  INVALID_KM_LIMIT: 'Giới hạn km/ngày phải từ 1 đến 100.000.',
  INVALID_EXTRA_KM_FEE: 'Phụ phí km vượt không hợp lệ.',
  INVALID_CAR_DATA: 'Thông tin xe chưa hợp lệ (hãng ≤ 60, dòng ≤ 80, mô tả ≤ 2000 ký tự, thứ tự 0–10.000).',
  INVALID_IMAGE: 'Ảnh không hợp lệ hoặc chưa tải lên xong. Vui lòng chọn lại ảnh.',
  INVALID_ARCHIVED: 'Thao tác lưu trữ không hợp lệ.',
  STALE_CAR: 'Xe vừa được thay đổi ở nơi khác. Đã tải lại — hãy kiểm tra rồi thao tác lần nữa.',
  CAR_HAS_BOOKINGS: 'Xe đã từng có đơn nên không xoá được (giữ lịch sử đơn). Hãy dùng "Lưu trữ".',
  CAR_ARCHIVED: 'Xe đang lưu trữ. Bỏ lưu trữ trước khi mở lại cho thuê.',
  NO_CHANGES: 'Chưa có thay đổi nào để lưu.',
};

function toFleetError(error: PostgrestError): AdminBookingError {
  const message = FLEET_ERROR_MESSAGES[error.message];

  return message
    ? new AdminBookingError(message, { code: error.message, cause: error })
    : toAdminError(error);
}

export type FleetCar = {
  id: string;
  name: string;
  pricePerDay: number;
  isActive: boolean;
  archivedAt: string | null;
  updatedAt: string;
  imageUrl: string | null;
  /** Ảnh hiển thị (ảnh tải lên → ảnh trong repo → undefined). */
  image?: CarImageSource;
  brand: string;
  model: string;
  year: number | null;
  category: CarCategory;
  seats: number;
  fuelType: FuelType;
  transmission: TransmissionType;
  serviceTypes: ServiceTypeKey[];
  description: string;
  features: string[];
  isFeatured: boolean;
  sortOrder: number;
  depositAmount: number | null;
  kmLimitPerDay: number | null;
  extraKmFee: number | null;
};

type FleetCarRow = CarRow & { updated_at: string; archived_at: string | null };

const optionalNumber = (value: number | null) => (value == null ? null : Number(value));

const toFleetCar = (row: FleetCarRow): FleetCar => ({
  id: row.id,
  name: row.name,
  pricePerDay: Number(row.price_per_day),
  isActive: row.is_active,
  archivedAt: row.archived_at,
  updatedAt: row.updated_at,
  imageUrl: row.image_url,
  image: resolveCarImage(row.id, row.image_url),
  brand: row.brand,
  model: row.model,
  year: row.year,
  category: row.category as CarCategory,
  seats: row.seats,
  fuelType: row.fuel_type as FuelType,
  transmission: row.transmission as TransmissionType,
  serviceTypes: row.service_types as ServiceTypeKey[],
  description: row.description,
  features: row.features,
  isFeatured: row.is_featured,
  sortOrder: row.sort_order,
  depositAmount: optionalNumber(row.deposit_amount),
  kmLimitPerDay: optionalNumber(row.km_limit_per_day),
  extraKmFee: optionalNumber(row.extra_km_fee),
});

export const fleetServiceLabels = (car: FleetCar): ServiceType[] =>
  car.serviceTypes.map(serviceLabel).filter((label): label is ServiceType => !!label);

const FLEET_COLUMNS = `${CAR_COLUMNS}, updated_at, archived_at`;

/** Mọi xe (cả đang tắt / lưu trữ), theo thứ tự hiển thị. */
export async function listFleetCars(): Promise<FleetCar[]> {
  const { data, error } = await supabase
    .from('cars')
    .select(FLEET_COLUMNS)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw toFleetError(error);

  return ((data ?? []) as unknown as FleetCarRow[]).map(toFleetCar);
}

export async function getFleetCar(carId: string): Promise<FleetCar | undefined> {
  const { data, error } = await supabase.from('cars').select(FLEET_COLUMNS).eq('id', carId).maybeSingle();

  if (error) throw toFleetError(error);

  return data ? toFleetCar(data as unknown as FleetCarRow) : undefined;
}

/** Thông tin xe admin nhập (không gồm ảnh, trạng thái cho thuê, lưu trữ). */
export type FleetCarInput = {
  name: string;
  pricePerDay: number;
  brand: string;
  model: string;
  year: number | null;
  category: CarCategory;
  seats: number;
  fuelType: FuelType;
  transmission: TransmissionType;
  serviceTypes: ServiceTypeKey[];
  description: string;
  features: string[];
  isFeatured: boolean;
  sortOrder: number;
  depositAmount: number | null;
  kmLimitPerDay: number | null;
  extraKmFee: number | null;
};

const toParams = (input: FleetCarInput) => ({
  p_name: input.name.trim(),
  p_price_per_day: input.pricePerDay,
  p_brand: input.brand.trim(),
  p_model: input.model.trim(),
  p_year: input.year,
  p_category: input.category,
  p_seats: input.seats,
  p_fuel_type: input.fuelType,
  p_transmission: input.transmission,
  p_service_types: input.serviceTypes,
  p_description: input.description.trim(),
  p_features: input.features.map((feature) => feature.trim()).filter(Boolean),
  p_is_featured: input.isFeatured,
  p_sort_order: input.sortOrder,
  p_deposit_amount: input.depositAmount,
  p_km_limit_per_day: input.kmLimitPerDay,
  p_extra_km_fee: input.extraKmFee,
});

async function callCarRpc(fn: string, params: Record<string, unknown>): Promise<FleetCar> {
  const { data, error } = await supabase.rpc(fn, params);

  if (error) throw toFleetError(error);

  return toFleetCar(data as FleetCarRow);
}

/** Thêm xe — mặc định CHƯA cho thuê (thêm ảnh, kiểm tra rồi mới mở). */
export function createFleetCar(id: string, input: FleetCarInput): Promise<FleetCar> {
  return callCarRpc('admin_create_car', { p_id: id.trim(), ...toParams(input), p_is_active: false });
}

export function updateFleetCar(car: FleetCar, input: FleetCarInput): Promise<FleetCar> {
  return callCarRpc('admin_update_car_details', {
    p_car_id: car.id,
    p_expected_updated_at: car.updatedAt,
    ...toParams(input),
  });
}

export function setFleetCarActive(car: FleetCar, isActive: boolean): Promise<FleetCar> {
  return callCarRpc('admin_set_car_active', {
    p_car_id: car.id,
    p_expected_updated_at: car.updatedAt,
    p_is_active: isActive,
  });
}

export function archiveFleetCar(car: FleetCar, archived: boolean): Promise<FleetCar> {
  return callCarRpc('admin_archive_car', {
    p_car_id: car.id,
    p_expected_updated_at: car.updatedAt,
    p_archived: archived,
  });
}

/** Xoá hẳn — server chỉ cho xe CHƯA TỪNG có đơn (CAR_HAS_BOOKINGS). */
export async function deleteFleetCar(car: FleetCar): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_car', {
    p_car_id: car.id,
    p_expected_updated_at: car.updatedAt,
  });

  if (error) throw toFleetError(error);

  if (car.imageUrl) await removeStorageObject(storagePath(car.imageUrl));
}

// ---------------------------------------------------------------- Ảnh

/** Ảnh gốc admin vừa chọn (chưa cắt). */
export type SourceCarImage = {
  uri: string;
  width: number;
  height: number;
};

/** Ảnh đầu ra 16:10 đã dựng theo bố cục admin chỉnh, sẵn sàng tải lên. */
export type PickedCarImage = {
  /** URI để xem trước (file / blob / data). */
  uri: string;
  base64: string;
  width: number;
  height: number;
};

/** App iOS / Android chưa ghép được nền tối khi thu nhỏ (chỉ web có `extent`). */
export const CAN_PAD_CAR_IMAGE = Platform.OS === 'web';

/**
 * Mở thư viện ảnh (điện thoại) / hộp chọn file (web). Trả ảnh GỐC (không cắt)
 * để admin tự zoom / kéo trong trình chỉnh ảnh. undefined = admin huỷ chọn.
 * Trên web phải gọi trực tiếp từ thao tác bấm của người dùng.
 */
export async function pickCarImage(): Promise<SourceCarImage | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // Bố cục do trình chỉnh ảnh của app quyết định (không dùng khung cắt hệ thống).
    allowsEditing: false,
    quality: 1,
  });

  if (result.canceled || !result.assets?.[0]) return undefined;

  const asset = result.assets[0];

  if (asset.type && asset.type !== 'image') {
    throw new AdminBookingError('Vui lòng chọn file ảnh (JPG, PNG, WEBP).');
  }

  let { width, height } = asset;

  // Một số nguồn (web, ảnh HEIC) không trả kích thước → đọc từ ảnh đã nạp.
  if (!width || !height) {
    const probe = await ImageManipulator.manipulate(asset.uri).renderAsync();
    width = probe.width;
    height = probe.height;
  }

  if (!width || !height || width < 400 || height < 250) {
    throw new AdminBookingError('Ảnh quá nhỏ. Vui lòng chọn ảnh rộng ít nhất 400px.');
  }

  return { uri: asset.uri, width, height };
}

/**
 * Dựng ảnh 16:10 ĐÚNG bố cục đang thấy trong trình chỉnh (cùng outputPlan với
 * khung xem trước): cắt phần ảnh nằm trong khung → thu / phóng giữ nguyên tỉ lệ
 * → (web) đặt lên nền tối nếu admin thu nhỏ → JPEG chất lượng 0.9.
 */
export async function renderCarImage(source: SourceCarImage, crop: CropState): Promise<PickedCarImage> {
  const plan = outputPlan(source, crop);

  if (plan.pad && !CAN_PAD_CAR_IMAGE) {
    throw new AdminBookingError('Trên app chưa hỗ trợ thu nhỏ ảnh dưới khung. Hãy phóng ảnh kín khung.');
  }

  let context = ImageManipulator.manipulate(source.uri).crop(plan.crop).resize(plan.resize);

  if (plan.pad) {
    context = context.extent({
      backgroundColor: CAR_IMAGE_BACKGROUND,
      originX: -plan.pad.left,
      originY: -plan.pad.top,
      width: plan.width,
      height: plan.height,
    });
  }

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });

  if (!saved.base64 || saved.width !== plan.width || saved.height !== plan.height) {
    throw new AdminBookingError('Không xử lý được ảnh. Vui lòng thử lại hoặc chọn ảnh khác.');
  }

  if (base64ByteLength(saved.base64) > MAX_UPLOAD_BYTES) {
    throw new AdminBookingError('Ảnh sau khi nén vẫn lớn hơn 5 MB. Vui lòng chọn ảnh khác.');
  }

  return { uri: saved.uri, base64: saved.base64, width: saved.width, height: saved.height };
}

/** Tải ảnh lên và gắn cho xe; xoá ảnh cũ trong bucket (nếu có). */
export async function uploadFleetCarImage(car: FleetCar, image: PickedCarImage): Promise<FleetCar> {
  const path = `cars/${car.id}/${randomUuid()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, base64ToBytes(image.base64), { contentType: 'image/jpeg', upsert: false });

  if (uploadError) {
    throw new AdminBookingError(
      /row-level security|unauthorized|403/i.test(uploadError.message)
        ? 'Tài khoản không có quyền tải ảnh. Vui lòng đăng nhập lại tài khoản quản trị.'
        : 'Tải ảnh lên chưa thành công. Vui lòng kiểm tra mạng và thử lại.',
      { code: 'UPLOAD_FAILED', cause: uploadError }
    );
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  try {
    const updated = await callCarRpc('admin_set_car_image', {
      p_car_id: car.id,
      p_expected_updated_at: car.updatedAt,
      p_image_url: data.publicUrl,
    });

    if (car.imageUrl) await removeStorageObject(storagePath(car.imageUrl));

    return updated;
  } catch (error) {
    // Không gắn được ảnh → dọn file vừa tải lên.
    await removeStorageObject(path);
    throw error;
  }
}

/** Bỏ ảnh tải lên: xe quay về ảnh trong repo (5 xe ban đầu) hoặc khung chờ ảnh. */
export async function clearFleetCarImage(car: FleetCar): Promise<FleetCar> {
  const updated = await callCarRpc('admin_set_car_image', {
    p_car_id: car.id,
    p_expected_updated_at: car.updatedAt,
    p_image_url: null,
  });

  if (car.imageUrl) await removeStorageObject(storagePath(car.imageUrl));

  return updated;
}

/** Đường dẫn trong bucket từ URL public; undefined nếu không phải ảnh xe của bucket. */
function storagePath(url: string): string | undefined {
  const path = /\/storage\/v1\/object\/public\/car-images\/(cars\/[a-z0-9-]+\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp))$/.exec(url)?.[1];

  return path;
}

/** Xoá file cũ — không chặn thao tác nếu lỗi (file thừa không ảnh hưởng hiển thị). */
async function removeStorageObject(path: string | undefined): Promise<void> {
  if (!path) return;

  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // bỏ qua
  }
}

function randomUuid(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;

  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();

  // Chỉ dùng làm tên file duy nhất (không phải bí mật); server kiểm tra định dạng.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);

    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ByteLength(base64: string): number {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');

  return Math.floor((clean.length * 3) / 4);
}

/** base64 → bytes (không phụ thuộc atob / Buffer để chạy giống nhau trên web và app). */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (const char of clean) {
    buffer = (buffer << 6) | BASE64_ALPHABET.indexOf(char);
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = (buffer >> bits) & 0xff;
    }
  }

  return bytes.subarray(0, index);
}
