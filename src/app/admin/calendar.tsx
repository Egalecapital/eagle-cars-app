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

import { useAdminCars, useAdminCarSchedule, useAdminGuard } from '@/hooks/use-admin';
import type { BookingRequest } from '@/types/booking';
import { goBackOr } from '@/utils/navigation';
import {
  addDaysToKey,
  formatVnTime,
  vnDateKey,
  vnDayMonth,
  vnDayStart,
  vnWeekday,
} from '@/utils/vn-time';

const GOLD = '#D4AF37';
const DAYS_STEP = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Typed routes đôi khi chỉ sinh '/admin/index'; URL thật của danh sách đơn là '/admin'.
const ADMIN_HOME = '/admin' as Href;

/** Hai khoảng nửa mở [a1, a2) và [b1, b2) có giao nhau không. */
const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;

/** 'HH:MM DD/MM' theo giờ VN. */
const shortVn = (iso: string) => {
  const date = new Date(iso);

  return `${formatVnTime(date)} ${vnDayMonth(vnDateKey(date))}`;
};

export default function AdminCalendarScreen() {
  const router = useRouter();
  const ready = useAdminGuard();
  const { cars, error: carsError } = useAdminCars(ready);

  const [selectedCarId, setSelectedCarId] = useState<string | undefined>();
  const [days, setDays] = useState(DAYS_STEP);
  // Mốc "hôm nay" theo giờ VN, cố định trong lúc màn hình mở.
  const [todayKey] = useState(() => vnDateKey(new Date()));

  const carId = selectedCarId ?? cars[0]?.id;
  const from = vnDayStart(todayKey);
  const to = new Date(from.getTime() + days * MS_PER_DAY);

  const { requests, loading, error, reload } = useAdminCarSchedule(carId, from, to, ready);

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  const confirmed = requests.filter((r) => r.status === 'confirmed');

  // pending trùng giờ với ít nhất một đơn confirmed → cảnh báo cho admin.
  const conflicting = new Set(
    requests
      .filter((r) => r.status === 'pending')
      .filter((p) =>
        confirmed.some((c) =>
          overlaps(
            Date.parse(p.pickupAt),
            Date.parse(p.returnAt),
            Date.parse(c.pickupAt),
            Date.parse(c.returnAt)
          )
        )
      )
      .map((p) => p.id)
  );

  const dayKeys = Array.from({ length: days }, (_, i) => addDaysToKey(todayKey, i));

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={GOLD} />
        }
      >
        <TouchableOpacity style={styles.backButton} onPress={() => goBackOr(router, ADMIN_HOME)}>
          <Text style={styles.backText}>← Danh sách đơn</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
        <Text style={styles.title}>LỊCH XE</Text>
        <Text style={styles.subtitle}>Giờ Việt Nam (Asia/Ho_Chi_Minh)</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carChips}
        >
          {cars.map((car) => {
            const active = car.id === carId;

            return (
              <TouchableOpacity
                key={car.id}
                style={[styles.carChip, active && styles.carChipActive]}
                onPress={() => setSelectedCarId(car.id)}
              >
                <Text style={[styles.carChipText, active && styles.carChipTextActive]}>
                  {car.name}
                  {!car.isActive && ' (đang tắt)'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <View style={[styles.legendSwatch, styles.legendConfirmed]} />
            <Text style={styles.legendText}>Đã giữ lịch (đã xác nhận)</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendSwatch, styles.legendPending]} />
            <Text style={styles.legendText}>Chờ xác nhận – chưa giữ lịch</Text>
          </View>
        </View>

        {!!(carsError || error) && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{carsError ?? error}</Text>
          </View>
        )}

        {!carsError && cars.length === 0 && (
          <Text style={styles.empty}>Chưa có xe nào đang hoạt động.</Text>
        )}

        {!!carId &&
          dayKeys.map((dayKey, index) => {
            const dayStart = vnDayStart(dayKey).getTime();
            const dayEnd = dayStart + MS_PER_DAY;
            const items = requests.filter((r) =>
              overlaps(Date.parse(r.pickupAt), Date.parse(r.returnAt), dayStart, dayEnd)
            );

            return (
              <View key={dayKey} style={styles.day}>
                <Text style={styles.dayHeader}>
                  {index === 0 ? 'Hôm nay' : vnWeekday(dayKey)}, {vnDayMonth(dayKey)}
                </Text>

                {items.length === 0 ? (
                  <Text style={styles.dayEmpty}>Trống</Text>
                ) : (
                  items.map((item) => (
                    <ScheduleItem
                      key={`${dayKey}-${item.id}`}
                      item={item}
                      conflict={conflicting.has(item.id)}
                      onPress={() =>
                        router.push({
                          pathname: '/admin/request/[requestId]',
                          params: { requestId: item.id },
                        })
                      }
                    />
                  ))
                )}
              </View>
            );
          })}

        {!!carId && (
          <TouchableOpacity
            style={styles.moreButton}
            onPress={() => setDays((value) => value + DAYS_STEP)}
          >
            <Text style={styles.moreButtonText}>XEM THÊM {DAYS_STEP} NGÀY</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function ScheduleItem({
  item,
  conflict,
  onPress,
}: {
  item: BookingRequest;
  conflict: boolean;
  onPress: () => void;
}) {
  const isConfirmed = item.status === 'confirmed';

  return (
    <TouchableOpacity
      style={[styles.item, isConfirmed ? styles.itemConfirmed : styles.itemPending]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={styles.itemTop}>
        <Text style={[styles.itemStatus, isConfirmed ? styles.statusConfirmed : styles.statusPending]}>
          {isConfirmed ? 'ĐÃ GIỮ LỊCH' : 'CHỜ XÁC NHẬN – CHƯA GIỮ LỊCH'}
        </Text>
        <Text style={styles.itemCode}>{item.bookingCode}</Text>
      </View>

      <Text style={styles.itemTime}>
        {shortVn(item.pickupAt)} → {shortVn(item.returnAt)}
      </Text>
      <Text style={styles.itemCustomer}>
        {item.customer.fullName} • {item.customer.phone}
      </Text>

      {conflict && (
        <Text style={styles.conflict}>⚠ Trùng lịch với đơn đã xác nhận</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  center: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 65, paddingBottom: 80 },
  backButton: { alignSelf: 'flex-start', marginBottom: 18 },
  backText: { color: GOLD, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#888888', fontSize: 13, marginTop: 4 },
  carChips: { gap: 8, paddingVertical: 18 },
  carChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#333333',
  },
  carChipActive: { backgroundColor: GOLD, borderColor: GOLD },
  carChipText: { color: '#AAAAAA', fontWeight: '700', fontSize: 13 },
  carChipTextActive: { color: '#080808' },
  legend: { gap: 6, marginBottom: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendSwatch: { width: 18, height: 12, borderRadius: 3, borderWidth: 1.5 },
  legendConfirmed: { borderColor: GOLD, backgroundColor: 'rgba(212, 175, 55, 0.25)' },
  legendPending: { borderColor: '#777777', borderStyle: 'dashed' },
  legendText: { color: '#BBBBBB', fontSize: 13 },
  errorBox: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  errorText: { color: '#FFB4AE', fontSize: 14, lineHeight: 20 },
  empty: { color: '#888888', textAlign: 'center', marginTop: 30 },
  day: {
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
    paddingVertical: 12,
  },
  dayHeader: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', marginBottom: 8 },
  dayEmpty: { color: '#555555', fontSize: 13 },
  item: { borderRadius: 14, borderWidth: 1.5, padding: 12, marginBottom: 8 },
  itemConfirmed: { borderColor: GOLD, backgroundColor: 'rgba(212, 175, 55, 0.10)' },
  itemPending: { borderColor: '#666666', borderStyle: 'dashed', backgroundColor: '#111111' },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  itemStatus: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5, flexShrink: 1 },
  statusConfirmed: { color: GOLD },
  statusPending: { color: '#AAAAAA' },
  itemCode: { color: '#888888', fontSize: 12, fontWeight: '700' },
  itemTime: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', marginTop: 6 },
  itemCustomer: { color: '#AAAAAA', fontSize: 13, marginTop: 4 },
  conflict: { color: '#FF8A80', fontSize: 13, fontWeight: '800', marginTop: 6 },
  moreButton: {
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  moreButtonText: { color: GOLD, fontWeight: '900' },
});
