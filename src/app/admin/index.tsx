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

import { BookingStatusBadge } from '@/components/booking-status-badge';
import { useAdminBookingRequests, useAdminGuard } from '@/hooks/use-admin';
import { signOutAdmin } from '@/services/admin-auth-service';
import type { AdminStatusFilter } from '@/services/admin-booking-service';
import type { BookingRequest } from '@/types/booking';
import { formatDateTime } from '@/utils/format-date';
import { formatVnd } from '@/utils/format-price';

const GOLD = '#D4AF37';

// Route mới; typed routes có thể chưa sinh lại kịp nên ép kiểu Href.
const ADMIN_CALENDAR = '/admin/calendar' as Href;

const FILTERS: { value: AdminStatusFilter; label: string }[] = [
  { value: 'pending', label: 'Chờ xác nhận' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'rejected', label: 'Đã từ chối' },
  { value: 'cancelled', label: 'Đã hủy' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'expired', label: 'Hết hạn' },
  { value: 'all', label: 'Tất cả' },
];

export default function AdminRequestsScreen() {
  const router = useRouter();
  const ready = useAdminGuard();
  const [filter, setFilter] = useState<AdminStatusFilter>('pending');
  const { requests, loading, error, reload } = useAdminBookingRequests(filter, ready);

  const handleSignOut = async () => {
    await signOutAdmin();
    router.replace('/admin/login');
  };

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={GOLD} />
        }
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
            <Text style={styles.title}>QUẢN TRỊ ĐƠN</Text>
          </View>

          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.calendarButton}
          activeOpacity={0.8}
          onPress={() => router.push(ADMIN_CALENDAR)}
        >
          <Text style={styles.calendarButtonText}>LỊCH XE</Text>
        </TouchableOpacity>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map((item) => {
            const active = item.value === filter;

            return (
              <TouchableOpacity
                key={item.value}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(item.value)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!loading && !error && requests.length === 0 && (
          <Text style={styles.empty}>Không có đơn nào trong mục này.</Text>
        )}

        {!error &&
          requests.map((request) => (
            <AdminRequestCard
              key={request.id}
              request={request}
              onPress={() =>
                router.push({
                  pathname: '/admin/request/[requestId]',
                  params: { requestId: request.id },
                })
              }
            />
          ))}
      </ScrollView>
    </View>
  );
}

function AdminRequestCard({
  request,
  onPress,
}: {
  request: BookingRequest;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.cardTop}>
        <Text style={styles.code}>{request.bookingCode}</Text>
        <BookingStatusBadge status={request.status} />
      </View>

      <Text style={styles.carName}>{request.carName}</Text>
      <Text style={styles.meta}>
        {request.serviceType} • {request.customer.fullName} • {request.customer.phone}
      </Text>

      <Text style={styles.time}>Nhận: {formatDateTime(request.pickupAt)}</Text>
      <Text style={styles.time}>Trả: {formatDateTime(request.returnAt)}</Text>

      <View style={styles.cardFooter}>
        <Text style={styles.days}>{request.rentalDays} ngày</Text>
        <Text style={styles.total}>
          {formatVnd(request.finalTotal ?? request.estimatedTotal)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  center: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 65, paddingBottom: 80 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 6 },
  signOutButton: {
    borderWidth: 1,
    borderColor: '#444444',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  signOutText: { color: '#BBBBBB', fontSize: 13, fontWeight: '700' },
  calendarButton: {
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  calendarButtonText: { color: GOLD, fontWeight: '900', letterSpacing: 0.5 },
  filters: { gap: 8, paddingVertical: 20 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#333333',
  },
  filterChipActive: { backgroundColor: GOLD, borderColor: GOLD },
  filterText: { color: '#AAAAAA', fontWeight: '700', fontSize: 13 },
  filterTextActive: { color: '#080808' },
  errorBox: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  errorText: { color: '#FFB4AE', fontSize: 14, lineHeight: 20 },
  empty: { color: '#888888', textAlign: 'center', marginTop: 40, fontSize: 15 },
  card: {
    backgroundColor: '#151515',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#303030',
    padding: 16,
    marginBottom: 14,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { color: GOLD, fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  carName: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', marginTop: 10 },
  meta: { color: '#AAAAAA', fontSize: 13, marginTop: 4 },
  time: { color: '#CCCCCC', fontSize: 13, marginTop: 6 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#262626',
    marginTop: 12,
    paddingTop: 10,
  },
  days: { color: '#888888', fontSize: 13 },
  total: { color: GOLD, fontSize: 17, fontWeight: '900' },
});
