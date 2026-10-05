import { Image, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import type { CarImageSource } from '@/types/car';
import { CAR_IMAGE_BACKGROUND } from '@/utils/car-image-crop';

const GOLD = '#D4AF37';

/** Tỉ lệ khung ảnh xe chuẩn; ảnh admin tải lên được dựng đúng tỉ lệ này. */
export const CAR_PHOTO_ASPECT = 16 / 10;

type CarPhotoProps = {
  source?: CarImageSource;
  /** Kích thước / bo góc của khung (khung luôn giữ tỉ lệ 16:10). */
  style?: StyleProp<ViewStyle>;
  /** Khung nhỏ (ảnh thu nhỏ trong danh sách): chữ chờ ảnh gọn hơn. */
  compact?: boolean;
};

/**
 * Ảnh xe trong khung 16:10, hiển thị TRỌN xe (contain) trên nền tối: không
 * phóng / cắt xe trên web hay màn hình rộng. Ảnh tải lên đã đúng 16:10 nên
 * lấp kín khung; ảnh cũ khác tỉ lệ chỉ có viền nền tối nhỏ.
 * Chưa có ảnh → khung chờ ảnh.
 */
export function CarPhoto({ source, style, compact }: CarPhotoProps) {
  return (
    <View style={[styles.frame, style]}>
      {source ? (
        <Image source={source} style={styles.image} resizeMode="contain" />
      ) : (
        <View style={styles.placeholder}>
          <Text style={[styles.brand, compact && styles.brandCompact]}>EAGLE CAPITAL</Text>
          {!compact && <Text style={styles.pending}>Ảnh xe đang cập nhật</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: CAR_PHOTO_ASPECT,
    backgroundColor: CAR_IMAGE_BACKGROUND,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  brand: { color: GOLD, fontSize: 15, fontWeight: '900', letterSpacing: 2 },
  brandCompact: { fontSize: 9, letterSpacing: 1, textAlign: 'center' },
  pending: { color: '#777777', fontSize: 12, marginTop: 6 },
});
