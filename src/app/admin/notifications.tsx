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

import { AdminNotificationCard } from '@/components/admin-notification-card';
import {
  useAdminGuard,
  useAdminNotifications,
  useAdminPushNotifications,
  useNotificationSummary,
  usePushSummary,
} from '@/hooks/use-admin';
import type { NotificationChannel, NotificationStatus } from '@/services/admin-booking-service';
import { goBackOr } from '@/utils/navigation';

const GOLD = '#D4AF37';

// Typed routes đôi khi chỉ sinh '/admin/index'; URL thật của danh sách đơn là '/admin'.
const ADMIN_HOME = '/admin' as Href;

type Filter = NotificationStatus | 'all';

const FILTERS: { value: Filter; label: string; push?: boolean }[] = [
  { value: 'failed', label: 'Thất bại' },
  { value: 'pending', label: 'Đang chờ' },
  { value: 'sent', label: 'Đã gửi' },
  { value: 'skipped', label: 'Không gửi', push: true },
  { value: 'all', label: 'Tất cả' },
];

export default function AdminNotificationsScreen() {
  const router = useRouter();
  const ready = useAdminGuard();
  const [channel, setChannel] = useState<NotificationChannel>('telegram');
  const [filter, setFilter] = useState<Filter>('all');
  const isPush = channel === 'push';
  const telegramSummary = useNotificationSummary(ready);
  const pushSummary = usePushSummary(ready);
  // Chỉ kênh đang xem tải danh sách.
  const telegram = useAdminNotifications(
    filter === 'skipped' ? 'all' : filter,
    ready && !isPush
  );
  const push = useAdminPushNotifications(filter, ready && isPush);
  const { summary, reload: reloadSummary } = isPush ? pushSummary : telegramSummary;
  const { notifications, loading, error, reload } = isPush ? push : telegram;

  const reloadAll = () => {
    reload();
    reloadSummary();
  };

  const switchChannel = (next: NotificationChannel) => {
    setChannel(next);
    setFilter('all');
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
        refreshControl={<RefreshControl refreshing={false} onRefresh={reloadAll} tintColor={GOLD} />}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => goBackOr(router, ADMIN_HOME)}>
          <Text style={styles.backText}>← Danh sách đơn</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
        <Text style={styles.title}>THÔNG BÁO</Text>

        <View style={styles.channelRow}>
          {(['telegram', 'push'] as const).map((value) => {
            const active = value === channel;
            const failed = value === 'push' ? pushSummary.summary.failed : telegramSummary.summary.failed;

            return (
              <TouchableOpacity
                key={value}
                style={[styles.channel, active && styles.channelActive]}
                onPress={() => switchChannel(value)}
              >
                <Text style={[styles.channelText, active && styles.channelTextActive]}>
                  {value === 'push' ? 'PUSH KHÁCH' : 'TELEGRAM'}
                  {failed > 0 ? ` (${failed} lỗi)` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.subtitle}>
          {isPush
            ? 'Thông báo đẩy tới điện thoại khách khi đơn được xác nhận / từ chối / huỷ / hết hạn / hoàn tất. Khách luôn có bản trong mục Thông báo của app. KHÔNG GỬI = khách chưa bật thông báo hoặc đã gỡ app.'
            : 'Mỗi đơn mới gửi 1 tin vào nhóm Telegram. Hệ thống tự thử lại khi lỗi; dòng THẤT BẠI là đã hết lượt thử tự động.'}
        </Text>

        <View style={styles.summaryRow}>
          <SummaryBox label="Thất bại" value={summary.failed} color="#FF8A80" alert={summary.failed > 0} />
          <SummaryBox
            label={summary.overduePending > 0 ? `Đang chờ (${summary.overduePending} chậm)` : 'Đang chờ'}
            value={summary.pending}
            color={GOLD}
            alert={summary.overduePending > 0}
          />
          <SummaryBox label="Đã gửi" value={summary.sent} color="#5CC98A" />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.filter((item) => isPush || !item.push).map((item) => {
            const active = item.value === filter;

            return (
              <TouchableOpacity
                key={item.value}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(item.value)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={reloadAll}>
              <Text style={styles.retryLink}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && notifications.length === 0 && !error && (
          <ActivityIndicator color={GOLD} style={styles.loader} />
        )}

        {!loading && !error && notifications.length === 0 && (
          <Text style={styles.empty}>
            {filter === 'failed' ? 'Không có thông báo thất bại. 👍' : 'Không có thông báo nào trong mục này.'}
          </Text>
        )}

        {!error &&
          notifications.map((notification) => (
            <AdminNotificationCard
              key={notification.id}
              notification={notification}
              onRetried={reloadAll}
              onOpenBooking={
                notification.bookingId
                  ? () =>
                      router.push({
                        pathname: '/admin/request/[requestId]',
                        params: { requestId: notification.bookingId as string },
                      })
                  : undefined
              }
            />
          ))}

        {!error && notifications.length >= 100 && (
          <Text style={styles.empty}>Đang hiện 100 thông báo đầu tiên.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function SummaryBox({
  label,
  value,
  color,
  alert,
}: {
  label: string;
  value: number;
  color: string;
  alert?: boolean;
}) {
  return (
    <View style={[styles.summaryBox, alert && { borderColor: color }]}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  center: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 65, paddingBottom: 100 },
  loader: { marginTop: 20 },
  backButton: { alignSelf: 'flex-start', marginBottom: 18 },
  backText: { color: GOLD, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#888888', fontSize: 13, lineHeight: 19, marginTop: 6 },
  summaryRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  channelRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  channel: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#444444',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  channelActive: { borderColor: GOLD, backgroundColor: 'rgba(212, 175, 55, 0.12)' },
  channelText: { color: '#AAAAAA', fontWeight: '900', fontSize: 13 },
  channelTextActive: { color: GOLD },
  summaryBox: {
    flex: 1,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  summaryValue: { fontSize: 24, fontWeight: '900' },
  summaryLabel: { color: '#AAAAAA', fontSize: 12, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  filters: { gap: 8, paddingVertical: 18 },
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
  retryLink: { color: GOLD, fontWeight: '900', marginTop: 8 },
  empty: { color: '#888888', textAlign: 'center', marginTop: 30, fontSize: 15 },
});
