import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { getAllCars } from '@/services/car-service';
import { formatPricePerDay } from '@/utils/format-price';

const GOLD = '#D4AF37';

const cars = getAllCars();

const filters = ['Tất cả', 'Xe sang', 'SUV', 'Sedan', 'Tự lái', 'Xe cưới'];

export default function ExploreScreen() {
  const router = useRouter();

  const [selectedFilter, setSelectedFilter] = useState('Tất cả');
  const [search, setSearch] = useState('');

  const filteredCars = cars.filter((car) => {
    const matchesFilter =
      selectedFilter === 'Tất cả' ||
      (selectedFilter === 'Tự lái'
        ? car.serviceTypes.includes('Tự lái')
        : selectedFilter === 'Xe cưới'
          ? car.serviceTypes.includes('Xe cưới')
          : car.category === selectedFilter);

    const matchesSearch = car.name
      .toLowerCase()
      .includes(search.trim().toLowerCase());

    return matchesFilter && matchesSearch;
  });

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
        <Text style={styles.logo}>EAGLE CARS</Text>

        <Text style={styles.subtitle}>
          Chọn xe cho hành trình của bạn
        </Text>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Tìm Porsche, BMW, Mercedes..."
            placeholderTextColor="#777777"
            style={styles.searchInput}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {filters.map((filter) => {
            const active = selectedFilter === filter;

            return (
              <TouchableOpacity
                key={filter}
                onPress={() => setSelectedFilter(filter)}
                style={[
                  styles.filterButton,
                  active && styles.filterButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    active && styles.filterTextActive,
                  ]}
                >
                  {filter}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.headingRow}>
          <Text style={styles.heading}>Danh sách xe</Text>

          <Text style={styles.count}>
            {filteredCars.length} xe
          </Text>
        </View>

        {filteredCars.map((car) => (
          <View
            key={car.id}
            style={styles.card}
          >
            <View style={styles.imageArea}>
              <Image
                source={car.image}
                style={styles.carImage}
                resizeMode="cover"
              />

              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {car.category}
                </Text>
              </View>
            </View>

            <View style={styles.cardContent}>
              <Text style={styles.carName}>
                {car.name}
              </Text>

              <Text style={styles.carMeta}>
                {car.year} • {car.seats} chỗ • {car.transmission}
              </Text>

              <Text style={styles.price}>
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

              <View style={styles.infoRow}>
                <Text style={styles.info}>
                  ✓ Giao xe tận nơi
                </Text>

                <Text style={styles.info}>
                  ✓ Hỗ trợ 24/7
                </Text>
              </View>

              <TouchableOpacity
                style={styles.button}
                onPress={() => openCarDetail(car.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>
                  XEM XE
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {filteredCars.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              Không tìm thấy xe
            </Text>

            <Text style={styles.emptyText}>
              Thử tìm kiếm bằng tên xe khác hoặc chọn bộ lọc khác.
            </Text>
          </View>
        )}

        <View style={styles.bottomSpace} />
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
  },

  logo: {
    color: GOLD,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 1,
  },

  subtitle: {
    color: '#999999',
    fontSize: 16,
    marginTop: 5,
    marginBottom: 25,
  },

  searchBox: {
    height: 58,
    borderRadius: 16,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#303030',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },

  searchIcon: {
    color: GOLD,
    fontSize: 26,
    marginRight: 10,
  },

  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },

  filters: {
    paddingVertical: 20,
    gap: 10,
  },

  filterButton: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 30,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#333333',
  },

  filterButtonActive: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },

  filterText: {
    color: '#AAAAAA',
    fontWeight: '700',
  },

  filterTextActive: {
    color: '#080808',
  },

  headingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },

  heading: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },

  count: {
    color: '#888888',
    fontSize: 14,
  },

  card: {
    overflow: 'hidden',
    backgroundColor: '#141414',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#303030',
    marginBottom: 20,
  },

  imageArea: {
    height: 220,
    backgroundColor: '#202020',
  },

  carImage: {
    width: '100%',
    height: '100%',
  },

  badge: {
    position: 'absolute',
    top: 15,
    left: 15,
    backgroundColor: GOLD,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  badgeText: {
    color: '#080808',
    fontSize: 12,
    fontWeight: '900',
  },

  cardContent: {
    padding: 18,
  },

  carName: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '900',
  },

  carMeta: {
    color: '#999999',
    fontSize: 14,
    marginTop: 7,
  },

  price: {
    color: GOLD,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 8,
  },

  serviceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 15,
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

  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    marginTop: 15,
  },

  info: {
    color: '#AAAAAA',
    fontSize: 12,
  },

  button: {
    marginTop: 18,
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },

  buttonText: {
    color: GOLD,
    fontSize: 15,
    fontWeight: '900',
  },

  empty: {
    paddingVertical: 60,
    alignItems: 'center',
  },

  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  emptyText: {
    color: '#888888',
    marginTop: 8,
    textAlign: 'center',
  },

  bottomSpace: {
    height: 120,
  },
});