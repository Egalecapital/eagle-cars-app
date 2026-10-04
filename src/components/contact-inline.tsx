import { StyleSheet, Text, View } from 'react-native';

import { CONTACT_PHONE_DISPLAY } from '@/constants/contact';
import { callEagleCapital, openEagleCapitalZalo } from '@/utils/contact';

const GOLD = '#D4AF37';

type ContactInlineProps = {
  label?: string;
};

/** Dòng liên hệ nhỏ: "<label> Gọi 0877 522 222 · Zalo". */
export function ContactInline({ label = 'Cần hỗ trợ?' }: ContactInlineProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.text}>
        {label}{' '}
        <Text style={styles.link} onPress={callEagleCapital}>
          Gọi {CONTACT_PHONE_DISPLAY}
        </Text>
        {' · '}
        <Text style={styles.link} onPress={openEagleCapitalZalo}>
          Zalo
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 16,
    alignItems: 'center',
  },
  text: {
    color: '#999999',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  link: {
    color: GOLD,
    fontWeight: '800',
  },
});
