import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const GOLD = '#D4AF37';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
      <Text style={styles.title}>Không tìm thấy trang</Text>
      <Text style={styles.text}>
        Đường dẫn không tồn tại hoặc đã thay đổi.
      </Text>

      <TouchableOpacity
        style={styles.button}
        activeOpacity={0.8}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.buttonText}>VỀ TRANG CHỦ</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  eyebrow: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginTop: 10 },
  text: { color: '#999999', fontSize: 15, textAlign: 'center', marginTop: 10, marginBottom: 26 },
  button: { backgroundColor: GOLD, paddingVertical: 15, paddingHorizontal: 30, borderRadius: 14 },
  buttonText: { color: '#080808', fontSize: 15, fontWeight: '900' },
});
