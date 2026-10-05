import { type Href, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
  AccountError,
  hasPendingClaim,
  retryClaim,
  sendLoginOtp,
  verifyLoginOtp,
} from '@/services/account-service';
import { registerForPush } from '@/services/push-service';
import { goBackOr } from '@/utils/navigation';
import { formatVnPhone, normalizeVnMobile } from '@/utils/phone';

const GOLD = '#D4AF37';
const RESEND_SECONDS = 60;
const ACCOUNT = '/account' as Href;

type Step = 'phone' | 'code' | 'done';

const toMessage = (error: unknown) =>
  error instanceof AccountError ? error.userMessage : 'Chưa thực hiện được. Vui lòng thử lại.';

export default function LoginScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phoneText, setPhoneText] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [claimError, setClaimError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;

    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);

    return () => clearTimeout(timer);
  }, [resendIn]);

  const normalized = normalizeVnMobile(phoneText);
  const phoneError =
    phoneText.trim() && !normalized ? 'Số di động Việt Nam gồm 10 số, ví dụ 0912 345 678.' : '';

  const run = async (task: () => Promise<void>) => {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError('');

    try {
      await task();
    } catch (taskError) {
      setError(toMessage(taskError));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const sendCode = (target: string) =>
    run(async () => {
      await sendLoginOtp(target);
      setPhone(target);
      setCode('');
      setStep('code');
      setResendIn(RESEND_SECONDS);
    });

  const verify = () =>
    run(async () => {
      if (!/^\d{6}$/.test(code.trim())) {
        setError('Mã OTP gồm 6 chữ số.');
        return;
      }

      const login = await verifyLoginOtp(phone, code);

      setResult(
        login.claimedBookings
          ? `Đăng nhập thành công. Đã chuyển ${login.claimedBookings} đơn trên máy này vào tài khoản.`
          : 'Đăng nhập thành công.'
      );
      setClaimError(login.claimError ?? '');
      setStep('done');

      // Push: chỉ đăng ký nếu người dùng đã cho phép trước đó; không hỏi quyền ở đây.
      registerForPush(false).catch(() => {});
    });

  const retry = () =>
    run(async () => {
      try {
        const count = await retryClaim();
        setClaimError('');
        setResult(`Đăng nhập thành công. Đã chuyển ${count} đơn trên máy này vào tài khoản.`);
      } catch (retryError) {
        setClaimError(toMessage(retryError));
      }
    });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => goBackOr(router, ACCOUNT)}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
        <Text style={styles.title}>ĐĂNG NHẬP</Text>

        {step === 'phone' && (
          <>
            <Text style={styles.text}>
              Nhập số điện thoại di động. Chúng tôi sẽ gửi mã OTP 6 số qua tin nhắn SMS.
            </Text>
            <Text style={styles.label}>Số điện thoại</Text>
            <TextInput
              value={phoneText}
              onChangeText={setPhoneText}
              placeholder="0912 345 678"
              placeholderTextColor="#666666"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              style={styles.input}
            />
            {!!phoneError && <Text style={styles.fieldError}>{phoneError}</Text>}

            <TouchableOpacity
              style={[styles.goldButton, (busy || !normalized) && styles.disabled]}
              disabled={busy || !normalized}
              onPress={() => normalized && sendCode(normalized)}
            >
              <Text style={styles.goldButtonText}>{busy ? 'ĐANG GỬI MÃ...' : 'GỬI MÃ OTP'}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'code' && (
          <>
            <Text style={styles.text}>
              Đã gửi mã tới <Text style={styles.strong}>{formatVnPhone(phone)}</Text>. Mã có hiệu lực
              trong vài phút.
            </Text>
            <Text style={styles.label}>Mã OTP</Text>
            <TextInput
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              placeholderTextColor="#666666"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
              style={[styles.input, styles.codeInput]}
            />

            <TouchableOpacity
              style={[styles.goldButton, (busy || code.length !== 6) && styles.disabled]}
              disabled={busy || code.length !== 6}
              onPress={verify}
            >
              <Text style={styles.goldButtonText}>{busy ? 'ĐANG XÁC THỰC...' : 'XÁC NHẬN'}</Text>
            </TouchableOpacity>

            <View style={styles.row}>
              <TouchableOpacity disabled={busy || resendIn > 0} onPress={() => sendCode(phone)}>
                <Text style={[styles.link, (busy || resendIn > 0) && styles.linkDisabled]}>
                  {resendIn > 0 ? `Gửi lại mã sau ${resendIn}s` : 'Gửi lại mã'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={busy}
                onPress={() => {
                  setStep('phone');
                  setError('');
                }}
              >
                <Text style={styles.link}>Đổi số điện thoại</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 'done' && (
          <>
            <View style={styles.successBox}>
              <Text style={styles.successText}>{result}</Text>
            </View>

            {!!claimError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>Chưa chuyển được các đơn cũ trên máy này: {claimError}</Text>
                {hasPendingClaim() && (
                  <TouchableOpacity onPress={retry} disabled={busy}>
                    <Text style={styles.retryText}>{busy ? 'Đang thử lại...' : 'Thử lại'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <TouchableOpacity style={styles.goldButton} onPress={() => goBackOr(router, ACCOUNT)}>
              <Text style={styles.goldButtonText}>XONG</Text>
            </TouchableOpacity>
          </>
        )}

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  content: { padding: 20, paddingTop: 65, paddingBottom: 100 },
  back: { alignSelf: 'flex-start', marginBottom: 18 },
  backText: { color: GOLD, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 6, marginBottom: 12 },
  text: { color: '#BBBBBB', fontSize: 15, lineHeight: 22 },
  strong: { color: '#FFFFFF', fontWeight: '900' },
  label: { color: '#BBBBBB', fontSize: 13, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  input: {
    minHeight: 52,
    backgroundColor: '#0E0E0E',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 17,
  },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  fieldError: { color: '#FF7B72', fontSize: 13, marginTop: 6 },
  goldButton: { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  goldButtonText: { color: '#080808', fontWeight: '900', fontSize: 15 },
  disabled: { opacity: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  link: { color: GOLD, fontWeight: '800', fontSize: 14 },
  linkDisabled: { color: '#777777' },
  successBox: {
    backgroundColor: 'rgba(92, 201, 138, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(92, 201, 138, 0.5)',
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
  },
  successText: { color: '#5CC98A', fontSize: 15, fontWeight: '700', lineHeight: 21 },
  errorBox: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  errorText: { color: '#FFB4AE', fontSize: 14, lineHeight: 20 },
  retryText: { color: GOLD, fontWeight: '900', marginTop: 8 },
});
