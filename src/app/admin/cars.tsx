import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { CarPhoto } from '@/components/car-photo';
import { MaxContentWidth } from '@/constants/theme';
import { useAdminGuard, useFleetCars } from '@/hooks/use-admin';
import { type FleetCar, fleetServiceLabels } from '@/services/fleet-admin-service';
import { formatPricePerDay } from '@/utils/format-price';
import { goBackOr } from '@/utils/navigation';

const GOLD = '#D4AF37';

// Typed routes đôi khi chỉ sinh '/admin/index'; URL thật của danh sách đơn là '/admin'.
const ADMIN_HOME = '/admin' as Href;

/**
 * XE & GIÁ — danh sách đội xe (0018). Thêm / sửa / ảnh / cho thuê / lưu trữ /
 * xoá đều qua RPC admin; khách thấy thay đổi ngay, không cần sửa code.
 */
export default function AdminCarsScreen() {
  const router = useRouter();
  const ready = useAdminGuard();
  const { cars, error, loading, reload } = useFleetCars(ready);
  const [showArchived, setShowArchived] = useState(false);

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  const current = cars.filter((car) => !car.archivedAt);
  const archived = cars.filter((car) => !!car.archivedAt);
  const activeCount = current.filter((car) => car.isActive).length;

  const openCar = (carId: string) => router.push({ pathname: '/admin/car/[carId]', params: { carId } });

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={GOLD} />}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => goBackOr(router, ADMIN_HOME)}>
          <Text style={styles.backText}>← Danh sách đơn</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
        <Text style={styles.title}>XE & GIÁ</Text>
        <Text style={styles.subtitle}>
          {activeCount}/{current.length} xe đang cho thuê. Bấm vào xe để sửa thông tin, giá, ảnh, bật/tắt
          hoặc lưu trữ. Giá mới chỉ áp dụng cho đơn tạo sau khi lưu.
        </Text>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/admin/car/new')}
        >
          <Text style={styles.addButtonText}>+ THÊM XE</Text>
        </TouchableOpacity>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {loading && cars.length === 0 && !error && <ActivityIndicator color={GOLD} style={styles.loader} />}

        {current.map((car) => (
          <CarRow key={car.id} car={car} onPress={() => openCar(car.id)} />
        ))}

        {archived.length > 0 && (
          <TouchableOpacity style={styles.archiveToggle} onPress={() => setShowArchived(!showArchived)}>
            <Text style={styles.archiveToggleText}>
              {showArchived ? '▾' : '▸'} Xe đã lưu trữ ({archived.length})
            </Text>
          </TouchableOpacity>
        )}

        {showArchived && archived.map((car) => <CarRow key={car.id} car={car} onPress={() => openCar(car.id)} />)}
      </ScrollView>
    </View>
  );
}

function CarRow({ car, onPress }: { car: FleetCar; onPress: () => void }) {
  const status = car.archivedAt
    ? { text: 'LƯU TRỮ', style: styles.badgeArchived }
    : car.isActive
      ? { text: 'ĐANG CHO THUÊ', style: styles.badgeOn }
      : { text: 'ĐANG TẮT', style: styles.badgeOff };

  return (
    <TouchableOpacity
      style={[styles.card, !car.isActive && styles.cardInactive]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <CarPhoto source={car.image} style={styles.thumb} compact />

      <View style={styles.cardInfo}>
        <Text style={styles.carName} numberOfLines={2}>
          {car.name}
        </Text>
        <Text style={styles.price}>{formatPricePerDay(car.pricePerDay)}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {car.category} · {car.seats} chỗ · {fleetServiceLabels(car).join(', ')}
        </Text>
        <View style={styles.badges}>
          <Text style={[styles.badge, status.style]}>{status.text}</Text>
          {car.isFeatured && <Text style={[styles.badge, styles.badgeFeatured]}>NỔI BẬT</Text>}
          {!car.image && <Text style={[styles.badge, styles.badgeOff]}>CHƯA CÓ ẢNH</Text>}
          <Text style={styles.sort}>#{car.sortOrder}</Text>
        </View>
      </View>
    </TouchableOpacity>
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
    paddingBottom: 100,
  },
  loader: { marginTop: 20 },
  backButton: { alignSelf: 'flex-start', marginBottom: 18 },
  backText: { color: GOLD, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#888888', fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 14 },
  addButton: { backgroundColor: GOLD, paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 16 },
  addButtonText: { color: '#080808', fontWeight: '900', fontSize: 15 },
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
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#151515',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#303030',
    padding: 12,
    marginBottom: 12,
  },
  cardInactive: { borderStyle: 'dashed' },
  // alignSelf: hàng ngang mặc định kéo giãn chiều cao con → giữ đúng khung 16:10.
  thumb: { width: 120, borderRadius: 10, alignSelf: 'center' },
  cardInfo: { flex: 1, justifyContent: 'center' },
  carName: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  price: { color: GOLD, fontSize: 15, fontWeight: '900', marginTop: 3 },
  meta: { color: '#999999', fontSize: 12, marginTop: 3 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },
  badge: { fontSize: 10, fontWeight: '900', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  badgeOn: { color: '#5CC98A', backgroundColor: 'rgba(92, 201, 138, 0.12)' },
  badgeOff: { color: '#FF8A80', backgroundColor: 'rgba(255, 138, 128, 0.12)' },
  badgeArchived: { color: '#AAAAAA', backgroundColor: 'rgba(170, 170, 170, 0.12)' },
  badgeFeatured: { color: GOLD, backgroundColor: 'rgba(212, 175, 55, 0.12)' },
  sort: { color: '#666666', fontSize: 11, fontWeight: '700' },
  archiveToggle: { paddingVertical: 12 },
  archiveToggleText: { color: '#BBBBBB', fontSize: 15, fontWeight: '800' },
});
