import { type Href, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ContactInline } from '@/components/contact-inline';
import { goBackOr } from '@/utils/navigation';

const GOLD = '#D4AF37';

export type LegalSection = { heading: string; paragraphs: string[] };

type LegalPageProps = {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
};

/** Trang văn bản (chính sách / điều khoản) hiển thị trong app. */
export function LegalPage({ title, updated, intro, sections }: LegalPageProps) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.back} onPress={() => goBackOr(router, '/account' as Href)}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.updated}>Cập nhật lần cuối: {updated}</Text>
        <Text style={styles.paragraph}>{intro}</Text>

        {sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.paragraphs.map((paragraph) => (
              <Text key={paragraph} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}

        <ContactInline label="Câu hỏi về văn bản này?" />
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
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginTop: 6 },
  updated: { color: '#888888', fontSize: 13, marginTop: 6, marginBottom: 10 },
  section: { marginTop: 18 },
  heading: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', marginBottom: 4 },
  paragraph: { color: '#CCCCCC', fontSize: 14, lineHeight: 22, marginTop: 6 },
});
