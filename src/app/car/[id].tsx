import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import { getCarBenefits, getCarById } from '@/services/car-service';
import { formatPricePerDay } from '@/utils/format-price';

const GOLD = '#D9B94E';

export default function CarDetailScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    id?: string | string[];
  }>();

  const carId = Array.isArray(params.id) ? params.id[0] : params.id;

  const car = carId ? getCarById(carId) : undefined;

  const benefits: string[] = car ? getCarBenefits(car) : [];

  if (!car) {
    return (
      <View style={styles.notFoundContainer}>
        <Text style={styles.notFoundTitle}>Không tìm thấy xe</Text>

        <Text style={styles.notFoundText}>
          Xe này không tồn tại hoặc đường dẫn chưa đúng.
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.back}>‹ Quay lại</Text>
      </TouchableOpacity>

      <View style={styles.imageBox}>
        <Text style={styles.carEmoji}>{car.icon}</Text>
      </View>

      <Text style={styles.tag}>{car.category.toUpperCase()}</Text>

      <Text style={styles.name}>{car.name}</Text>

      <Text style={styles.price}>
        {formatPricePerDay(car.pricePerDay)}
      </Text>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Thông tin xe</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Dòng xe</Text>
          <Text style={styles.infoValue}>{car.name}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phân loại</Text>
          <Text style={styles.infoValue}>{car.category}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Số chỗ</Text>
          <Text style={styles.infoValue}>{car.seats} chỗ</Text>
        </View>

        <View style={[styles.infoRow, styles.lastInfoRow]}>
          <Text style={styles.infoLabel}>Dịch vụ</Text>
          <Text style={styles.infoValue}>
            {car.serviceTypes.join(' / ')}
          </Text>
        </View>
      </View>

      <View style={styles.benefitBox}>
        <Text style={styles.infoTitle}>Quyền lợi</Text>

        {benefits.map((benefit: string) => (
          <Text key={benefit} style={styles.benefit}>
            ✓ {benefit}
          </Text>
        ))}
      </View>

      <TouchableOpacity style={styles.bookingButton}>
        <Text style={styles.bookingText}>ĐẶT XE NGAY</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        Eagle Capital Cars • Thuê xe sang - Nâng tầm hành trình
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
  },

  content: {
    padding: 20,
    paddingTop: 70,
    paddingBottom: 100,
  },

  back: {
    color: GOLD,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 25,
  },

  imageBox: {
    height: 270,
    backgroundColor: '#202020',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333333',
    marginBottom: 25,
  },

  carEmoji: {
    fontSize: 100,
  },

  tag: {
    color: GOLD,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 10,
  },

  name: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    marginBottom: 8,
  },

  price: {
    color: GOLD,
    fontSize: 25,
    fontWeight: '900',
    marginBottom: 28,
  },

  infoBox: {
    backgroundColor: '#151515',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#303030',
  },

  infoTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 16,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#292929',
  },

  lastInfoRow: {
    borderBottomWidth: 0,
  },

  infoLabel: {
    color: '#999999',
    fontSize: 15,
  },

  infoValue: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },

  benefitBox: {
    backgroundColor: '#151515',
    borderRadius: 20,
    padding: 20,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#303030',
  },

  benefit: {
    color: '#BBBBBB',
    fontSize: 15,
    marginBottom: 12,
  },

  bookingButton: {
    backgroundColor: GOLD,
    paddingVertical: 19,
    borderRadius: 16,
    alignItems: 'center',
  },

  bookingText: {
    color: '#080808',
    fontSize: 18,
    fontWeight: '900',
  },

  note: {
    color: '#777777',
    textAlign: 'center',
    marginTop: 22,
    fontSize: 13,
  },

  notFoundContainer: {
    flex: 1,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },

  notFoundTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },

  notFoundText: {
    color: '#999999',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 25,
  },

  backButton: {
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 14,
    paddingHorizontal: 30,
    paddingVertical: 14,
  },

  backButtonText: {
    color: GOLD,
    fontWeight: '900',
  },
});

