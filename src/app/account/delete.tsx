import { type Href, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAccount } from '@/hooks/use-account';
import { AccountError, deleteMyAccount } from '@/services/account-service';
import { goBackOr } from '@/utils/navigation';

const GOLD = '#D4AF37';
const ACCOUNT = '/account' as Href;

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { account } = useAccount();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ count: number; wasAccount: boolean } | undefined>();
  const busyRef = useRef(false);

  const loggedIn = account?.kind === 'phone' || account?.kind === 'email';

  const remove = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }

    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError('');

    try {
      const wasAccount = loggedIn;
      setDone({ count: await deleteMyAccount(), wasAccount });
    } catch (deleteError) {
      setError(
        deleteError instanceof AccountError
          ? deleteError.userMessage
          : 'Chưa xoá được. Vui lòng thử lại sau ít phút.'
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.back} onPress={() => goBackOr(router, ACCOUNT)}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
        <Text style={styles.title}>{(done?.wasAccount ?? loggedIn) ? 'XOÁ TÀI KHOẢN' : 'XOÁ DỮ LIỆU'}</Text>

        {done !== undefined ? (
          <>
            <View style={styles.successBox}>
              <Text style={styles.successText}>
                Đã xoá {done.wasAccount ? 'tài khoản' : 'dữ liệu'}.
                {done.count > 0 ? ` ${done.count} đơn cũ đã được ẩn thông tin cá nhân.` : ''}
              </Text>
            </View>
            <TouchableOpacity style={styles.goldButton} onPress={() => router.replace('/')}>
              <Text style={styles.goldButtonText}>VỀ TRANG CHỦ</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.box}>
              <Text style={styles.boxTitle}>Khi xoá, hệ thống sẽ:</Text>
              <Text style={styles.item}>
                • Xoá {loggedIn ? 'tài khoản đăng nhập bằng số điện thoại' : 'phiên đặt xe trên máy này'},
                thông báo trong ứng dụng và đăng ký nhận thông báo đẩy.
              </Text>
              <Text style={styles.item}>
                • Ẩn họ tên, số điện thoại, ghi chú và địa điểm nhận/trả trên các đơn cũ. Thông tin xe,
                thời gian, giá và trạng thái đơn được giữ lại cho sổ sách của Eagle Capital.
              </Text>
              <Text style={styles.item}>• Bạn sẽ không xem lại được các đơn cũ trong ứng dụng.</Text>
              <Text style={styles.item}>• Thao tác này không thể hoàn tác.</Text>
            </View>

            <Text style={styles.note}>
              Nếu còn đơn đang chờ xác nhận hoặc đã xác nhận chưa hoàn tất, hãy huỷ đơn đang chờ (hoặc
              liên hệ Eagle Capital với đơn đã xác nhận) trước khi xoá.
            </Text>

            {armed && (
              <Text style={styles.confirmText}>Bấm thêm một lần nữa để xác nhận xoá vĩnh viễn.</Text>
            )}

            <TouchableOpacity
              style={[styles.dangerButton, busy && styles.disabled]}
              onPress={remove}
              disabled={busy || !account || account.kind === 'none'}
            >
              <Text style={styles.dangerButtonText}>
                {busy ? 'ĐANG XOÁ...' : armed ? 'XÁC NHẬN XOÁ VĨNH VIỄN' : 'XOÁ'}
              </Text>
            </TouchableOpacity>

            {armed && !busy && (
              <TouchableOpacity onPress={() => setArmed(false)}>
                <Text style={styles.keep}>Không, giữ lại</Text>
              </TouchableOpacity>
            )}

            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  content: { padding: 20, paddingTop: 65, paddingBottom: 100 },
  back: { alignSelf: 'flex-start', marginBottom: 18 },
  backText: { color: GOLD, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 6, marginBottom: 16 },
  box: { backgroundColor: '#151515', borderRadius: 16, borderWidth: 1, borderColor: '#303030', padding: 16 },
  boxTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', marginBottom: 6 },
  item: { color: '#CCCCCC', fontSize: 14, lineHeight: 21, marginTop: 6 },
  note: { color: '#999999', fontSize: 13, lineHeight: 19, marginTop: 14 },
  confirmText: { color: '#FF8A80', fontSize: 14, fontWeight: '800', marginTop: 16 },
  dangerButton: {
    borderWidth: 1.5,
    borderColor: '#E5534B',
    backgroundColor: 'rgba(229, 83, 75, 0.12)',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
  },
  dangerButtonText: { color: '#FF8A80', fontWeight: '900', fontSize: 15 },
  disabled: { opacity: 0.6 },
  keep: { color: GOLD, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  errorBox: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  errorText: { color: '#FFB4AE', fontSize: 14, lineHeight: 20 },
  successBox: {
    backgroundColor: 'rgba(92, 201, 138, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(92, 201, 138, 0.5)',
    borderRadius: 14,
    padding: 14,
  },
  successText: { color: '#5CC98A', fontSize: 15, fontWeight: '700', lineHeight: 21 },
  goldButton: { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  goldButtonText: { color: '#080808', fontWeight: '900', fontSize: 15 },
});
