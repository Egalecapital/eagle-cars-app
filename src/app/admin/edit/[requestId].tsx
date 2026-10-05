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

import { AdminBookingForm, type AdminBookingFormValues } from '@/components/admin-booking-form';
import { BookingStatusBadge } from '@/components/booking-status-badge';
import { useAdminBookingRequest, useAdminCars, useAdminGuard } from '@/hooks/use-admin';
import { AdminBookingError, updateAdminBooking } from '@/services/admin-booking-service';
import { goBackOr } from '@/utils/navigation';

const GOLD = '#D4AF37';
const ADMIN_HOME = '/admin' as Href;

export default function AdminEditBookingScreen() {
  const router = useRouter();
  const ready = useAdminGuard();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;

  const { request, loading, error: loadError, reload } = useAdminBookingRequest(requestId, ready);
  const { cars, error: carsError } = useAdminCars(ready);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  // Đổi key sau khi tải lại đơn → form khởi tạo lại từ dữ liệu mới.
  const [formKey, setFormKey] = useState(0);
  const busyRef = useRef(false);

  const goToDetail = () => {
    if (router.canGoBack()) {
      router.back();
    } else if (requestId) {
      router.replace({ pathname: '/admin/request/[requestId]', params: { requestId } });
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
        <Text style={styles.notFound}>{loadError ?? 'Không tìm thấy đơn này.'}</Text>
        <TouchableOpacity style={styles.outlineButton} onPress={() => goBackOr(router, ADMIN_HOME)}>
          <Text style={styles.outlineButtonText}>QUAY LẠI</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const editable = request.status === 'pending' || request.status === 'confirmed';

  const save = async (values: AdminBookingFormValues) => {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError('');
    setStale(false);

    try {
      await updateAdminBooking(request, values);
      goToDetail();
    } catch (saveError) {
      setError(
        saveError instanceof AdminBookingError
          ? saveError.userMessage
          : 'Chưa lưu được. Vui lòng thử lại.'
      );
      setStale(saveError instanceof AdminBookingError && saveError.code === 'STALE_BOOKING');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const reloadLatest = () => {
    setError('');
    setStale(false);
    reload();
    setFormKey((value) => value + 1);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={goToDetail}>
          <Text style={styles.backText}>← Chi tiết đơn</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>SỬA ĐƠN</Text>
        <View style={styles.headerRow}>
          <Text style={styles.code}>{request.bookingCode}</Text>
          <BookingStatusBadge status={request.status} />
        </View>
        <Text style={styles.subtitle}>
          Trạng thái không đổi khi sửa. Đổi xe → giá/ngày theo xe mới; chỉ đổi giờ → giữ giá/ngày lúc
          đặt. {request.source === 'app' ? 'Khách sẽ nhận thông báo khi xe, giờ, hình thức, địa điểm hoặc giá chốt thay đổi.' : ''}
        </Text>

        {!!carsError && <Text style={styles.errorText}>{carsError}</Text>}

        {editable ? (
          <AdminBookingForm
            key={`${request.id}-${request.updatedAt}-${formKey}`}
            cars={cars}
            booking={request}
            busy={busy}
            submitLabel={() => 'LƯU THAY ĐỔI'}
            onSubmit={save}
          />
        ) : (
          <Text style={styles.notice}>Đơn ở trạng thái cuối, không sửa được.</Text>
        )}

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            {stale && (
              <TouchableOpacity onPress={reloadLatest}>
                <Text style={styles.retryText}>Tải lại đơn mới nhất</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  center: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center', padding: 30 },
  content: { padding: 20, paddingTop: 65, paddingBottom: 100 },
  notFound: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 20 },
  back: { alignSelf: 'flex-start', marginBottom: 18 },
  backText: { color: GOLD, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  code: { color: '#FFFFFF', fontSize: 24, fontWeight: '900' },
  subtitle: { color: '#888888', fontSize: 13, lineHeight: 19, marginTop: 8 },
  notice: { color: '#CCCCCC', fontSize: 15, marginTop: 20 },
  errorBox: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  errorText: { color: '#FFB4AE', fontSize: 14, lineHeight: 20 },
  retryText: { color: GOLD, fontWeight: '900', marginTop: 8 },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: GOLD,
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 14,
  },
  outlineButtonText: { color: GOLD, fontWeight: '900' },
});
