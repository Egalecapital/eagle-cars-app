import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { CarImageEditor } from '@/components/car-image-editor';
import { CarPhoto } from '@/components/car-photo';
import { FleetCarForm } from '@/components/fleet-car-form';
import { MaxContentWidth } from '@/constants/theme';
import { useAdminGuard, useFleetCar } from '@/hooks/use-admin';
import { AdminBookingError, countUpcomingConfirmed } from '@/services/admin-booking-service';
import {
  archiveFleetCar,
  clearFleetCarImage,
  deleteFleetCar,
  type FleetCarInput,
  CAN_PAD_CAR_IMAGE,
  pickCarImage,
  renderCarImage,
  type SourceCarImage,
  setFleetCarActive,
  updateFleetCar,
  uploadFleetCarImage,
} from '@/services/fleet-admin-service';
import type { CropState } from '@/utils/car-image-crop';
import { formatPricePerDay } from '@/utils/format-price';
import { goBackOr } from '@/utils/navigation';

const GOLD = '#D4AF37';
const ADMIN_CARS = '/admin/cars' as Href;

/** Xác nhận đang chờ: bật/tắt (kèm số đơn đã xác nhận sắp tới), lưu trữ, xoá. */
type Confirm =
  | { kind: 'active'; upcoming: number }
  | { kind: 'archive' }
  | { kind: 'delete' }
  | undefined;

/** Sửa xe: ảnh, cho thuê, lưu trữ / xoá, thông tin (0018). */
export default function AdminEditCarScreen() {
  const router = useRouter();
  const ready = useAdminGuard();
  const params = useLocalSearchParams<{ carId?: string | string[]; created?: string }>();
  const carId = Array.isArray(params.carId) ? params.carId[0] : params.carId;

  const { car, loading, error: loadError, reload } = useFleetCar(carId, ready);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(params.created ? 'Đã tạo xe. Thêm ảnh rồi bấm “Mở cho thuê”.' : '');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<Confirm>();
  // Ảnh gốc đang chỉnh (zoom / kéo) trước khi lưu.
  const [source, setSource] = useState<SourceCarImage | undefined>();
  // Đang kéo / chụm ảnh → khoá cuộn màn hình.
  const [gesturing, setGesturing] = useState(false);
  // Đổi key sau khi lưu / tải lại vì xe đổi ở nơi khác → form khởi tạo lại từ dữ liệu mới.
  const [formKey, setFormKey] = useState(0);
  const busyRef = useRef(false);

  if (!ready || (loading && !car)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  if (!car) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>{loadError ?? 'Không tìm thấy xe này.'}</Text>
        <TouchableOpacity style={styles.outlineButton} onPress={() => router.replace(ADMIN_CARS)}>
          <Text style={styles.outlineButtonText}>VỀ XE & GIÁ</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /** Chạy một thao tác ghi; lỗi STALE_CAR → tải lại xe + form. */
  /** reloadAfter = false: thao tác xong sẽ rời màn (xoá xe) → không tải lại xe vừa xoá. */
  const run = async (
    action: () => Promise<unknown>,
    success: string,
    options?: { resetForm?: boolean; reloadAfter?: boolean }
  ) => {
    if (busyRef.current) return false;

    busyRef.current = true;
    setBusy(true);
    setError('');
    setMessage('');

    try {
      await action();
      setMessage(success);
      setConfirm(undefined);
      if (options?.resetForm) setFormKey((key) => key + 1);
      if (options?.reloadAfter !== false) reload();
      return true;
    } catch (actionError) {
      setError(
        actionError instanceof AdminBookingError
          ? actionError.userMessage
          : 'Thao tác chưa thành công. Vui lòng thử lại.'
      );

      if (actionError instanceof AdminBookingError && actionError.code === 'STALE_CAR') {
        setConfirm(undefined);
        setFormKey((key) => key + 1);
        reload();
      }

      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const choosePhoto = async () => {
    setError('');
    setMessage('');

    try {
      const image = await pickCarImage();
      if (image) setSource(image);
    } catch (pickError) {
      setError(
        pickError instanceof AdminBookingError
          ? pickError.userMessage
          : 'Không mở / xử lý được ảnh. Vui lòng thử ảnh khác.'
      );
    }
  };

  /** Dựng ảnh đúng bố cục trong khung chỉnh rồi tải lên. */
  const savePhoto = async (crop: CropState) => {
    if (!source) return;

    const saved = await run(
      async () => uploadFleetCarImage(car, await renderCarImage(source, crop)),
      'Đã lưu ảnh mới. Khách thấy ngay.'
    );
    if (saved) setSource(undefined);
  };

  const askActive = async () => {
    setError('');
    setMessage('');

    if (!car.isActive) {
      setConfirm({ kind: 'active', upcoming: 0 });
      return;
    }

    try {
      setBusy(true);
      setConfirm({ kind: 'active', upcoming: await countUpcomingConfirmed(car.id) });
    } catch (countError) {
      setError(countError instanceof AdminBookingError ? countError.userMessage : 'Không kiểm tra được đơn sắp tới.');
    } finally {
      setBusy(false);
    }
  };

  const confirmText = (() => {
    if (!confirm) return '';
    if (confirm.kind === 'active') {
      if (!car.isActive) return 'Mở cho thuê? Khách sẽ thấy và đặt được xe này ngay.';
      return confirm.upcoming > 0
        ? `⚠ Xe còn ${confirm.upcoming} đơn ĐÃ XÁC NHẬN sắp tới. Tắt xe chỉ chặn đơn mới; các đơn đó vẫn giữ nguyên. Tạm ngừng cho thuê?`
        : 'Tạm ngừng cho thuê? Khách sẽ không thấy và không đặt được xe.';
    }
    if (confirm.kind === 'archive') {
      return car.archivedAt
        ? 'Bỏ lưu trữ? Xe trở lại danh sách ở trạng thái ĐANG TẮT (mở cho thuê sau).'
        : 'Lưu trữ xe? Xe ngừng cho thuê, ẩn khỏi danh sách chính, không nhận đơn mới. Đơn cũ và lịch sử giữ nguyên.';
    }
    return 'XOÁ HẲN xe này? Chỉ xoá được xe CHƯA TỪNG có đơn; không hoàn tác được. Xe đã có đơn hãy dùng “Lưu trữ”.';
  })();

  const doConfirm = async () => {
    if (!confirm) return;

    if (confirm.kind === 'active') {
      await run(
        () => setFleetCarActive(car, !car.isActive),
        car.isActive ? 'Đã tạm ngừng cho thuê.' : 'Đã mở cho thuê. Khách thấy xe ngay.'
      );
    } else if (confirm.kind === 'archive') {
      await run(
        () => archiveFleetCar(car, !car.archivedAt),
        car.archivedAt ? 'Đã bỏ lưu trữ (xe đang tắt).' : 'Đã lưu trữ xe.'
      );
    } else if (await run(() => deleteFleetCar(car), 'Đã xoá xe.', { reloadAfter: false })) {
      router.replace(ADMIN_CARS);
    }
  };

  const saveDetails = (input: FleetCarInput) =>
    run(() => updateFleetCar(car, input), 'Đã lưu thông tin xe. Khách thấy ngay.', { resetForm: true });

  const status = car.archivedAt ? 'LƯU TRỮ' : car.isActive ? 'ĐANG CHO THUÊ' : 'ĐANG TẮT';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" scrollEnabled={!gesturing}>
        <TouchableOpacity style={styles.backButton} onPress={() => goBackOr(router, ADMIN_CARS)}>
          <Text style={styles.backText}>← Xe & giá</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>SỬA XE · {car.id}</Text>
        <Text style={styles.title}>{car.name}</Text>
        <View style={styles.statusRow}>
          <Text
            style={[
              styles.badge,
              car.archivedAt ? styles.badgeArchived : car.isActive ? styles.badgeOn : styles.badgeOff,
            ]}
          >
            {status}
          </Text>
          <Text style={styles.price}>{formatPricePerDay(car.pricePerDay)}</Text>
        </View>

        {!!message && <Text style={styles.success}>{message}</Text>}
        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Ảnh */}
        <Text style={styles.section}>Ảnh xe</Text>
        {source ? (
          <CarImageEditor
            image={source}
            allowPadding={CAN_PAD_CAR_IMAGE}
            busy={busy}
            onSave={savePhoto}
            onCancel={() => setSource(undefined)}
            onGestureActive={setGesturing}
          />
        ) : (
          <>
            <CarPhoto source={car.image} style={styles.photo} />
            <Text style={styles.hint}>
              Chọn ảnh rồi tự zoom / kéo để đặt xe đúng vị trí trong khung 16:10 trước khi lưu.
            </Text>
          </>
        )}
        {!source && (
          <View style={styles.row}>
            <TouchableOpacity style={[styles.goldButton, styles.flex, busy && styles.disabled]} onPress={choosePhoto} disabled={busy}>
              <Text style={styles.goldButtonText}>{car.imageUrl ? 'ĐỔI ẢNH' : 'CHỌN ẢNH'}</Text>
            </TouchableOpacity>
            {!!car.imageUrl && (
              <TouchableOpacity
                style={[styles.outlineButton, styles.flex, busy && styles.disabled]}
                disabled={busy}
                onPress={() => run(() => clearFleetCarImage(car), 'Đã bỏ ảnh tải lên.')}
              >
                <Text style={styles.outlineButtonText}>BỎ ẢNH</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Trạng thái */}
        <Text style={styles.section}>Trạng thái</Text>
        {confirm ? (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmText}>{confirmText}</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.confirmYes, confirm.kind === 'delete' && styles.dangerFill, busy && styles.disabled]}
                disabled={busy}
                onPress={doConfirm}
              >
                <Text style={styles.confirmYesText}>XÁC NHẬN</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmNo} disabled={busy} onPress={() => setConfirm(undefined)}>
                <Text style={styles.outlineButtonText}>HUỶ</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {!car.archivedAt && (
              <TouchableOpacity style={[styles.outlineButton, busy && styles.disabled]} onPress={askActive} disabled={busy}>
                <Text style={styles.outlineButtonText}>{car.isActive ? 'TẠM NGỪNG CHO THUÊ' : 'MỞ CHO THUÊ'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.outlineButton, busy && styles.disabled]}
              onPress={() => setConfirm({ kind: 'archive' })}
              disabled={busy}
            >
              <Text style={styles.outlineButtonText}>{car.archivedAt ? 'BỎ LƯU TRỮ' : 'LƯU TRỮ (NGỪNG KINH DOANH)'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.outlineButton, styles.dangerOutline, busy && styles.disabled]}
              onPress={() => setConfirm({ kind: 'delete' })}
              disabled={busy}
            >
              <Text style={styles.dangerText}>XOÁ XE (chỉ xe chưa từng có đơn)</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Thông tin */}
        <Text style={styles.section}>Thông tin & giá</Text>
        <FleetCarForm key={formKey} car={car} busy={busy} submitLabel="LƯU THÔNG TIN" onSubmit={saveDetails} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  center: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center', padding: 24 },
  notFound: { color: '#FFFFFF', fontSize: 16, textAlign: 'center', marginBottom: 16 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: 20,
    paddingTop: 65,
    paddingBottom: 120,
  },
  backButton: { alignSelf: 'flex-start', marginBottom: 18 },
  backText: { color: GOLD, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginTop: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  price: { color: GOLD, fontSize: 17, fontWeight: '900' },
  badge: { fontSize: 11, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  badgeOn: { color: '#5CC98A', backgroundColor: 'rgba(92, 201, 138, 0.12)' },
  badgeOff: { color: '#FF8A80', backgroundColor: 'rgba(255, 138, 128, 0.12)' },
  badgeArchived: { color: '#AAAAAA', backgroundColor: 'rgba(170, 170, 170, 0.12)' },
  section: { color: GOLD, fontSize: 17, fontWeight: '900', marginTop: 26, marginBottom: 10 },
  photo: { borderRadius: 16, borderWidth: 1, borderColor: '#303030' },
  hint: { color: '#888888', fontSize: 12, lineHeight: 17, marginTop: 8 },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  flex: { flex: 1 },
  success: { color: '#5CC98A', fontSize: 14, fontWeight: '700', marginTop: 12 },
  errorBox: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  errorText: { color: '#FFB4AE', fontSize: 14, lineHeight: 20 },
  goldButton: { backgroundColor: GOLD, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  goldButtonText: { color: '#080808', fontWeight: '900' },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: '#777777',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  outlineButtonText: { color: '#CCCCCC', fontWeight: '900' },
  dangerOutline: { borderColor: '#E5534B' },
  dangerText: { color: '#FF8A80', fontWeight: '900' },
  dangerFill: { backgroundColor: '#E5534B' },
  disabled: { opacity: 0.5 },
  confirmBox: {
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
  },
  confirmText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  confirmYes: { flex: 1, backgroundColor: GOLD, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  confirmYesText: { color: '#080808', fontWeight: '900' },
  confirmNo: { flex: 1, borderWidth: 1.5, borderColor: '#777777', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
});
