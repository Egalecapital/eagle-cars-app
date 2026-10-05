import { useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  type AdminNotification,
  AdminBookingError,
  describeNotificationError,
  type NotificationStatus,
  retryNotification,
} from '@/services/admin-booking-service';
import { formatDateTime } from '@/utils/format-date';

const GOLD = '#D4AF37';

const STATUS_UI: Record<NotificationStatus, { label: string; color: string; background: string }> = {
  failed: { label: 'THẤT BẠI', color: '#FF8A80', background: 'rgba(255, 138, 128, 0.12)' },
  pending: { label: 'ĐANG CHỜ GỬI', color: GOLD, background: 'rgba(212, 175, 55, 0.12)' },
  sent: { label: 'ĐÃ GỬI', color: '#5CC98A', background: 'rgba(92, 201, 138, 0.12)' },
  skipped: { label: 'KHÔNG GỬI', color: '#9A9A9A', background: 'rgba(154, 154, 154, 0.12)' },
};

type AdminNotificationCardProps = {
  notification: AdminNotification;
  /** Gọi sau khi gửi lại thành công (để tải lại danh sách). */
  onRetried: () => void;
  /** Bấm mã đơn → mở chi tiết đơn (bỏ trống khi đang ở chính màn đơn đó). */
  onOpenBooking?: () => void;
};

/** Một thông báo Telegram hoặc push khách (outbox). Dòng thất bại có nút gửi lại 2 bước. */
export function AdminNotificationCard({
  notification,
  onRetried,
  onOpenBooking,
}: AdminNotificationCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const busyRef = useRef(false);

  const ui = STATUS_UI[notification.status];
  const errorText = describeNotificationError(notification.lastError);

  const retry = async () => {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError('');

    try {
      await retryNotification(notification);
      setConfirming(false);
      setMessage('Đã đưa vào hàng đợi. Hệ thống sẽ gửi lại trong khoảng 1 phút.');
      onRetried();
    } catch (retryError) {
      setError(
        retryError instanceof AdminBookingError
          ? retryError.userMessage
          : 'Chưa gửi lại được. Vui lòng thử lại.'
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, notification.status === 'failed' && styles.cardFailed]}>
      <View style={styles.top}>
        {onOpenBooking && notification.bookingCode ? (
          <TouchableOpacity onPress={onOpenBooking} hitSlop={8}>
            <Text style={[styles.code, styles.link]}>{notification.bookingCode} ›</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.code}>{notification.channel === 'push' ? 'Push khách' : 'Telegram'}</Text>
        )}
        <Text style={[styles.badge, { color: ui.color, backgroundColor: ui.background }]}>
          {ui.label}
        </Text>
      </View>

      {(onOpenBooking || notification.channel === 'push') && (
        <Text style={styles.car}>{notification.subtitle}</Text>
      )}

      <Text style={styles.meta}>
        Lần thử: {notification.attempts}/{notification.maxAttempts}
        {notification.lastAttemptAt ? ` · Lần cuối ${formatDateTime(notification.lastAttemptAt)}` : ''}
      </Text>
      {notification.status === 'sent' && notification.sentAt && (
        <Text style={styles.meta}>Đã gửi lúc {formatDateTime(notification.sentAt)}</Text>
      )}
      {notification.status === 'pending' && notification.nextAttemptAt && (
        <Text style={styles.meta}>Lượt gửi kế tiếp: {formatDateTime(notification.nextAttemptAt)}</Text>
      )}
      {!!errorText && notification.status !== 'sent' && (
        <Text style={notification.status === 'failed' ? styles.errorReason : styles.meta}>
          {errorText}
        </Text>
      )}

      {notification.status === 'failed' &&
        (confirming ? (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmText}>
              {notification.channel === 'push'
                ? 'Gửi lại thông báo đẩy cho khách? Nếu khách thật ra đã nhận, họ có thể thấy tin trùng.'
                : 'Gửi lại thông báo này? Nếu Telegram thật ra đã nhận, nhóm có thể thấy tin trùng.'}
            </Text>
            <View style={styles.confirmRow}>
              <TouchableOpacity
                style={[styles.confirmYes, busy && styles.disabled]}
                disabled={busy}
                onPress={retry}
              >
                <Text style={styles.confirmYesText}>{busy ? 'ĐANG GỬI...' : 'GỬI LẠI'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmNo}
                disabled={busy}
                onPress={() => setConfirming(false)}
              >
                <Text style={styles.confirmNoText}>HUỶ</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setMessage('');
              setError('');
              setConfirming(true);
            }}
          >
            <Text style={styles.retryText}>GỬI LẠI THÔNG BÁO</Text>
          </TouchableOpacity>
        ))}

      {!!message && <Text style={styles.success}>{message}</Text>}
      {!!error && <Text style={styles.errorReason}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#151515',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#303030',
    padding: 14,
    marginBottom: 12,
  },
  cardFailed: { borderColor: '#E5534B' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  code: { color: GOLD, fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  link: { textDecorationLine: 'underline' },
  badge: {
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  car: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginTop: 8 },
  meta: { color: '#AAAAAA', fontSize: 13, lineHeight: 19, marginTop: 4 },
  errorReason: { color: '#FF8A80', fontSize: 13, lineHeight: 19, marginTop: 6 },
  success: { color: '#5CC98A', fontSize: 13, fontWeight: '700', marginTop: 8 },
  retryButton: {
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
  },
  retryText: { color: GOLD, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  confirmBox: {
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
  },
  confirmText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  confirmYes: { flex: 1, backgroundColor: GOLD, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  confirmYesText: { color: '#080808', fontWeight: '900' },
  confirmNo: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#777777',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmNoText: { color: '#CCCCCC', fontWeight: '900' },
});
