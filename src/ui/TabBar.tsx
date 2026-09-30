// Native bottom tab bar — replaces the site's own menu inside the app.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Tab } from '../site.config.ts';
import { Icon } from './Icons.tsx';
import type { Palette } from './theme.ts';

export function TabBar({ tabs, active, onPress, p }: { tabs: Tab[]; active: number; onPress: (i: number) => void; p: Palette }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[s.bar, { backgroundColor: p.surface, borderTopColor: p.line, paddingBottom: Math.max(insets.bottom, 6) }]}
    >
      {tabs.map((t, i) => {
        const on = i === active;
        const colour = on ? p.accent : p.muted;
        return (
          <Pressable
            key={t.title + i}
            testID={`tab-${i}`}
            accessibilityRole={t.kind === 'page' ? 'tab' : 'button'}
            aria-selected={t.kind === 'page' ? on : undefined}
            accessibilityLabel={t.title}
            onPress={() => onPress(i)}
            style={({ pressed }) => [s.item, pressed && { opacity: 0.6 }]}
          >
            <View style={[s.pill, on && { backgroundColor: p.accentSoft }]}>
              <Icon name={t.icon} color={colour} />
            </View>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[s.label, { color: colour }, on && s.labelOn]}>{t.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 52, gap: 2 },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '500' },
  labelOn: { fontWeight: '700' },
});
