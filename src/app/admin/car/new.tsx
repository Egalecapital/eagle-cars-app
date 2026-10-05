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

import { FleetCarForm } from '@/components/fleet-car-form';
import { MaxContentWidth } from '@/constants/theme';
import { useAdminGuard } from '@/hooks/use-admin';
import { AdminBookingError } from '@/services/admin-booking-service';
import { createFleetCar, type FleetCarInput } from '@/services/fleet-admin-service';
import { goBackOr } from '@/utils/navigation';

const GOLD = '#D4AF37';
const ADMIN_CARS = '/admin/cars' as Href;

/** Thêm xe: tạo ở trạng thái CHƯA cho thuê → sang màn sửa để thêm ảnh rồi mở cho thuê. */
export default function AdminNewCarScreen() {
  const router = useRouter();
  const ready = useAdminGuard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  const submit = async (input: FleetCarInput, carId: string) => {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError('');

    try {
      const car = await createFleetCar(carId, input);
      router.replace({ pathname: '/admin/car/[carId]', params: { carId: car.id, created: '1' } });
    } catch (createError) {
      setError(
        createError instanceof AdminBookingError
          ? createError.userMessage
          : 'Chưa thêm được xe. Vui lòng thử lại.'
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backButton} onPress={() => goBackOr(router, ADMIN_CARS)}>
          <Text style={styles.backText}>← Xe & giá</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
        <Text style={styles.title}>THÊM XE</Text>
        <Text style={styles.subtitle}>
          Xe mới được tạo ở trạng thái CHƯA cho thuê. Sau khi lưu, thêm ảnh và kiểm tra rồi bấm “Mở cho thuê”.
        </Text>

        <FleetCarForm busy={busy} submitLabel="TẠO XE" onSubmit={submit} />

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
  eyebrow: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#888888', fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 6 },
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
