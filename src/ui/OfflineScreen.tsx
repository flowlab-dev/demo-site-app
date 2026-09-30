// Shown when the site cannot load — no internet (offline) or the site itself
// answers with an error (server). The business stays reachable either way:
// call / email work without internet — a native feature, not a blank page.
// Scrolls, so large text sizes and iPad split view never push buttons off screen.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SiteConfig } from '../site.config.ts';
import type { Failure } from '../web/types.ts';
import { openOutside } from '../outside';
import { Icon } from './Icons.tsx';
import { radius, space, TAP, type, type Palette } from './theme.ts';

type Props = {
  cfg: SiteConfig; p: Palette; why: Failure; retrying: boolean;
  onRetry: () => void; onCall: (phone: string) => void; canDial: boolean;
};

export function OfflineScreen({ cfg, p, why, onRetry, retrying, onCall, canDial }: Props) {
  const { contact, texts } = cfg;
  const offline = why === 'offline';
  return (
    <ScrollView testID="offline" style={{ backgroundColor: p.bg }} contentContainerStyle={s.wrap}>
      <View style={[s.badge, { backgroundColor: p.accentSoft }]}>
        <Icon name={offline ? 'wifiOff' : 'info'} size={30} color={p.accent} />
      </View>
      <Text accessibilityRole="header" style={[type.title, s.center, { color: p.ink }]}>{offline ? texts.offlineTitle : texts.serverTitle}</Text>
      <Text style={[type.body, s.center, { color: p.muted }]}>{offline ? texts.offlineBody : texts.serverBody}</Text>

      <View style={s.actions}>
        {contact.phone ? (
          canDial
            ? <Btn p={p} icon="phone" label={`${texts.call} ${contact.phone}`} onPress={() => onCall(contact.phone!)} />
            : <Text selectable style={[type.body, s.center, { color: p.ink }]}>{contact.phone}</Text>
        ) : null}
        {contact.email ? (
          <Btn p={p} icon="mail" label={`${texts.email} ${contact.email}`} onPress={() => { openOutside('mailto:' + contact.email).catch(() => {}); }} />
        ) : null}
      </View>
      {contact.address || contact.hours ? (
        <Text style={[type.caption, s.center, { color: p.muted }]}>{[contact.address, contact.hours].filter(Boolean).join(' · ')}</Text>
      ) : null}

      <Pressable
        testID="retry"
        accessibilityRole="button"
        accessibilityState={{ busy: retrying }}
        disabled={retrying}
        onPress={onRetry}
        style={({ pressed }) => [s.primary, { backgroundColor: p.accent, opacity: pressed || retrying ? 0.7 : 1 }]}
      >
        <Icon name="refresh" size={20} color={p.onAccent} />
        <Text style={[type.body, s.bold, { color: p.onAccent }]}>{retrying ? texts.loading + '…' : texts.retry}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Btn({ p, icon, label, onPress }: { p: Palette; icon: 'phone' | 'mail'; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [s.secondary, { borderColor: p.line, backgroundColor: p.surface, opacity: pressed ? 0.7 : 1 }]}
    >
      <Icon name={icon} size={20} color={p.accent} />
      <Text style={[type.body, { color: p.ink, flexShrink: 1 }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  center: { textAlign: 'center', maxWidth: 420 },
  actions: { alignSelf: 'stretch', maxWidth: 420, width: '100%', marginHorizontal: 'auto', gap: space.sm, marginTop: space.sm },
  secondary: { minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderRadius: radius.md },
  primary: { minHeight: TAP, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg, borderRadius: radius.md, marginTop: space.sm, minWidth: 200 },
  bold: { fontWeight: '600' },
});
