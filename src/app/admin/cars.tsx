import { type Href, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAdminCars, useAdminGuard } from '@/hooks/use-admin';
import {
  type AdminCar,
  AdminBookingError,
  countUpcomingConfirmed,
  updateAdminCar,
} from '@/services/admin-booking-service';
import { formatPricePerDay, formatVnd } from '@/utils/format-price';
import { goBackOr } from '@/utils/navigation';

const GOLD = '#D4AF37';
const MAX_PRICE = 1_000_000_000;

// Typed routes đôi khi chỉ sinh '/admin/index'; URL thật của danh sách đơn là '/admin'.
const ADMIN_HOME = '/admin' as Href;

const toMessage = (error: unknown) =>
  error instanceof AdminBookingError ? error.userMessage : 'Thao tác chưa thành công. Vui lòng thử lại.';

export default function AdminCarsScreen() {
  const router = useRouter();
  const ready = useAdminGuard();
  const { cars, error, loading, reload } = useAdminCars(ready);

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={GOLD} />}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => goBackOr(router, ADMIN_HOME)}>
          <Text style={styles.backText}>← Danh sách đơn</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
        <Text style={styles.title}>XE & GIÁ</Text>
        <Text style={styles.subtitle}>
          Giá mới chỉ áp dụng cho đơn tạo sau khi lưu; đơn đã có giữ nguyên giá lúc đặt.
        </Text>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {loading && !error && <ActivityIndicator color={GOLD} style={styles.loader} />}

        {cars.map((car) => (
          <CarEditor key={car.id} car={car} onSaved={reload} />
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CarEditor({ car, onSaved }: { car: AdminCar; onSaved: () => void }) {
  const [priceText, setPriceText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // Xác nhận bật/tắt: undefined = chưa hỏi; number = số đơn confirmed sắp tới.
  const [confirmToggle, setConfirmToggle] = useState<number | undefined>();
  const busyRef = useRef(false);

  const digits = priceText.replace(/\D/g, '');
  const newPrice = digits ? Number(digits) : undefined;
  const priceError =
    priceText.trim() === ''
      ? ''
      : newPrice === undefined || newPrice < 1 || newPrice > MAX_PRICE
        ? 'Giá/ngày phải từ 1đ đến 1.000.000.000đ (chỉ nhập số).'
        : newPrice === car.pricePerDay
          ? 'Giá mới đang bằng giá hiện tại.'
          : '';

  const run = async (price: number, active: boolean, success: string) => {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError('');
    setMessage('');

    try {
      await updateAdminCar(car.id, price, active);
      setMessage(success);
      setPriceText('');
      setConfirmToggle(undefined);
      onSaved();
    } catch (saveError) {
      setError(toMessage(saveError));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const savePrice = () => {
    if (!newPrice || priceError) {
      setError(priceError || 'Vui lòng nhập giá mới.');
      return;
    }

    run(newPrice, car.isActive, `Đã lưu giá mới ${formatPricePerDay(newPrice)}.`);
  };

  // Bấm lần 1: hỏi xác nhận (khi tắt thì đếm đơn confirmed sắp tới).
  const askToggle = async () => {
    setError('');
    setMessage('');

    if (!car.isActive) {
      setConfirmToggle(0);
      return;
    }

    try {
      setBusy(true);
      setConfirmToggle(await countUpcomingConfirmed(car.id));
    } catch (countError) {
      setError(toMessage(countError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, !car.isActive && styles.cardInactive]}>
      <View style={styles.cardTop}>
        <Text style={styles.carName}>{car.name}</Text>
        <Text style={[styles.badge, car.isActive ? styles.badgeOn : styles.badgeOff]}>
          {car.isActive ? 'ĐANG CHO THUÊ' : 'ĐANG TẮT'}
        </Text>
      </View>

      <Text style={styles.price}>{formatPricePerDay(car.pricePerDay)}</Text>

      <Text style={styles.label}>Giá/ngày mới (VNĐ)</Text>
      <TextInput
        value={priceText}
        onChangeText={setPriceText}
        placeholder={String(car.pricePerDay)}
        placeholderTextColor="#666666"
        keyboardType="number-pad"
        style={styles.input}
      />
      {!!newPrice && !priceError && (
        <Text style={styles.preview}>Sẽ lưu: {formatVnd(newPrice)}/ngày</Text>
      )}
      {!!priceError && <Text style={styles.fieldError}>{priceError}</Text>}

      <TouchableOpacity
        style={[styles.goldButton, (busy || !newPrice || !!priceError) && styles.disabled]}
        onPress={savePrice}
        disabled={busy || !newPrice || !!priceError}
      >
        <Text style={styles.goldButtonText}>LƯU GIÁ</Text>
      </TouchableOpacity>

      {confirmToggle === undefined ? (
        <TouchableOpacity
          style={[styles.outlineButton, busy && styles.disabled]}
          onPress={askToggle}
          disabled={busy}
        >
          <Text style={styles.outlineButtonText}>
            {car.isActive ? 'TẠM NGỪNG CHO THUÊ' : 'MỞ LẠI CHO THUÊ'}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.confirmBox}>
          <Text style={styles.confirmText}>
            {car.isActive
              ? confirmToggle > 0
                ? `⚠ Xe còn ${confirmToggle} đơn ĐÃ XÁC NHẬN sắp tới. Tắt xe chỉ chặn đơn mới; các đơn đó vẫn giữ nguyên. Xác nhận tạm ngừng cho thuê?`
                : 'Xác nhận tạm ngừng cho thuê xe này? Khách sẽ không thấy và không đặt được xe.'
              : 'Xác nhận mở lại cho thuê xe này?'}
          </Text>
          <View style={styles.confirmRow}>
            <TouchableOpacity
              style={[styles.confirmYes, busy && styles.disabled]}
              disabled={busy}
              onPress={() =>
                run(
                  car.pricePerDay,
                  !car.isActive,
                  car.isActive ? 'Đã tạm ngừng cho thuê.' : 'Đã mở lại cho thuê.'
                )
              }
            >
              <Text style={styles.confirmYesText}>XÁC NHẬN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmNo}
              disabled={busy}
              onPress={() => setConfirmToggle(undefined)}
            >
              <Text style={styles.confirmNoText}>HUỶ</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!!message && <Text style={styles.success}>{message}</Text>}
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  center: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 65, paddingBottom: 100 },
  loader: { marginTop: 20 },
  backButton: { alignSelf: 'flex-start', marginBottom: 18 },
  backText: { color: GOLD, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#888888', fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 14 },
  errorBox: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  errorText: { color: '#FFB4AE', fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: '#151515',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#303030',
    padding: 16,
    marginBottom: 14,
  },
  cardInactive: { borderStyle: 'dashed', opacity: 0.9 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  carName: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', flexShrink: 1 },
  badge: { fontSize: 11, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  badgeOn: { color: '#5CC98A', backgroundColor: 'rgba(92, 201, 138, 0.12)' },
  badgeOff: { color: '#FF8A80', backgroundColor: 'rgba(255, 138, 128, 0.12)' },
  price: { color: GOLD, fontSize: 20, fontWeight: '900', marginTop: 6 },
  label: { color: '#BBBBBB', fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: {
    minHeight: 48,
    backgroundColor: '#0E0E0E',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 16,
  },
  preview: { color: '#5CC98A', fontSize: 13, marginTop: 6 },
  fieldError: { color: '#FF7B72', fontSize: 13, lineHeight: 19, marginTop: 6 },
  success: { color: '#5CC98A', fontSize: 14, fontWeight: '700', marginTop: 10 },
  goldButton: { backgroundColor: GOLD, paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginTop: 12 },
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
  disabled: { opacity: 0.5 },
  confirmBox: {
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
  },
  confirmText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  confirmYes: { flex: 1, backgroundColor: GOLD, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  confirmYesText: { color: '#080808', fontWeight: '900' },
  confirmNo: { flex: 1, borderWidth: 1.5, borderColor: '#777777', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  confirmNoText: { color: '#CCCCCC', fontWeight: '900' },
});
