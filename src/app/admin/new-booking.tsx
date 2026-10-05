import { type Href, useRouter } from 'expo-router';
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

import { AdminBookingForm, type AdminBookingFormValues } from '@/components/admin-booking-form';
import { BookingStatusBadge } from '@/components/booking-status-badge';
import { useAdminCars, useAdminGuard } from '@/hooks/use-admin';
import { AdminBookingError, createAdminBooking } from '@/services/admin-booking-service';
import type { BookingRequest } from '@/types/booking';
import { formatDateTime } from '@/utils/format-date';
import { goBackOr } from '@/utils/navigation';

const GOLD = '#D4AF37';
const ADMIN_HOME = '/admin' as Href;

const toMessage = (error: unknown) =>
  error instanceof AdminBookingError ? error.userMessage : 'Chưa tạo được đơn. Vui lòng thử lại.';

export default function AdminNewBookingScreen() {
  const router = useRouter();
  const ready = useAdminGuard();
  const { cars, error: carsError } = useAdminCars(ready);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<BookingRequest | undefined>();
  const busyRef = useRef(false);

  const submit = async (values: AdminBookingFormValues) => {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError('');

    try {
      setCreated(await createAdminBooking(values));
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

        {!!carsError && <Text style={styles.errorText}>{carsError}</Text>}

        <AdminBookingForm
          cars={cars}
          busy={busy}
          submitLabel={(confirm) => (confirm ? 'TẠO VÀ XÁC NHẬN' : 'TẠO ĐƠN CHỜ XÁC NHẬN')}
          onSubmit={submit}
        />

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
