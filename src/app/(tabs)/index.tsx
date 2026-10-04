import { useRouter } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { getFeaturedCars } from '@/services/car-service';
import { formatPricePerDay } from '@/utils/format-price';

const GOLD = '#D4AF37';

export default function HomeScreen() {
  const router = useRouter();
  const cars = getFeaturedCars();

  const openCarDetail = (carId: string) => {
    router.push({
      pathname: '/car/[id]',
      params: { id: carId },
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>EAGLE CAPITAL CARS</Text>
          <Text style={styles.slogan}>
            THUÊ XE SANG • NÂNG TẦM TRẢI NGHIỆM
          </Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroSmall}>EAGLE CAPITAL</Text>

          <Text style={styles.heroTitle}>
            Bạn cần thuê xe?{'\n'}Hãy để Eagle Capital Cars lo.
          </Text>

          <Text style={styles.heroText}>
            Xe Sang • Tự lái • Xe Cưới • Xe Trưng Bày Sự Kiện
          </Text>

          <TouchableOpacity style={styles.goldButton}>
            <Text style={styles.goldButtonText}>ĐẶT XE NGAY</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Xe Nổi Bật</Text>

        {cars.map((car) => (
          <View style={styles.carCard} key={car.id}>
            <View style={styles.carImage}>
              <Text style={styles.carIcon}>{car.icon}</Text>
            </View>

            <View style={styles.carInfo}>
              <Text style={styles.carName}>{car.name}</Text>

              <Text style={styles.carPrice}>
                {formatPricePerDay(car.pricePerDay)}
              </Text>

              <TouchableOpacity
                style={styles.detailButton}
                onPress={() => openCarDetail(car.id)}
              >
                <Text style={styles.detailButtonText}>Xem xe</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={styles.contact}>
          <Text style={styles.contactTitle}>
            Cần xe ngay hôm nay?
          </Text>

          <Text style={styles.contactText}>
            Liên hệ Eagle Capital Luxury Cars để được tư vấn.
          </Text>

          <TouchableOpacity style={styles.contactButton}>
            <Text style={styles.contactButtonText}>
              LIÊN HỆ EAGLE CAPITAL LUXURY CARS
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    paddingBottom: 80,
  },

  header: {
    marginBottom: 25,
  },

  brand: {
    color: GOLD,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 1,
  },

  slogan: {
    color: '#AAAAAA',
    fontSize: 14,
    marginTop: 4,
  },

  hero: {
    backgroundColor: '#151515',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#292929',
    marginBottom: 35,
  },

  heroSmall: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 12,
  },

  heroTitle: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 41,
  },

  heroText: {
    color: '#AAAAAA',
    fontSize: 15,
    marginTop: 14,
    marginBottom: 22,
  },

  goldButton: {
    backgroundColor: GOLD,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },

  goldButtonText: {
    color: '#080808',
    fontSize: 15,
    fontWeight: '900',
  },

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 16,
  },

  carCard: {
    backgroundColor: '#151515',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#292929',
  },

  carImage: {
    height: 145,
    backgroundColor: '#202020',
    alignItems: 'center',
    justifyContent: 'center',
  },

  carIcon: {
    fontSize: 65,
  },

  carInfo: {
    padding: 18,
  },

  carName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  carPrice: {
    color: GOLD,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 7,
  },

  detailButton: {
    marginTop: 15,
    borderWidth: 1,
    borderColor: GOLD,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },

  detailButtonText: {
    color: GOLD,
    fontWeight: '800',
  },

  contact: {
    marginTop: 25,
    backgroundColor: GOLD,
    borderRadius: 22,
    padding: 22,
  },

  contactTitle: {
    color: '#080808',
    fontSize: 22,
    fontWeight: '900',
  },

  contactText: {
    color: '#222222',
    fontSize: 14,
    marginTop: 7,
    marginBottom: 18,
  },

  contactButton: {
    backgroundColor: '#080808',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },

  contactButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});