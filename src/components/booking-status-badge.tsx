import { StyleSheet, Text, View } from 'react-native';

import type { BookingStatus } from '@/types/booking';

type StatusStyle = {
  label: string;
  color: string;
  background: string;
  border: string;
};

export const BOOKING_STATUS_STYLES: Record<BookingStatus, StatusStyle> = {
  pending: {
    label: 'Chờ xác nhận',
    color: '#D4AF37',
    background: 'rgba(212, 175, 55, 0.12)',
    border: 'rgba(212, 175, 55, 0.55)',
  },
  confirmed: {
    label: 'Đã xác nhận',
    color: '#5CC98A',
    background: 'rgba(92, 201, 138, 0.12)',
    border: 'rgba(92, 201, 138, 0.5)',
  },
  completed: {
    label: 'Đã hoàn thành',
    color: '#C9C9C9',
    background: 'rgba(201, 201, 201, 0.1)',
    border: 'rgba(201, 201, 201, 0.4)',
  },
  cancelled: {
    label: 'Đã hủy',
    color: '#FF8A80',
    background: 'rgba(255, 138, 128, 0.1)',
    border: 'rgba(255, 138, 128, 0.45)',
  },
  rejected: {
    label: 'Đã từ chối',
    color: '#FF8A80',
    background: 'rgba(255, 138, 128, 0.1)',
    border: 'rgba(255, 138, 128, 0.45)',
  },
  expired: {
    label: 'Đã hết hạn',
    color: '#9A9A9A',
    background: 'rgba(154, 154, 154, 0.1)',
    border: 'rgba(154, 154, 154, 0.4)',
  },
};

type BookingStatusBadgeProps = {
  status: BookingStatus;
};

export function BookingStatusBadge({ status }: BookingStatusBadgeProps) {
  const statusStyle = BOOKING_STATUS_STYLES[status];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: statusStyle.background,
          borderColor: statusStyle.border,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: statusStyle.color }]} />

      <Text style={[styles.text, { color: statusStyle.color }]}>
        {statusStyle.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },

  text: {
    fontSize: 12,
    fontWeight: '800',
  },
});
