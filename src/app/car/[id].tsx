import { goBackOr } from '@/utils/navigation';
import { getCarBenefits, getCarById } from '@/services/car-service';
import { formatPricePerDay } from '@/utils/format-price';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const GOLD = '#D4AF37';

export default function CarDetailScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    id?: string | string[];
  }>();

  const carId = Array.isArray(params.id) ? params.id[0] : params.id;

  const car = carId ? getCarById(carId) : undefined;

  if (!car) {
    return (
      <View style={styles.notFoundContainer}>
        <Text style={styles.notFoundTitle}>Không tìm thấy xe</Text>

        <Text style={styles.notFoundText}>
          Xe này không tồn tại hoặc hiện không còn trong danh sách.
        </Text>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => goBackOr(router, '/explore')}
        >
          <Text style={styles.backButtonText}>QUAY LẠI</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const benefits = getCarBenefits(car);

  const handleBooking = () => {
    router.push({
      pathname: '/booking/[carId]',
      params: {
        carId: car.id,
      },
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.topBackButton}
          onPress={() => goBackOr(router, '/explore')}
        >
          <Text style={styles.back}>← Quay lại</Text>
        </TouchableOpacity>

        <View style={styles.imageBox}>
          <Image
            source={car.image}
            style={styles.carImage}
            resizeMode="cover"
          />

          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>
              {car.category}
            </Text>
          </View>
        </View>

        <Text style={styles.brand}>EAGLE CAPITAL CARS</Text>

        <Text style={styles.name}>{car.name}</Text>

        <Text style={styles.price}>
          {formatPricePerDay(car.pricePerDay)}
        </Text>

        <Text style={styles.description}>
          {car.description}
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Thông tin xe</Text>

          <InfoRow
            label="Dòng xe"
            value={car.category}
          />

          <InfoRow
            label="Số chỗ"
            value={`${car.seats} chỗ`}
          />

          <View style={styles.lastInfoRow}>
            <Text style={styles.infoLabel}>Dịch vụ</Text>

            <Text style={styles.infoValue}>
              {car.serviceTypes.join(' • ')}
            </Text>
          </View>
        </View>

        <View style={styles.featureBox}>
          <Text style={styles.infoTitle}>Điểm nổi bật</Text>

          {car.features.map((feature) => (
            <View
              key={feature}
              style={styles.checkRow}
            >
              <Text style={styles.check}>✓</Text>

              <Text style={styles.checkText}>
                {feature}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.benefitBox}>
          <Text style={styles.infoTitle}>
            Quyền lợi khi thuê xe
          </Text>

          {benefits.map((benefit) => (
            <View
              key={benefit}
              style={styles.checkRow}
            >
              <Text style={styles.check}>✓</Text>

              <Text style={styles.checkText}>
                {benefit}
              </Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.bookingButton}
          activeOpacity={0.8}
          onPress={handleBooking}
        >
          <Text style={styles.bookingText}>
            ĐẶT XE NGAY
          </Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          Eagle Capital Cars • Thuê xe sang • Nâng tầm hành trình
        </Text>
      </ScrollView>
    </View>
  );
}

type InfoRowProps = {
  label: string;
  value: string;
};

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>
        {label}
      </Text>

      <Text style={styles.infoValue}>
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
    padding: 20,
    paddingTop: 65,
    paddingBottom: 100,
  },

  topBackButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
  },

  back: {
    color: GOLD,
    fontSize: 17,
    fontWeight: '800',
  },

  imageBox: {
    height: 280,
    backgroundColor: '#202020',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333333',
    marginBottom: 24,
  },

  carImage: {
    width: '100%',
    height: '100%',
  },

  categoryBadge: {
    position: 'absolute',
    top: 15,
    left: 15,
    backgroundColor: GOLD,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },

  categoryBadgeText: {
    color: '#080808',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },

  brand: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
  },

  name: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 39,
  },

  price: {
    color: GOLD,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 8,
  },

  description: {
    color: '#AAAAAA',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 16,
    marginBottom: 26,
  },

  infoBox: {
    backgroundColor: '#151515',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#303030',
  },

  featureBox: {
    backgroundColor: '#151515',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#303030',
  },

  benefitBox: {
    backgroundColor: '#151515',
    borderRadius: 20,
    padding: 20,
    marginBottom: 25,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 20,
    paddingTop: 12,
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

  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },

  check: {
    color: GOLD,
    fontSize: 16,
    fontWeight: '900',
    marginRight: 10,
  },

  checkText: {
    flex: 1,
    color: '#BBBBBB',
    fontSize: 15,
    lineHeight: 21,
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