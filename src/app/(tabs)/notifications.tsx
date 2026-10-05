import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useMyNotifications } from '@/hooks/use-customer-notifications';
import { type CustomerNotification, markNotificationsRead } from '@/services/notification-service';
import { getPushStatus, type PushStatus, registerForPush } from '@/services/push-service';
import { formatDateTime } from '@/utils/format-date';

const GOLD = '#D4AF37';

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, loading, refreshing, error, reload } = useMyNotifications();
  const [markError, setMarkError] = useState('');
  const unread = notifications.filter((item) => !item.readAt).length;

  const open = async (item: CustomerNotification) => {
    if (!item.readAt) {
      // Không chặn mở đơn nếu đánh dấu lỗi mạng.
      markNotificationsRead([item.id]).catch(() => {});
    }

    if (item.bookingId) {
      router.push({ pathname: '/request/[requestId]', params: { requestId: item.bookingId } });
    }
  };

  const markAll = async () => {
    setMarkError('');

    try {
      await markNotificationsRead();
    } catch {
      setMarkError('Chưa đánh dấu được. Vui lòng thử lại.');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={GOLD} />}
      >
        <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
        <Text style={styles.title}>THÔNG BÁO</Text>

        <PushCard />

        {unread > 0 && (
          <TouchableOpacity style={styles.markAll} onPress={markAll}>
            <Text style={styles.markAllText}>Đánh dấu tất cả đã đọc ({unread})</Text>
          </TouchableOpacity>
        )}
        {!!markError && <Text style={styles.inlineError}>{markError}</Text>}

        {loading && notifications.length === 0 && <ActivityIndicator color={GOLD} style={styles.loader} />}

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={reload} disabled={refreshing}>
              <Text style={styles.retryText}>{refreshing ? 'Đang tải lại...' : 'Thử lại'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && notifications.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>Chưa có thông báo</Text>
            <Text style={styles.emptyText}>
              Khi Eagle Capital xác nhận, từ chối hoặc cập nhật đơn đặt xe của bạn, thông báo sẽ hiện ở
              đây.
            </Text>
          </View>
        )}

        {notifications.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.card, !item.readAt && styles.cardUnread]}
            activeOpacity={0.85}
            onPress={() => open(item)}
          >
            <View style={styles.cardTop}>
              {!item.readAt && <View style={styles.dot} />}
              <Text style={[styles.cardTitle, !item.readAt && styles.cardTitleUnread]}>{item.title}</Text>
            </View>
            <Text style={styles.cardBody}>{item.body}</Text>
            <Text style={styles.cardTime}>
              {formatDateTime(item.createdAt)}
              {item.bookingId ? ' · Xem đơn ›' : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const PUSH_TEXT: Partial<Record<PushStatus, string>> = {
  undetermined: 'Bật thông báo để nhận tin ngay khi đơn được xác nhận hoặc thay đổi.',
  denied: 'Thông báo đang bị tắt. Mở Cài đặt của điện thoại → Eagle Cars → Thông báo để bật lại.',
};

/** Thẻ bật push (chỉ iOS / Android; ẩn khi đã bật hoặc thiết bị không hỗ trợ). */
function PushCard() {
  const [status, setStatus] = useState<PushStatus | undefined>();
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      getPushStatus()
        .then((value) => {
          if (active) setStatus(value);
        })
        .catch(() => {});

      return () => {
        active = false;
      };
    }, [])
  );

  if (!status || !PUSH_TEXT[status]) return null;

  const enable = async () => {
    setBusy(true);

    try {
      setStatus(await registerForPush(true));
    } catch {
      // Lỗi mạng / Expo: giữ nguyên thẻ để thử lại.
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.pushCard}>
      <Text style={styles.pushText}>{PUSH_TEXT[status]}</Text>
      {status === 'undetermined' && (
        <TouchableOpacity style={[styles.pushButton, busy && styles.disabled]} onPress={enable} disabled={busy}>
          <Text style={styles.pushButtonText}>{busy ? 'ĐANG BẬT...' : 'BẬT THÔNG BÁO'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  content: { paddingTop: 70, paddingHorizontal: 20, paddingBottom: 120 },
  eyebrow: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 6, marginBottom: 16 },
  loader: { marginTop: 40 },
  markAll: { alignSelf: 'flex-end', marginBottom: 12 },
  markAllText: { color: GOLD, fontWeight: '800', fontSize: 14 },
  inlineError: { color: '#FF8A80', fontSize: 13, marginBottom: 10, textAlign: 'right' },
  errorBox: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  errorText: { color: '#FFB4AE', fontSize: 14, lineHeight: 20 },
  retryText: { color: GOLD, fontWeight: '900', marginTop: 8 },
  empty: { alignItems: 'center', marginTop: 50, paddingHorizontal: 10 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginTop: 12 },
  emptyText: { color: '#999999', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  card: {
    backgroundColor: '#151515',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#262626',
    padding: 14,
    marginBottom: 12,
  },
  cardUnread: { borderColor: 'rgba(212, 175, 55, 0.6)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: GOLD },
  cardTitle: { flex: 1, color: '#DDDDDD', fontSize: 15, fontWeight: '700' },
  cardTitleUnread: { color: '#FFFFFF', fontWeight: '900' },
  cardBody: { color: '#AAAAAA', fontSize: 14, lineHeight: 20, marginTop: 6 },
  cardTime: { color: '#777777', fontSize: 12, marginTop: 8 },
  pushCard: {
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.5)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  pushText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  pushButton: { backgroundColor: GOLD, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  pushButtonText: { color: '#080808', fontWeight: '900' },
  disabled: { opacity: 0.6 },
});
