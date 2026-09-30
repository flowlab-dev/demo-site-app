// Push notifications (optional, `push.enabled`). The token goes to the CLIENT's
// endpoint; the client sends pushes through Expo's push service from their side
// (or we add a small admin form as a separate stage). Tapping a notification
// with data.url opens that page in the app.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { SiteConfig } from './site.config.ts';

const SENT = 'siteapp.pushToken';
const ASKED = 'siteapp.pushAsked';

export function listenForTaps(onUrl: (url: string) => void): () => void {
  const open = (r: Notifications.NotificationResponse | null) => {
    const url = r?.notification.request.content.data?.url;
    if (typeof url === 'string') onUrl(url);
  };
  Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}

// Called once the first page has loaded: the permission prompt then appears
// over real content, not over a splash screen. Asks once; re-sends the token only if it changed.
export async function registerPush(cfg: SiteConfig): Promise<void> {
  if (!cfg.push.enabled || !cfg.push.registerUrl) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Updates', importance: Notifications.AndroidImportance.DEFAULT });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    if (await AsyncStorage.getItem(ASKED)) return;          // asked before and declined — respect it
    await AsyncStorage.setItem(ASKED, '1');
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;                                    // not an EAS build (e.g. Expo Go)
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if ((await AsyncStorage.getItem(SENT)) === token) return;
  const res = await fetch(cfg.push.registerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: Platform.OS, app: cfg.appName }),
  });
  if (res.ok) await AsyncStorage.setItem(SENT, token);
}
