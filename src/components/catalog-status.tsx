import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { formatVnTime } from '@/utils/vn-time';

const GOLD = '#D4AF37';

/** Đang tải danh mục xe lần đầu. */
export function CatalogLoading() {
  return (
    <View style={styles.box}>
      <ActivityIndicator color={GOLD} />
      <Text style={styles.muted}>Đang tải danh sách xe…</Text>
    </View>
  );
}

/** Chưa từng tải được danh mục: không hiển thị xe nào, cho thử lại. */
export function CatalogError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Không tải được danh sách xe</Text>
      <Text style={styles.muted}>Vui lòng kiểm tra kết nối mạng rồi thử lại.</Text>
      <TouchableOpacity style={styles.retry} activeOpacity={0.8} onPress={onRetry}>
        <Text style={styles.retryText}>THỬ LẠI</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Đang hiển thị bản tải trước vì cập nhật thất bại. */
export function CatalogStaleNotice({ fetchedAt }: { fetchedAt?: number }) {
  return (
    <View style={styles.stale}>
      <Text style={styles.staleText}>
        ⚠ Chưa cập nhật được danh sách xe. Đang hiển thị dữ liệu tải lúc{' '}
        {fetchedAt ? formatVnTime(new Date(fetchedAt)) : '—'}; giá và tình trạng xe
        có thể đã thay đổi.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#151515',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#292929',
    padding: 22,
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', textAlign: 'center' },
  muted: { color: '#999999', fontSize: 14, textAlign: 'center' },
  retry: {
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 26,
  },
  retryText: { color: GOLD, fontWeight: '900' },
  stale: {
    backgroundColor: 'rgba(212, 175, 55, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.5)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  staleText: { color: GOLD, fontSize: 13, lineHeight: 19 },
});
