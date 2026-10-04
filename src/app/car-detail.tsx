import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function CarDetailScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.back}>‹  Quay lại</Text>

      <View style={styles.imageBox}>
        <Text style={styles.carEmoji}>🏎️</Text>
      </View>

      <Text style={styles.tag}>XE SANG</Text>

      <Text style={styles.name}>Porsche Panamera</Text>
      <Text style={styles.price}>4.500.000đ/ngày</Text>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Thông tin xe</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Dòng xe</Text>
          <Text style={styles.infoValue}>Porsche Panamera</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Số chỗ</Text>
          <Text style={styles.infoValue}>4 chỗ</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Dịch vụ</Text>
          <Text style={styles.infoValue}>Tự lái / Có lái</Text>
        </View>
      </View>

      <View style={styles.benefitBox}>
        <Text style={styles.infoTitle}>Quyền lợi</Text>
        <Text style={styles.benefit}>✓ Giao xe tận nơi</Text>
        <Text style={styles.benefit}>✓ Hỗ trợ 24/7</Text>
        <Text style={styles.benefit}>✓ Xe được vệ sinh trước khi giao</Text>
      </View>

      <TouchableOpacity style={styles.bookingButton}>
        <Text style={styles.bookingText}>ĐẶT XE NGAY</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        Eagle Cars • Thuê xe - Nâng tầm hành trình
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
    paddingBottom: 60,
  },

  back: {
    color: '#D9B94E',
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
    color: '#D9B94E',
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
    color: '#D9B94E',
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#292929',
  },

  infoLabel: {
    color: '#999999',
    fontSize: 15,
  },

  infoValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
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
    backgroundColor: '#D9B94E',
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
});