import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { BookingStatusBadge } from '@/components/booking-status-badge';
import {
  useAdminBookingRequests,
  useAdminBookingSearch,
  useAdminGuard,
  useNotificationSummary,
  usePushSummary,
} from '@/hooks/use-admin';
import { signOutAdmin } from '@/services/admin-auth-service';
import { type AdminStatusFilter, SEARCH_RESULT_LIMIT } from '@/services/admin-booking-service';
import type { BookingRequest } from '@/types/booking';
import { formatDateTime } from '@/utils/format-date';
import { formatVnd } from '@/utils/format-price';

const GOLD = '#D4AF37';

// Route mới; typed routes có thể chưa sinh lại kịp nên ép kiểu Href.
const ADMIN_CALENDAR = '/admin/calendar' as Href;
const ADMIN_CARS = '/admin/cars' as Href;
const ADMIN_NOTIFICATIONS = '/admin/notifications' as Href;

const HOUR_MS = 60 * 60 * 1000;

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
  const [query, setQuery] = useState('');
  const search = useAdminBookingSearch(query, ready);
  const { summary } = useNotificationSummary(ready);
  const { summary: pushSummary } = usePushSummary(ready);
  const failedTotal = summary.failed + pushSummary.failed;
  // Mốc "bây giờ" cho nhãn GẤP; cập nhật khi kéo để làm mới.
  const [now, setNow] = useState(() => Date.now());

  const openRequest = (requestId: string) =>
    router.push({ pathname: '/admin/request/[requestId]', params: { requestId } });

  const refresh = () => {
    setNow(Date.now());
    reload();
  };

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
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={GOLD} />
        }
        keyboardShouldPersistTaps="handled"
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

        <View style={styles.navRow}>
          <TouchableOpacity
            style={styles.calendarButton}
            activeOpacity={0.8}
            onPress={() => router.push(ADMIN_CALENDAR)}
          >
            <Text style={styles.calendarButtonText}>LỊCH XE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.calendarButton}
            activeOpacity={0.8}
            onPress={() => router.push(ADMIN_CARS)}
          >
            <Text style={styles.calendarButtonText}>XE & GIÁ</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.calendarButton, failedTotal > 0 && styles.navButtonAlert]}
            activeOpacity={0.8}
            onPress={() => router.push(ADMIN_NOTIFICATIONS)}
          >
            <Text style={[styles.calendarButtonText, failedTotal > 0 && styles.navTextAlert]}>
              {failedTotal > 0 ? `THÔNG BÁO (${failedTotal})` : 'THÔNG BÁO'}
            </Text>
          </TouchableOpacity>
        </View>

        {(failedTotal > 0 || summary.overduePending > 0) && (
          <TouchableOpacity
            style={styles.alertBanner}
            activeOpacity={0.85}
            onPress={() => router.push(ADMIN_NOTIFICATIONS)}
          >
            <Text style={styles.alertText}>
              ⚠{' '}
              {summary.failed > 0
                ? `${summary.failed} thông báo Telegram gửi thất bại`
                : pushSummary.failed > 0
                  ? `${pushSummary.failed} thông báo đẩy cho khách gửi thất bại`
                  : `${summary.overduePending} thông báo Telegram chờ gửi quá 10 phút`}
              {' — '}
              <Text style={styles.alertLink}>Xem</Text>
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm mã EC, số điện thoại hoặc tên khách"
            placeholderTextColor="#666666"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={styles.searchInput}
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={10} style={styles.clearButton}>
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {search.status !== 'idle' ? (
          <View style={styles.searchResults}>
            <Text style={styles.searchHint}>Tìm trên tất cả trạng thái</Text>

            {search.status === 'too-short' && (
              <Text style={styles.empty}>
                Nhập ít nhất 2 ký tự, hoặc 4 chữ số điện thoại (vd 4 số đuôi).
              </Text>
            )}

            {search.status === 'loading' && <ActivityIndicator color={GOLD} style={styles.loader} />}

            {search.status === 'error' && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{search.error}</Text>
                <TouchableOpacity onPress={search.retry}>
                  <Text style={styles.retryLink}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            )}

            {search.status === 'ready' && search.results.length === 0 && (
              <Text style={styles.empty}>Không tìm thấy đơn khớp “{search.term}”.</Text>
            )}

            {search.status === 'ready' &&
              search.results.map((request) => (
                <AdminRequestCard
                  key={request.id}
                  request={request}
                  now={now}
                  onPress={() => openRequest(request.id)}
                />
              ))}

            {search.status === 'ready' && search.results.length >= SEARCH_RESULT_LIMIT && (
              <Text style={styles.searchHint}>
                Đang hiện {SEARCH_RESULT_LIMIT} đơn mới nhất. Hãy nhập cụ thể hơn.
              </Text>
            )}
          </View>
        ) : (
          <>
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

            {loading && !error && requests.length === 0 && (
              <ActivityIndicator color={GOLD} style={styles.loader} />
            )}

            {!error &&
              requests.map((request) => (
                <AdminRequestCard
                  key={request.id}
                  request={request}
                  now={now}
                  onPress={() => openRequest(request.id)}
                />
              ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Nhãn cho đơn chờ xác nhận sắp tới giờ nhận (≤ 24 giờ) hoặc đã quá giờ. */
function pendingUrgency(request: BookingRequest, now: number): string | undefined {
  if (request.status !== 'pending') return undefined;

  const hours = (new Date(request.pickupAt).getTime() - now) / HOUR_MS;

  if (hours <= 0) return 'QUÁ GIỜ NHẬN';
  if (hours <= 24) return `GẤP · nhận trong ${hours < 1 ? '< 1' : Math.floor(hours)} giờ`;

  return undefined;
}

function AdminRequestCard({
  request,
  now,
  onPress,
}: {
  request: BookingRequest;
  now: number;
  onPress: () => void;
}) {
  const urgency = pendingUrgency(request, now);

  return (
    <TouchableOpacity
      style={[styles.card, !!urgency && styles.cardUrgent]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={styles.cardTop}>
        <Text style={styles.code}>{request.bookingCode}</Text>
        <BookingStatusBadge status={request.status} />
      </View>

      {!!urgency && <Text style={styles.urgent}>{urgency}</Text>}

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
  navRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  calendarButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  calendarButtonText: { color: GOLD, fontWeight: '900', letterSpacing: 0.5, fontSize: 13 },
  navButtonAlert: { borderColor: '#E5534B', backgroundColor: 'rgba(229, 83, 75, 0.12)' },
  navTextAlert: { color: '#FF8A80' },
  alertBanner: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  alertText: { color: '#FFB4AE', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  alertLink: { color: GOLD, fontWeight: '900', textDecorationLine: 'underline' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 14,
    paddingHorizontal: 12,
    marginTop: 14,
  },
  searchIcon: { color: GOLD, fontSize: 20, marginRight: 8 },
  searchInput: { flex: 1, minHeight: 48, color: '#FFFFFF', fontSize: 15 },
  clearButton: { paddingHorizontal: 6, paddingVertical: 4 },
  clearText: { color: '#999999', fontSize: 16, fontWeight: '900' },
  searchResults: { paddingTop: 14 },
  searchHint: { color: '#888888', fontSize: 12, marginBottom: 12, textAlign: 'center' },
  loader: { marginTop: 24 },
  retryLink: { color: GOLD, fontWeight: '900', marginTop: 8 },
  cardUrgent: { borderColor: GOLD },
  urgent: {
    color: '#080808',
    backgroundColor: GOLD,
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 8,
  },
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
