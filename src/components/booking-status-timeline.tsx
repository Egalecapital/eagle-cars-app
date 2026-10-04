import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { BOOKING_STATUS_STYLES } from '@/components/booking-status-badge';
import type { BookingEventActor, BookingStatusEvent } from '@/services/admin-booking-service';
import { formatDateTime } from '@/utils/format-date';

const GOLD = '#D4AF37';

const ACTOR_LABELS: Record<BookingEventActor, string> = {
  customer: 'Khách',
  'admin-self': 'Admin (bạn)',
  admin: 'Admin',
  system: 'Hệ thống – tự hết hạn',
  legacy: 'Dữ liệu trước khi bật lịch sử',
  database: 'Supabase (SQL / Dashboard)',
};

type BookingStatusTimelineProps = {
  events: BookingStatusEvent[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
};

/** Lịch sử trạng thái của một đơn, cũ trên mới dưới (booking_status_events). */
export function BookingStatusTimeline({ events, loading, error, onRetry }: BookingStatusTimelineProps) {
  if (error) {
    return (
      <View>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity style={styles.retry} onPress={onRetry}>
          <Text style={styles.retryText}>THỬ LẠI</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && events.length === 0) {
    return <ActivityIndicator color={GOLD} style={styles.loader} />;
  }

  if (events.length === 0) {
    return <Text style={styles.empty}>Chưa có lịch sử cho đơn này.</Text>;
  }

  return (
    <View>
      {events.map((event, index) => {
        const to = BOOKING_STATUS_STYLES[event.toStatus];
        const isLast = index === events.length - 1;
        // Ghi chú lặp lại từ bước trước (vd hoàn tất không kèm ghi chú) thì ẩn.
        const showReason = !!event.reason && event.reason !== events[index - 1]?.reason;

        return (
          <View key={event.id} style={styles.item}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: to.color }]} />
              {!isLast && <View style={styles.line} />}
            </View>

            <View style={[styles.body, !isLast && styles.bodySpaced]}>
              <Text style={styles.title}>
                {event.fromStatus === null ? (
                  <>
                    {event.actor === 'legacy' ? 'Trạng thái lúc bật lịch sử · ' : 'Tạo đơn · '}
                    <Text style={{ color: to.color }}>{to.label}</Text>
                  </>
                ) : (
                  <>
                    {BOOKING_STATUS_STYLES[event.fromStatus].label} →{' '}
                    <Text style={{ color: to.color }}>{to.label}</Text>
                  </>
                )}
              </Text>
              <Text style={styles.meta}>
                {formatDateTime(event.createdAt)} · {ACTOR_LABELS[event.actor]}
              </Text>
              {showReason && <Text style={styles.reason}>“{event.reason}”</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { marginVertical: 12 },
  empty: { color: '#888888', fontSize: 14, paddingVertical: 6 },
  error: { color: '#FFB4AE', fontSize: 14, lineHeight: 20 },
  retry: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 10,
  },
  retryText: { color: GOLD, fontWeight: '900', fontSize: 13 },
  item: { flexDirection: 'row' },
  rail: { width: 22, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  line: { flex: 1, width: 2, backgroundColor: '#333333', marginTop: 4 },
  body: { flex: 1, paddingLeft: 8 },
  bodySpaced: { paddingBottom: 18 },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', lineHeight: 21 },
  meta: { color: '#999999', fontSize: 13, marginTop: 3 },
  reason: { color: '#CCCCCC', fontSize: 13, lineHeight: 19, marginTop: 5, fontStyle: 'italic' },
});
