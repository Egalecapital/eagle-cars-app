import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useRef, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { BookingStatusBadge } from '@/components/booking-status-badge';
import { useBookingRequest } from '@/hooks/use-booking-requests';
import {
  BookingServiceError,
  cancelMyBookingRequest,
} from '@/services/booking-service';
import { getCarById } from '@/services/car-service';
import { formatDateTime } from '@/utils/format-date';
import { formatPricePerDay, formatVnd } from '@/utils/format-price';

const GOLD = '#D4AF37';

export default function RequestDetailScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    requestId?: string | string[];
  }>();

  const requestId = Array.isArray(params.requestId)
    ? params.requestId[0]
    : params.requestId;

  const { request, loading, error } = useBookingRequest(requestId);

  // Huỷ 2 bước: bấm lần 1 hiện xác nhận, bấm lần 2 mới gửi.
  const [cancelArmed, setCancelArmed] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const cancellingRef = useRef(false);

  if (loading) {
    return <View style={styles.container} />;
  }

  if (!request) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundTitle}>
          {error ? 'Không tải được yêu cầu' : 'Không tìm thấy yêu cầu'}
        </Text>

        <Text style={styles.notFoundText}>
          {error ?? 'Yêu cầu này không tồn tại hoặc không thuộc thiết bị này.'}
        </Text>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>QUAY LẠI</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const car = getCarById(request.carId);

  const handleCancel = async () => {
    if (!cancelArmed) {
      setCancelArmed(true);
      return;
    }

    if (cancellingRef.current) return;

    cancellingRef.current = true;
    setCancelling(true);
    setCancelError('');

    try {
      await cancelMyBookingRequest(request.id);
      setCancelArmed(false);
    } catch (cancelErr) {
      setCancelError(
        cancelErr instanceof BookingServiceError
          ? cancelErr.userMessage
          : 'Chưa hủy được yêu cầu. Vui lòng thử lại.'
      );
    } finally {
      cancellingRef.current = false;
      setCancelling(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.topBackButton}
          onPress={() => router.back()}
        >
          <Text style={styles.topBackText}>← Quay lại</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>CHI TIẾT YÊU CẦU</Text>

        <View style={styles.headerRow}>
          <Text style={styles.requestCode}>
            Mã yêu cầu: {request.bookingCode}
          </Text>
          <BookingStatusBadge status={request.status} />
        </View>

        <View style={styles.carCard}>
          {car && (
            <Image
              source={car.image}
              style={styles.carImage}
              resizeMode="cover"
            />
          )}

          <View style={styles.carInfo}>
            <Text style={styles.carName}>{request.carName}</Text>
            <Text style={styles.price}>
              {formatPricePerDay(request.pricePerDay)}
            </Text>
          </View>
        </View>

        <Section title="Hình thức & thời gian">
          <Row label="Hình thức thuê" value={request.serviceType} />
          <Row label="Nhận xe" value={formatDateTime(request.pickupAt)} />
          <Row label="Trả xe" value={formatDateTime(request.returnAt)} />
          <Row label="Số ngày dự kiến" value={`${request.rentalDays} ngày`} last />
        </Section>

        <Section title="Địa điểm">
          <Row label="Nơi nhận" value={request.pickupLocation} />
          <Row label="Nơi trả" value={request.returnLocation} last />
        </Section>

        <Section title="Thông tin khách hàng">
          <Row label="Họ và tên" value={request.customer.fullName} />
          <Row label="Số điện thoại" value={request.customer.phone} last />
        </Section>

        {!!request.note.trim() && (
          <Section title="Ghi chú">
            <Text style={styles.noteText}>{request.note.trim()}</Text>
          </Section>
        )}

        {!!request.statusReason && (
          <Section
            title={
              request.status === 'rejected'
                ? 'Lý do từ chối'
                : request.status === 'cancelled'
                  ? 'Lý do hủy'
                  : request.status === 'expired'
                    ? 'Lý do hết hạn'
                    : 'Ghi chú từ Eagle Capital'
            }
          >
            <Text style={styles.noteText}>{request.statusReason}</Text>
          </Section>
        )}

        <View style={styles.totalCard}>
          {request.finalTotal !== null ? (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Giá chính thức</Text>
                <Text style={styles.totalValue}>
                  {formatVnd(request.finalTotal)}
                </Text>
              </View>

              <Text style={styles.totalNote}>
                Đã được Eagle Capital xác nhận. Tổng dự kiến ban đầu:{' '}
                {formatVnd(request.estimatedTotal)}.
              </Text>
            </>
          ) : (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Tổng dự kiến</Text>
                <Text style={styles.totalValue}>
                  {formatVnd(request.estimatedTotal)}
                </Text>
              </View>

              <Text style={styles.totalNote}>
                Giá dự kiến. Eagle Capital sẽ xác nhận giá chính thức khi liên hệ.
              </Text>
            </>
          )}
        </View>

        {request.status === 'pending' && (
          <View style={styles.cancelBox}>
            {cancelArmed && (
              <Text style={styles.cancelConfirmText}>
                Bạn chắc chắn muốn hủy yêu cầu {request.bookingCode}? Thao tác này
                không thể hoàn tác.
              </Text>
            )}

            {!!cancelError && (
              <Text style={styles.cancelErrorText}>{cancelError}</Text>
            )}

            <TouchableOpacity
              style={[styles.cancelButton, cancelling && styles.cancelDisabled]}
              activeOpacity={0.8}
              onPress={handleCancel}
              disabled={cancelling}
            >
              <Text style={styles.cancelButtonText}>
                {cancelling
                  ? 'ĐANG HỦY...'
                  : cancelArmed
                    ? 'XÁC NHẬN HỦY YÊU CẦU'
                    : 'HỦY YÊU CẦU'}
              </Text>
            </TouchableOpacity>

            {cancelArmed && !cancelling && (
              <TouchableOpacity onPress={() => setCancelArmed(false)}>
                <Text style={styles.keepText}>Không, giữ yêu cầu</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <Text style={styles.notice}>
          Gửi lúc {formatDateTime(request.createdAt)}. Đây là yêu cầu đặt xe;
          chỉ khi trạng thái là Đã xác nhận thì xe mới được giữ cho bạn.
        </Text>
      </ScrollView>
    </View>
  );
}

type SectionProps = {
  title: string;
  children: ReactNode;
};

function Section({ title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

type RowProps = {
  label: string;
  value: string;
  last?: boolean;
};

function Row({ label, value, last }: RowProps) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
  },

  content: {
    padding: 20,
    paddingTop: 65,
    paddingBottom: 100,
  },

  center: {
    flex: 1,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },

  notFoundTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },

  notFoundText: {
    color: '#999999',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 25,
  },

  backButton: {
    backgroundColor: GOLD,
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 14,
  },

  backButtonText: {
    color: '#080808',
    fontWeight: '900',
  },

  topBackButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
  },

  topBackText: {
    color: GOLD,
    fontSize: 17,
    fontWeight: '800',
  },

  eyebrow: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    marginBottom: 18,
  },

  requestCode: {
    flex: 1,
    color: '#888888',
    fontSize: 13,
    fontWeight: '700',
  },

  carCard: {
    backgroundColor: '#151515',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#303030',
    marginBottom: 16,
  },

  carImage: {
    width: '100%',
    height: 190,
    backgroundColor: '#202020',
  },

  carInfo: {
    padding: 18,
  },

  carName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },

  price: {
    color: GOLD,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 6,
  },

  section: {
    backgroundColor: '#151515',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#303030',
    padding: 18,
    marginBottom: 16,
  },

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
  },

  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },

  rowLabel: {
    color: '#888888',
    fontSize: 14,
  },

  rowValue: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },

  noteText: {
    color: '#BBBBBB',
    fontSize: 15,
    lineHeight: 22,
  },

  totalCard: {
    backgroundColor: '#151515',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GOLD,
    padding: 20,
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  totalLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },

  totalValue: {
    color: GOLD,
    fontSize: 24,
    fontWeight: '900',
  },

  totalNote: {
    color: '#999999',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 10,
  },

  notice: {
    color: '#777777',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 18,
  },

  cancelBox: {
    marginTop: 18,
  },

  cancelConfirmText: {
    color: '#FFB4AE',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 12,
  },

  cancelErrorText: {
    color: '#FF7B72',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 12,
  },

  cancelButton: {
    borderWidth: 1.5,
    borderColor: '#E5534B',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },

  cancelDisabled: {
    opacity: 0.6,
  },

  cancelButtonText: {
    color: '#FF8A80',
    fontSize: 15,
    fontWeight: '900',
  },

  keepText: {
    color: GOLD,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 14,
  },
});
