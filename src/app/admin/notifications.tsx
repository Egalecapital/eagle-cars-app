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
import { useAdminGuard, useAdminNotifications, useNotificationSummary } from '@/hooks/use-admin';
import type { NotificationStatus } from '@/services/admin-booking-service';
import { goBackOr } from '@/utils/navigation';

const GOLD = '#D4AF37';

// Typed routes đôi khi chỉ sinh '/admin/index'; URL thật của danh sách đơn là '/admin'.
const ADMIN_HOME = '/admin' as Href;

type Filter = NotificationStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'failed', label: 'Thất bại' },
  { value: 'pending', label: 'Đang chờ' },
  { value: 'sent', label: 'Đã gửi' },
  { value: 'all', label: 'Tất cả' },
];

export default function AdminNotificationsScreen() {
  const router = useRouter();
  const ready = useAdminGuard();
  const [filter, setFilter] = useState<Filter>('all');
  const { summary, reload: reloadSummary } = useNotificationSummary(ready);
  const { notifications, loading, error, reload } = useAdminNotifications(filter, ready);

  const reloadAll = () => {
    reload();
    reloadSummary();
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
        <Text style={styles.title}>THÔNG BÁO TELEGRAM</Text>
        <Text style={styles.subtitle}>
          Mỗi đơn mới gửi 1 tin vào nhóm Telegram. Hệ thống tự thử lại khi lỗi; dòng THẤT BẠI là
          đã hết lượt thử tự động.
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
          {FILTERS.map((item) => {
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
              onOpenBooking={() =>
                router.push({
                  pathname: '/admin/request/[requestId]',
                  params: { requestId: notification.bookingId },
                })
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
