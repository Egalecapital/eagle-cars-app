import { useRouter } from 'expo-router';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { BookingStatusBadge } from '@/components/booking-status-badge';
import { useMyBookingRequests } from '@/hooks/use-booking-requests';
import { getCarById } from '@/services/car-service';
import type { BookingRequest } from '@/types/booking';
import { formatDateTime } from '@/utils/format-date';
import { formatVnd } from '@/utils/format-price';

const GOLD = '#D4AF37';

export default function MyRequestsScreen() {
  const router = useRouter();
  const { requests, loading, error } = useMyBookingRequests();

  const openRequest = (requestId: string) => {
    router.push({
      pathname: '/request/[requestId]',
      params: { requestId },
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
        <Text style={styles.title}>ĐƠN CỦA TÔI</Text>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!loading && !error && requests.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>🚘</Text>
            </View>

            <Text style={styles.emptyTitle}>
              Bạn chưa có yêu cầu đặt xe
            </Text>

            <Text style={styles.emptyText}>
              Chọn chiếc xe phù hợp cho hành trình của bạn, Eagle Capital sẽ
              liên hệ xác nhận ngay sau khi nhận yêu cầu.
            </Text>

            <TouchableOpacity
              style={styles.goldButton}
              activeOpacity={0.8}
              onPress={() => router.navigate('/explore')}
            >
              <Text style={styles.goldButtonText}>KHÁM PHÁ XE</Text>
            </TouchableOpacity>
          </View>
        )}

        {requests.length > 0 && (
          <>
            <View style={styles.headingRow}>
              <Text style={styles.subtitle}>Yêu cầu đặt xe trên thiết bị này</Text>
              <Text style={styles.count}>{requests.length} đơn</Text>
            </View>

            {requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                onPress={() => openRequest(request.id)}
              />
            ))}

            <Text style={styles.notice}>
              {requests.some((request) => request.status === 'pending') &&
                'Đơn ở trạng thái Chờ xác nhận chưa phải đặt xe được xác nhận chính thức; Eagle Capital sẽ liên hệ để xác nhận. '}
              Đơn chưa xác nhận hiển thị tổng dự kiến; đơn đã xác nhận hiển thị
              giá chính thức do Eagle Capital chốt.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

type RequestCardProps = {
  request: BookingRequest;
  onPress: () => void;
};

function RequestCard({ request, onPress }: RequestCardProps) {
  const car = getCarById(request.carId);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={styles.cardTop}>
        {car ? (
          <Image
            source={car.image}
            style={styles.carImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.carImage} />
        )}

        <View style={styles.cardTopInfo}>
          <BookingStatusBadge status={request.status} />

          <Text style={styles.carName} numberOfLines={2}>
            {request.carName}
          </Text>

          <Text style={styles.serviceType}>{request.serviceType}</Text>

          <Text style={styles.requestCode} numberOfLines={1}>
            Mã: {request.bookingCode}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <InfoLine label="Nhận xe" value={formatDateTime(request.pickupAt)} />
        <InfoLine label="Trả xe" value={formatDateTime(request.returnAt)} />
        <InfoLine label="Nơi nhận" value={request.pickupLocation} />
        <InfoLine label="Số ngày" value={`${request.rentalDays} ngày`} />
      </View>

      <View style={styles.cardFooter}>
        <View>
          <Text style={styles.totalLabel}>
            {request.finalTotal !== null ? 'Giá chính thức' : 'Tổng dự kiến'}
          </Text>
          <Text style={styles.totalValue}>
            {formatVnd(request.finalTotal ?? request.estimatedTotal)}
          </Text>
        </View>

        <Text style={styles.detailLink}>Chi tiết ›</Text>
      </View>
    </TouchableOpacity>
  );
}

type InfoLineProps = {
  label: string;
  value: string;
};

function InfoLine({ label, value }: InfoLineProps) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
  },

  content: {
    paddingTop: 70,
    paddingHorizontal: 20,
    paddingBottom: 120,
  },

  eyebrow: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    marginTop: 6,
    marginBottom: 22,
  },

  errorBox: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },

  errorText: {
    color: '#FFB4AE',
    fontSize: 14,
    lineHeight: 21,
  },

  empty: {
    backgroundColor: '#151515',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#292929',
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 10,
  },

  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1.5,
    borderColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  emptyIconText: {
    fontSize: 38,
  },

  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },

  emptyText: {
    color: '#999999',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 24,
  },

  goldButton: {
    alignSelf: 'stretch',
    backgroundColor: GOLD,
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: 'center',
  },

  goldButtonText: {
    color: '#080808',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  headingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },

  subtitle: {
    color: '#BBBBBB',
    fontSize: 15,
    fontWeight: '700',
  },

  count: {
    color: '#888888',
    fontSize: 14,
  },

  card: {
    backgroundColor: '#151515',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#303030',
    marginBottom: 16,
    overflow: 'hidden',
  },

  cardTop: {
    flexDirection: 'row',
    padding: 14,
    gap: 14,
  },

  carImage: {
    width: 110,
    height: 82,
    borderRadius: 12,
    backgroundColor: '#202020',
  },

  cardTopInfo: {
    flex: 1,
    justifyContent: 'center',
  },

  carName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 8,
  },

  serviceType: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },

  requestCode: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },

  cardBody: {
    borderTopWidth: 1,
    borderTopColor: '#262626',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  infoLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    paddingVertical: 5,
  },

  infoLabel: {
    color: '#888888',
    fontSize: 14,
  },

  infoValue: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#262626',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  totalLabel: {
    color: '#888888',
    fontSize: 12,
  },

  totalValue: {
    color: GOLD,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },

  detailLink: {
    color: GOLD,
    fontSize: 15,
    fontWeight: '800',
  },

  notice: {
    color: '#777777',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
  },
});
