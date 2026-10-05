import { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useAdminCarSchedule } from '@/hooks/use-admin';
import type { AdminBookingInput, AdminCar } from '@/services/admin-booking-service';
import type { BookingRequest } from '@/types/booking';
import { formatDateTime } from '@/utils/format-date';
import { formatVnd } from '@/utils/format-price';
import { toVnParts, vnDateKey, vnWallTimeToDate } from '@/utils/vn-time';

const GOLD = '#D4AF37';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ServiceValue = AdminBookingInput['serviceType'];

const SERVICES: { value: ServiceValue; label: BookingRequest['serviceType'] }[] = [
  { value: 'self_drive', label: 'Tự lái' },
  { value: 'with_driver', label: 'Có lái' },
  { value: 'wedding', label: 'Xe cưới' },
];

/** Giá trị form đã kiểm tra, gửi lên RPC (thời gian dạng ISO). */
export type AdminBookingFormValues = Omit<AdminBookingInput, 'confirm'> & { confirm: boolean };

/** 'DD/MM/YYYY' + 'HH:MM' (giờ VN) → Date; sai định dạng / ngày không tồn tại → undefined. */
function parseVnDateTime(dateText: string, timeText: string): Date | undefined {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateText.trim());
  const t = /^(\d{1,2})[:h.](\d{2})$/.exec(timeText.trim());

  if (!d || !t || Number(t[1]) > 23 || Number(t[2]) > 59) return undefined;

  const key = `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`;
  const date = vnWallTimeToDate(key, `${t[1].padStart(2, '0')}:${t[2]}`);

  // Loại ngày không tồn tại (vd 31/02) — Date sẽ tự "tràn" sang tháng sau.
  return date && vnDateKey(date) === key ? date : undefined;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** ISO → { date: 'DD/MM/YYYY', time: 'HH:MM' } theo giờ VN. */
function toVnInputs(iso: string): { date: string; time: string } {
  const p = toVnParts(new Date(iso));

  return { date: `${pad(p.day)}/${pad(p.month)}/${p.year}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

function todayText(): string {
  return toVnInputs(new Date().toISOString()).date;
}

type AdminBookingFormProps = {
  cars: AdminCar[];
  /** Có giá trị = sửa đơn này (không có công tắc "xác nhận ngay"). */
  booking?: BookingRequest;
  busy: boolean;
  submitLabel: (confirm: boolean) => string;
  onSubmit: (values: AdminBookingFormValues) => void;
};

/** Form nhập / sửa đơn của admin; xem trước đơn trùng giờ của cùng xe. */
export function AdminBookingForm({ cars, booking, busy, submitLabel, onSubmit }: AdminBookingFormProps) {
  const pickupInit = booking ? toVnInputs(booking.pickupAt) : { date: todayText(), time: '' };
  const returnInit = booking ? toVnInputs(booking.returnAt) : { date: todayText(), time: '' };

  const [carId, setCarId] = useState<string | undefined>(booking?.carId);
  const [service, setService] = useState<ServiceValue>(
    SERVICES.find((item) => item.label === booking?.serviceType)?.value ?? 'self_drive'
  );
  const [pickupDate, setPickupDate] = useState(pickupInit.date);
  const [pickupTime, setPickupTime] = useState(pickupInit.time);
  const [returnDate, setReturnDate] = useState(returnInit.date);
  const [returnTime, setReturnTime] = useState(returnInit.time);
  const [pickupLocation, setPickupLocation] = useState(booking?.pickupLocation ?? '');
  const [returnLocation, setReturnLocation] = useState(
    booking && booking.returnLocation !== booking.pickupLocation ? booking.returnLocation : ''
  );
  const [name, setName] = useState(booking?.customer.fullName ?? '');
  const [phone, setPhone] = useState(booking?.customer.phone ?? '');
  const [note, setNote] = useState(booking?.note ?? '');
  const [finalTotalText, setFinalTotalText] = useState(
    booking?.finalTotal != null ? String(booking.finalTotal) : ''
  );
  const [confirm, setConfirm] = useState(true);
  // Mốc "bây giờ" lấy một lần khi mở form (server vẫn kiểm tra lại khi lưu).
  const [openedAt] = useState(() => Date.now());

  const pickupAt = parseVnDateTime(pickupDate, pickupTime);
  const returnAt = parseVnDateTime(returnDate, returnTime);
  const rangeValid = !!pickupAt && !!returnAt && returnAt > pickupAt;
  const days = rangeValid
    ? Math.max(1, Math.ceil((returnAt.getTime() - pickupAt.getTime()) / MS_PER_DAY))
    : 0;
  // Xe lưu trữ không nhận đơn mới; khi sửa đơn vẫn hiện xe hiện tại của đơn.
  const selectableCars = cars.filter((item) => !item.archivedAt || item.id === booking?.carId);
  const car = cars.find((item) => item.id === carId);
  const serviceOffered = !car || car.serviceTypes.includes(service);
  // Sửa đơn, giữ nguyên xe + hình thức → server không kiểm tra lại hình thức (đơn cũ vẫn sửa được).
  const keepsBookingService =
    !!booking && carId === booking.carId && SERVICES.find((item) => item.value === service)?.label === booking.serviceType;
  // Giữ xe → giữ giá/ngày đã chốt lúc đặt; đổi xe → giá xe mới (giống server).
  const pricePerDay = booking && carId === booking.carId ? booking.pricePerDay : car?.pricePerDay;
  const finalDigits = finalTotalText.replace(/\D/g, '');
  const finalTotal = finalDigits ? Number(finalDigits) : null;
  const phoneDigits = phone.replace(/\D/g, '').length;
  const holdsCalendar = booking ? booking.status === 'confirmed' : confirm;
  const pickupChanged = !booking || !pickupAt || pickupAt.toISOString() !== new Date(booking.pickupAt).toISOString();

  // Đơn khác của xe trong khoảng này (đã xác nhận = chắc chắn trùng; chờ = cần xem lại).
  const schedule = useAdminCarSchedule(
    carId,
    pickupAt ?? new Date(0),
    returnAt ?? new Date(0),
    !!carId && rangeValid
  );
  const overlaps =
    rangeValid && carId ? schedule.requests.filter((item) => item.id !== booking?.id) : [];
  const confirmedOverlap = overlaps.some((item) => item.status === 'confirmed');

  const problems = [
    !carId && 'Chọn xe.',
    car?.archivedAt && carId !== booking?.carId && 'Xe đã lưu trữ, không nhận đơn mới.',
    !serviceOffered && !keepsBookingService && 'Xe này không có hình thức thuê đã chọn.',
    (!pickupAt || !returnAt) && 'Nhập ngày (DD/MM/YYYY) và giờ (HH:MM) nhận / trả hợp lệ.',
    pickupAt && returnAt && returnAt <= pickupAt && 'Giờ trả phải sau giờ nhận.',
    days > 30 && 'Mỗi đơn tối đa 30 ngày.',
    pickupAt &&
      pickupChanged &&
      !holdsCalendar &&
      pickupAt.getTime() <= openedAt &&
      'Đơn chờ xác nhận cần giờ nhận ở tương lai.',
    pickupLocation.trim().length < 3 && 'Nơi nhận xe cần ít nhất 3 ký tự.',
    returnLocation.trim() !== '' && returnLocation.trim().length < 3 && 'Nơi trả xe cần ít nhất 3 ký tự.',
    name.trim().length < 2 && 'Họ tên khách cần ít nhất 2 ký tự.',
    (phoneDigits < 9 || phoneDigits > 11) && 'Số điện thoại cần 9–11 chữ số.',
    holdsCalendar && confirmedOverlap && 'Trùng giờ với đơn ĐÃ XÁC NHẬN của cùng xe.',
  ].filter(Boolean) as string[];

  const submit = () => {
    if (busy || problems.length > 0 || !carId || !pickupAt || !returnAt) return;

    onSubmit({
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
    });
  };

  return (
    <View>
      <Text style={styles.label}>Xe</Text>
      <View style={styles.chips}>
        {selectableCars.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.chip, carId === item.id && styles.chipActive]}
            onPress={() => setCarId(item.id)}
          >
            <Text style={[styles.chipText, carId === item.id && styles.chipTextActive]}>
              {item.name}
              {item.archivedAt ? ' (lưu trữ)' : item.isActive ? '' : ' (đang tắt)'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Hình thức</Text>
      <View style={styles.chips}>
        {SERVICES.map((item) => (
          <TouchableOpacity
            key={item.value}
            style={[
              styles.chip,
              service === item.value && styles.chipActive,
              !!car && !car.serviceTypes.includes(item.value) && styles.chipUnavailable,
            ]}
            onPress={() => setService(item.value)}
          >
            <Text style={[styles.chipText, service === item.value && styles.chipTextActive]}>
              {item.label}
              {car && !car.serviceTypes.includes(item.value) ? ' (xe không có)' : ''}
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
          {pricePerDay ? ` · dự kiến ${formatVnd(pricePerDay * days)}` : ''}
        </Text>
      )}

      {overlaps.length > 0 && (
        <View style={[styles.overlapBox, confirmedOverlap && styles.overlapBoxDanger]}>
          <Text style={styles.overlapTitle}>
            {confirmedOverlap
              ? '⚠ Trùng đơn ĐÃ XÁC NHẬN của cùng xe:'
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
      <Field
        value={note}
        onChange={setNote}
        placeholder="VD: đặt cọc 2 triệu, giao xe tại sảnh"
        max={1000}
        multiline
      />
      <Text style={styles.label}>
        Giá chốt (VNĐ, tuỳ chọn —{' '}
        {booking ? 'bỏ trống = giữ giá chốt hiện tại' : 'bỏ trống = giá dự kiến'})
      </Text>
      <Field value={finalTotalText} onChange={setFinalTotalText} placeholder="" max={15} numeric />
      {finalTotal !== null && <Text style={styles.preview}>Giá chốt: {formatVnd(finalTotal)}</Text>}

      {!booking && (
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchTitle}>Xác nhận ngay (giữ lịch xe)</Text>
            <Text style={styles.switchHint}>Tắt nếu cần gọi lại khách trước khi chốt.</Text>
          </View>
          <Switch value={confirm} onValueChange={setConfirm} trackColor={{ true: GOLD }} />
        </View>
      )}

      {problems.length > 0 && <Text style={styles.problems}>{problems.join(' ')}</Text>}

      <TouchableOpacity
        style={[styles.goldButton, (busy || problems.length > 0) && styles.disabled]}
        disabled={busy || problems.length > 0}
        onPress={submit}
      >
        <Text style={styles.goldButtonText}>{busy ? 'ĐANG LƯU...' : submitLabel(confirm)}</Text>
      </TouchableOpacity>
    </View>
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
  chipUnavailable: { opacity: 0.45 },
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
  goldButton: { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  goldButtonText: { color: '#080808', fontWeight: '900', fontSize: 15 },
  disabled: { opacity: 0.5 },
});
