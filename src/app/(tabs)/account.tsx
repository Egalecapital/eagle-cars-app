import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ContactInline } from '@/components/contact-inline';
import { useAccount } from '@/hooks/use-account';
import { signOutCustomer } from '@/services/account-service';
import { formatVnPhone } from '@/utils/phone';

const GOLD = '#D4AF37';

// Route mới; typed routes có thể chưa sinh lại kịp nên ép kiểu Href.
const LOGIN = '/account/login' as Href;
const DELETE_ACCOUNT = '/account/delete' as Href;
const PRIVACY = '/legal/privacy' as Href;
const TERMS = '/legal/terms' as Href;

export default function AccountScreen() {
  const router = useRouter();
  const { account, loading } = useAccount();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  const signOut = async () => {
    setSigningOut(true);
    setError('');

    try {
      await signOutCustomer();
    } catch {
      setError('Chưa đăng xuất được. Vui lòng thử lại.');
    } finally {
      setSigningOut(false);
    }
  };

  const loggedIn = account?.kind === 'phone' || account?.kind === 'email';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
        <Text style={styles.title}>TÀI KHOẢN</Text>

        {loading && <ActivityIndicator color={GOLD} style={styles.loader} />}

        {!loading && !loggedIn && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Đăng nhập bằng số điện thoại</Text>
            <Text style={styles.cardText}>
              Giữ “Đơn của tôi” khi đổi điện thoại hoặc cài lại ứng dụng. Các đơn bạn đã gửi trên máy
              này sẽ được chuyển vào tài khoản sau khi đăng nhập.
            </Text>
            <Text style={styles.cardHint}>
              Không bắt buộc — bạn vẫn có thể đặt xe mà không cần đăng nhập.
            </Text>
            <TouchableOpacity style={styles.goldButton} onPress={() => router.push(LOGIN)}>
              <Text style={styles.goldButtonText}>ĐĂNG NHẬP / ĐĂNG KÝ</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && loggedIn && (
          <View style={styles.card}>
            <Text style={styles.label}>Đang đăng nhập</Text>
            <Text style={styles.phone}>
              {account.kind === 'phone' ? formatVnPhone(account.phone) : account.email}
            </Text>
            <Text style={styles.cardText}>
              Đơn đặt xe và thông báo của tài khoản này hiển thị trên mọi thiết bị đăng nhập cùng số.
            </Text>

            <TouchableOpacity
              style={[styles.outlineButton, signingOut && styles.disabled]}
              onPress={signOut}
              disabled={signingOut}
            >
              <Text style={styles.outlineButtonText}>{signingOut ? 'ĐANG ĐĂNG XUẤT...' : 'ĐĂNG XUẤT'}</Text>
            </TouchableOpacity>
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        )}

        <View style={styles.menu}>
          <MenuItem label="Chính sách quyền riêng tư" onPress={() => router.push(PRIVACY)} />
          <MenuItem label="Điều khoản sử dụng" onPress={() => router.push(TERMS)} />
          {!loading && account?.kind !== 'none' && (
            <MenuItem
              label={loggedIn ? 'Xoá tài khoản và dữ liệu' : 'Xoá dữ liệu đặt xe trên máy này'}
              danger
              onPress={() => router.push(DELETE_ACCOUNT)}
            />
          )}
        </View>

        <ContactInline />
      </ScrollView>
    </View>
  );
}

function MenuItem({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <Text style={[styles.menuText, danger && styles.menuDanger]}>{label}</Text>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  content: { paddingTop: 70, paddingHorizontal: 20, paddingBottom: 120 },
  eyebrow: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 6, marginBottom: 16 },
  loader: { marginTop: 30 },
  card: {
    backgroundColor: '#151515',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#303030',
    padding: 18,
  },
  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  cardText: { color: '#BBBBBB', fontSize: 14, lineHeight: 21, marginTop: 8 },
  cardHint: { color: '#888888', fontSize: 13, lineHeight: 19, marginTop: 8 },
  label: { color: '#888888', fontSize: 13, fontWeight: '700' },
  phone: { color: GOLD, fontSize: 24, fontWeight: '900', marginTop: 4 },
  goldButton: { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  goldButtonText: { color: '#080808', fontWeight: '900', fontSize: 15 },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: '#777777',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 16,
  },
  outlineButtonText: { color: '#CCCCCC', fontWeight: '900' },
  disabled: { opacity: 0.6 },
  error: { color: '#FF8A80', fontSize: 13, marginTop: 8 },
  menu: {
    backgroundColor: '#151515',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#303030',
    marginTop: 18,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#232323',
  },
  menuText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  menuDanger: { color: '#FF8A80' },
  menuArrow: { color: '#777777', fontSize: 20 },
});
