import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { BookingStatusBadge } from '@/components/booking-status-badge';
import { useAdminBookingRequest, useAdminGuard } from '@/hooks/use-admin';
import {
  AdminBookingError,
  confirmAdminBookingRequest,
  rejectAdminBookingRequest,
} from '@/services/admin-booking-service';
import { formatDateTime } from '@/utils/format-date';
import { formatPricePerDay, formatVnd } from '@/utils/format-price';

const GOLD = '#D4AF37';

// Typed routes đôi khi chỉ sinh '/admin/index'; URL thật của danh sách đơn là '/admin'.
const ADMIN_HOME = '/admin' as Href;

type Action = 'confirm' | 'reject';

export default function AdminRequestDetailScreen() {
  const router = useRouter();
  const ready = useAdminGuard();

  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;

  const { request, loading, error, reload } = useAdminBookingRequest(requestId, ready);

  const [finalTotalText, setFinalTotalText] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<Action | undefined>();
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const busyRef = useRef(false);

  // Trên web, trang chi tiết có thể được mở trực tiếp / tải lại → không có
  // màn trước trong stack; khi đó về thẳng danh sách đơn thay vì GO_BACK.
  const goBackToList = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(ADMIN_HOME);
    }
  };

  if (!ready || (loading && !request)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  if (!request) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>{error ?? 'Không tìm thấy đơn này.'}</Text>
        <TouchableOpacity style={styles.outlineButton} onPress={goBackToList}>
          <Text style={styles.outlineButtonText}>QUAY LẠI</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isPending = request.status === 'pending';

  const runAction = async (action: Action) => {
    if (busyRef.current) return;

    setActionError('');
    setActionMessage('');

    let finalTotal: number | null = null;

    if (action === 'confirm' && finalTotalText.trim()) {
      const digits = finalTotalText.replace(/\D/g, '');

      if (!digits) {
        setActionError('Giá chốt chỉ gồm chữ số (VNĐ).');
        return;
      }

      finalTotal = Number(digits);
    }

    if (action === 'reject' && reason.trim().length < 3) {
      setActionError('Vui lòng nhập lý do từ chối (ít nhất 3 ký tự).');
      return;
    }

    busyRef.current = true;
    setBusy(action);

    try {
      if (action === 'confirm') {
        await confirmAdminBookingRequest(request.id, finalTotal, note);
        setActionMessage('Đã xác nhận đơn.');
      } else {
        await rejectAdminBookingRequest(request.id, reason);
        setActionMessage('Đã từ chối đơn.');
      }

      reload();
    } catch (actionErr) {
      setActionError(
        actionErr instanceof AdminBookingError
          ? actionErr.userMessage
          : 'Thao tác chưa thành công. Vui lòng thử lại.'
      );
    } finally {
      busyRef.current = false;
      setBusy(undefined);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backButton} onPress={goBackToList}>
          <Text style={styles.backText}>← Danh sách đơn</Text>
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <Text style={styles.code}>{request.bookingCode}</Text>
          <BookingStatusBadge status={request.status} />
        </View>
        <Text style={styles.carName}>{request.carName}</Text>

        <Section title="Thông tin thuê">
          <Row label="Hình thức" value={request.serviceType} />
          <Row label="Nhận xe" value={formatDateTime(request.pickupAt)} />
          <Row label="Trả xe" value={formatDateTime(request.returnAt)} />
          <Row label="Nơi nhận" value={request.pickupLocation} />
          <Row label="Nơi trả" value={request.returnLocation} />
          <Row label="Số ngày" value={`${request.rentalDays} ngày`} />
        </Section>

        <Section title="Khách hàng">
          <Row label="Họ và tên" value={request.customer.fullName} />
          <Row label="Số điện thoại" value={request.customer.phone} />
          <Row label="Ghi chú" value={request.note || '—'} />
        </Section>

        <Section title="Giá">
          <Row label="Đơn giá" value={formatPricePerDay(request.pricePerDay)} />
          <Row label="Tổng dự kiến" value={formatVnd(request.estimatedTotal)} />
          <Row
            label="Giá chốt"
            value={request.finalTotal === null ? '—' : formatVnd(request.finalTotal)}
          />
        </Section>

        <Section title="Trạng thái">
          <Row label="Gửi lúc" value={formatDateTime(request.createdAt)} />
          <Row label="Cập nhật" value={formatDateTime(request.updatedAt)} />
          <Row label="Ghi chú / lý do" value={request.statusReason ?? '—'} />
        </Section>

        {!!actionMessage && (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{actionMessage}</Text>
          </View>
        )}

        {!!actionError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{actionError}</Text>
          </View>
        )}

        {isPending && (
          <>
            <Section title="Xác nhận đơn">
              <Text style={styles.inputLabel}>
                Giá chốt (VNĐ) — để trống sẽ dùng tổng dự kiến{' '}
                {formatVnd(request.estimatedTotal)}
              </Text>
              <TextInput
                value={finalTotalText}
                onChangeText={setFinalTotalText}
                placeholder={String(request.estimatedTotal)}
                placeholderTextColor="#666666"
                keyboardType="number-pad"
                style={styles.input}
              />

              <Text style={styles.inputLabel}>Ghi chú cho khách (tuỳ chọn)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="VD: Đã gọi xác nhận, giao xe tại sảnh"
                placeholderTextColor="#666666"
                multiline
                maxLength={500}
                textAlignVertical="top"
                style={[styles.input, styles.multiline]}
              />

              <TouchableOpacity
                style={[styles.goldButton, !!busy && styles.disabled]}
                onPress={() => runAction('confirm')}
                disabled={!!busy}
              >
                <Text style={styles.goldButtonText}>
                  {busy === 'confirm' ? 'ĐANG XÁC NHẬN...' : 'XÁC NHẬN'}
                </Text>
              </TouchableOpacity>
            </Section>

            <Section title="Từ chối đơn">
              <Text style={styles.inputLabel}>Lý do (khách sẽ nhìn thấy)</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="VD: Xe đã có lịch trong khung giờ này"
                placeholderTextColor="#666666"
                multiline
                maxLength={500}
                textAlignVertical="top"
                style={[styles.input, styles.multiline]}
              />

              <TouchableOpacity
                style={[styles.rejectButton, !!busy && styles.disabled]}
                onPress={() => runAction('reject')}
                disabled={!!busy}
              >
                <Text style={styles.rejectButtonText}>
                  {busy === 'reject' ? 'ĐANG TỪ CHỐI...' : 'TỪ CHỐI'}
                </Text>
              </TouchableOpacity>
            </Section>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  center: {
    flex: 1,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  content: { padding: 20, paddingTop: 65, paddingBottom: 100 },
  notFound: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 20 },
  backButton: { alignSelf: 'flex-start', marginBottom: 18 },
  backText: { color: GOLD, fontSize: 16, fontWeight: '800' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { color: GOLD, fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  carName: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 8, marginBottom: 6 },
  section: {
    backgroundColor: '#151515',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#303030',
    padding: 16,
    marginTop: 14,
  },
  sectionTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#232323',
  },
  rowLabel: { color: '#888888', fontSize: 14 },
  rowValue: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700', textAlign: 'right' },
  inputLabel: { color: '#BBBBBB', fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  input: {
    minHeight: 50,
    backgroundColor: '#0E0E0E',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
  },
  multiline: { minHeight: 80 },
  goldButton: {
    backgroundColor: GOLD,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  goldButtonText: { color: '#080808', fontSize: 16, fontWeight: '900' },
  rejectButton: {
    borderWidth: 1.5,
    borderColor: '#E5534B',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  rejectButtonText: { color: '#FF8A80', fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.6 },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: GOLD,
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 14,
  },
  outlineButtonText: { color: GOLD, fontWeight: '900' },
  successBox: {
    backgroundColor: 'rgba(92, 201, 138, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(92, 201, 138, 0.5)',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  successText: { color: '#5CC98A', fontSize: 14, fontWeight: '700' },
  errorBox: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  errorText: { color: '#FFB4AE', fontSize: 14, lineHeight: 20 },
});
