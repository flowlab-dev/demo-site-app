// Public web demo only: on a computer the app sits in a phone-sized frame with a
// short explanation and a button that shows the offline screen (hard to try in a
// browser otherwise). On a phone-sized screen — the app alone, full screen.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { isDemo, withPreview } from '../preview';
import { site } from '../site.config.ts';
import { palettes, type as t } from './theme.ts';

const shown = withPreview(site);
const PAL = palettes(shown.accent, shown.accentDark);

export const DEMO_OFFLINE = 'kit-demo-offline';

export function DemoFrame({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const p = useColorScheme() === 'dark' ? PAL.dark : PAL.light;
  if (!isDemo || width < 760) return <>{children}</>;
  const phoneH = Math.min(844, height - 48);
  return (
    <View style={[s.page, { backgroundColor: p.bg }]}>
      <View testID="demo-phone" style={[s.phone, { height: phoneH, borderColor: p.line, backgroundColor: p.surface }]}>{children}</View>
      <View style={s.side}>
        <Text accessibilityRole="header" style={[t.title, { color: p.ink }]}>Your website, as a real app</Text>
        <Text style={[t.body, { color: p.muted }]}>
          This is a live demo of our iOS / Android app shell running a sample bakery website (Crumb & Co is fictional).
          On a phone it is a native app from the App Store and Google Play.
        </Text>
        <View style={s.list}>
          {[
            'Native tab bar — the site’s own header and footer are hidden',
            'Other sites, maps, phone and files open outside; the app stays put',
            'No internet? Contacts and one-tap call still work',
            'Push notifications and links into the app (optional)',
          ].map((x) => <Text key={x} style={[t.body, { color: p.ink }]}>•  {x}</Text>)}
        </View>
        <Pressable
          testID="demo-offline"
          accessibilityRole="button"
          onPress={() => window.dispatchEvent(new Event(DEMO_OFFLINE))}
          style={({ pressed }) => [s.btn, { borderColor: p.accent, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[t.body, { color: p.accent, fontWeight: '600' }]}>Show the “no internet” screen</Text>
        </Pressable>
        <Text style={[t.caption, { color: p.muted }]}>Demo by Flow Lab · flowlab-dev.github.io</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 56, padding: 24 },
  phone: { width: 390, borderWidth: 10, borderRadius: 48, overflow: 'hidden' },
  side: { maxWidth: 420, gap: 16 },
  list: { gap: 8 },
  btn: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingHorizontal: 20, borderRadius: 14, borderWidth: 1.5 },
});
