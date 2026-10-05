import { type Href, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { BookingStatusBadge } from '@/components/booking-status-badge';
import { useAdminCars, useAdminCarSchedule, useAdminGuard } from '@/hooks/use-admin';
import {
  type AdminBookingInput,
  AdminBookingError,
  createAdminBooking,
} from '@/services/admin-booking-service';
import type { BookingRequest } from '@/types/booking';
import { formatDateTime } from '@/utils/format-date';
import { formatVnd } from '@/utils/format-price';
import { goBackOr } from '@/utils/navigation';
import { vnDateKey, vnWallTimeToDate } from '@/utils/vn-time';

const GOLD = '#D4AF37';
const ADMIN_HOME = '/admin' as Href;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const SERVICES: { value: AdminBookingInput['serviceType']; label: string }[] = [
  { value: 'self_drive', label: 'Tự lái' },
  { value: 'with_driver', label: 'Có lái' },
  { value: 'wedding', label: 'Xe cưới' },
];

/** 'DD/MM/YYYY' + 'HH:MM' (giờ VN) → Date; sai định dạng / ngày không tồn tại → undefined. */
function parseVnDateTime(dateText: string, timeText: string): Date | undefined {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateText.trim());
  const t = /^(\d{1,2})[:h.](\d{2})$/.exec(timeText.trim());

  if (!d || !t || Number(t[1]) > 23 || Number(t[2]) > 59) return undefined;

  const key = `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`;
  const time = `${t[1].padStart(2, '0')}:${t[2]}`;
  const date = vnWallTimeToDate(key, time);

  // Loại ngày không tồn tại (vd 31/02) — Date sẽ tự "tràn" sang tháng sau.
  return date && vnDateKey(date) === key ? date : undefined;
}

function todayText(): string {
  const [year, month, day] = vnDateKey(new Date()).split('-');

  return `${day}/${month}/${year}`;
}

const toMessage = (error: unknown) =>
  error instanceof AdminBookingError ? error.userMessage : 'Chưa tạo được đơn. Vui lòng thử lại.';

export default function AdminNewBookingScreen() {
  const router = useRouter();
  const ready = useAdminGuard();
  const { cars, error: carsError } = useAdminCars(ready);

  const [carId, setCarId] = useState<string | undefined>();
  const [service, setService] = useState<AdminBookingInput['serviceType']>('self_drive');
  const [pickupDate, setPickupDate] = useState(todayText);
  const [pickupTime, setPickupTime] = useState('');
  const [returnDate, setReturnDate] = useState(todayText);
  const [returnTime, setReturnTime] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [returnLocation, setReturnLocation] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [finalTotalText, setFinalTotalText] = useState('');
  const [confirm, setConfirm] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<BookingRequest | undefined>();
  const busyRef = useRef(false);

  const pickupAt = parseVnDateTime(pickupDate, pickupTime);
  const returnAt = parseVnDateTime(returnDate, returnTime);
  const rangeValid = !!pickupAt && !!returnAt && returnAt > pickupAt;
  const days = rangeValid ? Math.max(1, Math.ceil((returnAt.getTime() - pickupAt.getTime()) / MS_PER_DAY)) : 0;
  const car = cars.find((item) => item.id === carId);
  const finalDigits = finalTotalText.replace(/\D/g, '');
  const finalTotal = finalDigits ? Number(finalDigits) : null;

  // Đơn khác của xe trong khoảng này (đã xác nhận = chắc chắn trùng; chờ = cần xem lại).
  const schedule = useAdminCarSchedule(
    carId,
    pickupAt ?? new Date(0),
    returnAt ?? new Date(0),
    ready && !!carId && rangeValid
  );
  const overlaps = rangeValid && carId ? schedule.requests : [];
  const confirmedOverlap = overlaps.some((item) => item.status === 'confirmed');

  const problems = [
    !carId && 'Chọn xe.',
    (!pickupAt || !returnAt) && 'Nhập ngày (DD/MM/YYYY) và giờ (HH:MM) nhận / trả hợp lệ.',
    pickupAt && returnAt && returnAt <= pickupAt && 'Giờ trả phải sau giờ nhận.',
    days > 30 && 'Mỗi đơn tối đa 30 ngày.',
    pickupLocation.trim().length < 3 && 'Nơi nhận xe cần ít nhất 3 ký tự.',
    returnLocation.trim() !== '' && returnLocation.trim().length < 3 && 'Nơi trả xe cần ít nhất 3 ký tự.',
    name.trim().length < 2 && 'Họ tên khách cần ít nhất 2 ký tự.',
    (phone.replace(/\D/g, '').length < 9 || phone.replace(/\D/g, '').length > 11) &&
      'Số điện thoại cần 9–11 chữ số.',
  ].filter(Boolean) as string[];

  const submit = async () => {
    if (busyRef.current || problems.length > 0 || !carId || !pickupAt || !returnAt) return;

    busyRef.current = true;
    setBusy(true);
    setError('');

    try {
      setCreated(
        await createAdminBooking({
          carId,
          serviceType: service,
          pickupAt: pickupAt.toISOString(),
          returnAt: returnAt.toISOString(),
          pickupLocation,
          returnLocation,
          customerName: name,
          customerPhone: phone,
          note,
          finalTotal,
          confirm,
        })
      );
    } catch (createError) {
      setError(toMessage(createError));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  if (created) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
          <Text style={styles.title}>ĐÃ TẠO ĐƠN</Text>
          <View style={styles.successBox}>
            <Text style={styles.successCode}>{created.bookingCode}</Text>
            <Text style={styles.successText}>
              {created.carName} · {formatDateTime(created.pickupAt)} → {formatDateTime(created.returnAt)}
            </Text>
            <View style={styles.successBadge}>
              <BookingStatusBadge status={created.status} />
            </View>
          </View>
          <TouchableOpacity
            style={styles.goldButton}
            onPress={() =>
              router.replace({ pathname: '/admin/request/[requestId]', params: { requestId: created.id } })
            }
          >
            <Text style={styles.goldButtonText}>MỞ ĐƠN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineButton} onPress={() => goBackOr(router, ADMIN_HOME)}>
            <Text style={styles.outlineButtonText}>VỀ DANH SÁCH ĐƠN</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => goBackOr(router, ADMIN_HOME)}>
          <Text style={styles.backText}>← Danh sách đơn</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
        <Text style={styles.title}>TẠO ĐƠN</Text>
        <Text style={styles.subtitle}>
          Nhập đơn khách gọi điện hoặc đến trực tiếp để giữ lịch xe — tránh khách khác đặt trùng trên
          app. Nhóm Telegram nhận tin như đơn mới.
        </Text>

        <Text style={styles.label}>Xe</Text>
        {!!carsError && <Text style={styles.fieldError}>{carsError}</Text>}
        <View style={styles.chips}>
          {cars.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.chip, carId === item.id && styles.chipActive]}
              onPress={() => setCarId(item.id)}
            >
              <Text style={[styles.chipText, carId === item.id && styles.chipTextActive]}>
                {item.name}
                {item.isActive ? '' : ' (đang tắt)'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Hình thức</Text>
        <View style={styles.chips}>
          {SERVICES.map((item) => (
            <TouchableOpacity
              key={item.value}
              style={[styles.chip, service === item.value && styles.chipActive]}
              onPress={() => setService(item.value)}
            >
              <Text style={[styles.chipText, service === item.value && styles.chipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Nhận xe (giờ Việt Nam)</Text>
        <View style={styles.row}>
          <Field value={pickupDate} onChange={setPickupDate} placeholder="DD/MM/YYYY" flex={3} />
          <Field value={pickupTime} onChange={setPickupTime} placeholder="HH:MM" flex={2} />
        </View>
        <Text style={styles.label}>Trả xe (giờ Việt Nam)</Text>
        <View style={styles.row}>
          <Field value={returnDate} onChange={setReturnDate} placeholder="DD/MM/YYYY" flex={3} />
          <Field value={returnTime} onChange={setReturnTime} placeholder="HH:MM" flex={2} />
        </View>
        {rangeValid && (
          <Text style={styles.preview}>
            {formatDateTime(pickupAt.toISOString())} → {formatDateTime(returnAt.toISOString())} · {days} ngày
            {car ? ` · dự kiến ${formatVnd(car.pricePerDay * days)}` : ''}
          </Text>
        )}

        {overlaps.length > 0 && (
          <View style={[styles.overlapBox, confirmedOverlap && styles.overlapBoxDanger]}>
            <Text style={styles.overlapTitle}>
              {confirmedOverlap
                ? '⚠ Trùng đơn ĐÃ XÁC NHẬN — không xác nhận ngay được:'
                : 'Có đơn đang chờ cùng xe trong khoảng này:'}
            </Text>
            {overlaps.map((item) => (
              <Text key={item.id} style={styles.overlapItem}>
                {item.bookingCode} · {item.customer.fullName} · {formatDateTime(item.pickupAt)} →{' '}
                {formatDateTime(item.returnAt)} ({item.status === 'confirmed' ? 'đã xác nhận' : 'chờ'})
              </Text>
            ))}
          </View>
        )}

        <Text style={styles.label}>Nơi nhận xe</Text>
        <Field value={pickupLocation} onChange={setPickupLocation} placeholder="VD: 123 Nguyễn Huệ, Q1" max={300} />
        <Text style={styles.label}>Nơi trả xe (bỏ trống = giống nơi nhận)</Text>
        <Field value={returnLocation} onChange={setReturnLocation} placeholder="" max={300} />
        <Text style={styles.label}>Họ tên khách</Text>
        <Field value={name} onChange={setName} placeholder="Nguyễn Văn A" max={100} />
        <Text style={styles.label}>Số điện thoại</Text>
        <Field value={phone} onChange={setPhone} placeholder="0912 345 678" max={20} phone />
        <Text style={styles.label}>Ghi chú (tuỳ chọn)</Text>
        <Field value={note} onChange={setNote} placeholder="VD: đặt cọc 2 triệu, giao xe tại sảnh" max={1000} multiline />
        <Text style={styles.label}>Giá chốt (VNĐ, tuỳ chọn — bỏ trống = giá dự kiến)</Text>
        <Field value={finalTotalText} onChange={setFinalTotalText} placeholder="" max={15} numeric />
        {finalTotal !== null && <Text style={styles.preview}>Giá chốt: {formatVnd(finalTotal)}</Text>}

        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchTitle}>Xác nhận ngay (giữ lịch xe)</Text>
            <Text style={styles.switchHint}>Tắt nếu cần gọi lại khách trước khi chốt.</Text>
          </View>
          <Switch value={confirm} onValueChange={setConfirm} trackColor={{ true: GOLD }} />
        </View>

        {problems.length > 0 && <Text style={styles.problems}>{problems.join(' ')}</Text>}
        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.goldButton, (busy || problems.length > 0 || (confirm && confirmedOverlap)) && styles.disabled]}
          disabled={busy || problems.length > 0 || (confirm && confirmedOverlap)}
          onPress={submit}
        >
          <Text style={styles.goldButtonText}>
            {busy ? 'ĐANG TẠO...' : confirm ? 'TẠO VÀ XÁC NHẬN' : 'TẠO ĐƠN CHỜ XÁC NHẬN'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  flex,
  max,
  phone,
  numeric,
  multiline,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  flex?: number;
  max?: number;
  phone?: boolean;
  numeric?: boolean;
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor="#666666"
      maxLength={max}
      keyboardType={phone ? 'phone-pad' : numeric ? 'number-pad' : 'default'}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      style={[styles.input, flex ? { flex } : null, multiline && styles.multiline]}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  center: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 65, paddingBottom: 100 },
  back: { alignSelf: 'flex-start', marginBottom: 18 },
  backText: { color: GOLD, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#888888', fontSize: 13, lineHeight: 19, marginTop: 6 },
  label: { color: '#BBBBBB', fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#333333',
  },
  chipActive: { backgroundColor: GOLD, borderColor: GOLD },
  chipText: { color: '#AAAAAA', fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: '#080808' },
  row: { flexDirection: 'row', gap: 10 },
  input: {
    minHeight: 48,
    backgroundColor: '#0E0E0E',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 15,
  },
  multiline: { minHeight: 80, paddingTop: 12 },
  preview: { color: '#5CC98A', fontSize: 13, marginTop: 8 },
  overlapBox: {
    borderWidth: 1,
    borderColor: GOLD,
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  overlapBoxDanger: { borderColor: '#E5534B', backgroundColor: '#2A1414' },
  overlapTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 14, marginBottom: 6 },
  overlapItem: { color: '#CCCCCC', fontSize: 13, lineHeight: 19 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  switchText: { flex: 1 },
  switchTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  switchHint: { color: '#888888', fontSize: 12, marginTop: 2 },
  problems: { color: '#FF8A80', fontSize: 13, lineHeight: 19, marginTop: 14 },
  fieldError: { color: '#FF7B72', fontSize: 13, marginBottom: 6 },
  errorBox: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  errorText: { color: '#FFB4AE', fontSize: 14, lineHeight: 20 },
  goldButton: { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  goldButtonText: { color: '#080808', fontWeight: '900', fontSize: 15 },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  outlineButtonText: { color: GOLD, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  successBox: {
    backgroundColor: 'rgba(92, 201, 138, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(92, 201, 138, 0.5)',
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
  },
  successCode: { color: GOLD, fontSize: 20, fontWeight: '900' },
  successText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, marginTop: 6 },
  successBadge: { marginTop: 10 },
});
