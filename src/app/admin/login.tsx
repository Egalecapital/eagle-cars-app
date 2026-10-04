import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  AdminAuthError,
  checkIsAdmin,
  signInAdmin,
} from '@/services/admin-auth-service';

const GOLD = '#D4AF37';

// Typed routes đôi khi chỉ sinh '/admin/index'; URL thật của danh sách đơn là '/admin'.
const ADMIN_HOME = '/admin' as Href;

export default function AdminLoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  // Đã là admin → vào thẳng danh sách đơn.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      checkIsAdmin()
        .then((isAdmin) => {
          if (active && isAdmin) router.replace(ADMIN_HOME);
        })
        .catch(() => undefined);

      return () => {
        active = false;
      };
    }, [router])
  );

  const handleLogin = async () => {
    if (submittingRef.current) return;

    if (!email.trim() || !password) {
      setError('Vui lòng nhập email và mật khẩu.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError('');

    try {
      await signInAdmin(email, password);
      setPassword('');
      router.replace(ADMIN_HOME);
    } catch (loginError) {
      setError(
        loginError instanceof AdminAuthError
          ? loginError.userMessage
          : 'Đăng nhập chưa thành công. Vui lòng thử lại.'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/')}>
          <Text style={styles.backText}>← Về ứng dụng khách</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
        <Text style={styles.title}>QUẢN TRỊ</Text>
        <Text style={styles.subtitle}>Đăng nhập bằng tài khoản quản trị viên.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="admin@example.com"
          placeholderTextColor="#777777"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="username"
          style={styles.input}
        />

        <Text style={styles.label}>Mật khẩu</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor="#777777"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          style={styles.input}
          onSubmitEditing={handleLogin}
        />

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          activeOpacity={0.8}
          onPress={handleLogin}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>
            {submitting ? 'ĐANG ĐĂNG NHẬP...' : 'ĐĂNG NHẬP'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.notice}>
          Lưu ý: đăng nhập quản trị sẽ thay phiên khách trên thiết bị này. Nên dùng
          một thiết bị hoặc trình duyệt riêng cho quản trị.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  content: { padding: 20, paddingTop: 65, paddingBottom: 80 },
  backButton: { alignSelf: 'flex-start', marginBottom: 24 },
  backText: { color: GOLD, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#999999', fontSize: 15, marginTop: 6, marginBottom: 28 },
  label: { color: '#BBBBBB', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  input: {
    minHeight: 54,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 14,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  errorText: { color: '#FFB4AE', fontSize: 14, lineHeight: 20 },
  button: {
    backgroundColor: GOLD,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#080808', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  notice: { color: '#777777', fontSize: 13, lineHeight: 19, marginTop: 20, textAlign: 'center' },
});
