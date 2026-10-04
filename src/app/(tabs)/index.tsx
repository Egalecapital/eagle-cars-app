import { useRouter } from 'expo-router';
import {
  Image,
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

  const openCarDetail = (id: string) => {
    router.push({
      pathname: '/car/[id]',
      params: { id },
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {/* Nhấn giữ logo để vào khu quản trị (quyền kiểm tra ở server). */}
          <Text
            style={styles.brand}
            onLongPress={() => router.push('/admin/login')}
            suppressHighlighting
          >
            EAGLE CAPITAL CARS
          </Text>

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
            Xe Sang • Tự lái • Có lái • Xe Cưới • Xe Trưng Bày Sự Kiện
          </Text>

          <TouchableOpacity style={styles.goldButton}>
            <Text style={styles.goldButtonText}>
              ĐẶT XE NGAY
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Xe Nổi Bật
          </Text>

          <Text style={styles.sectionCount}>
            {cars.length} xe
          </Text>
        </View>

        {cars.map((car) => (
          <View
            style={styles.carCard}
            key={car.id}
          >
            <View style={styles.carImageContainer}>
              <Image
                source={car.image}
                style={styles.carImage}
                resizeMode="cover"
              />

              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>
                  {car.category}
                </Text>
              </View>
            </View>

            <View style={styles.carInfo}>
              <Text style={styles.carName}>
                {car.name}
              </Text>

              <Text style={styles.carMeta}>
                {car.year} • {car.seats} chỗ • {car.transmission}
              </Text>

              <Text style={styles.carPrice}>
                {formatPricePerDay(car.pricePerDay)}
              </Text>

              <View style={styles.serviceRow}>
                {car.serviceTypes.map((service) => (
                  <View
                    key={service}
                    style={styles.serviceBadge}
                  >
                    <Text style={styles.serviceText}>
                      {service}
                    </Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={styles.detailButton}
                onPress={() => openCarDetail(car.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.detailButtonText}>
                  XEM XE
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={styles.contact}>
          <Text style={styles.contactTitle}>
            Cần xe ngay hôm nay?
          </Text>

          <Text style={styles.contactText}>
            Liên hệ Eagle Capital Cars để được tư vấn và lựa chọn chiếc xe phù hợp.
          </Text>

          <TouchableOpacity style={styles.contactButton}>
            <Text style={styles.contactButtonText}>
              LIÊN HỆ EAGLE CAPITAL CARS
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
    paddingBottom: 120,
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
    marginTop: 5,
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
    lineHeight: 22,
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

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
  },

  sectionCount: {
    color: '#888888',
    fontSize: 14,
  },

  carCard: {
    backgroundColor: '#151515',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#292929',
  },

  carImageContainer: {
    height: 220,
    backgroundColor: '#202020',
  },

  carImage: {
    width: '100%',
    height: '100%',
  },

  categoryBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: GOLD,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  categoryText: {
    color: '#080808',
    fontSize: 12,
    fontWeight: '900',
  },

  carInfo: {
    padding: 18,
  },

  carName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },

  carMeta: {
    color: '#999999',
    fontSize: 14,
    marginTop: 7,
  },

  carPrice: {
    color: GOLD,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 10,
  },

  serviceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },

  serviceBadge: {
    backgroundColor: '#202020',
    borderWidth: 1,
    borderColor: '#333333',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },

  serviceText: {
    color: '#BBBBBB',
    fontSize: 12,
    fontWeight: '700',
  },

  detailButton: {
    marginTop: 18,
    borderWidth: 1.5,
    borderColor: GOLD,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },

  detailButtonText: {
    color: GOLD,
    fontWeight: '900',
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
    lineHeight: 20,
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