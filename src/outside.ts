// Hand a link to the phone: system browser, dialer, mail, Maps… Rejects when the
// phone cannot open it (e.g. tel: on an iPad) — the caller decides what to show.
import { Linking } from 'react-native';

export const openOutside = (url: string): Promise<void> => Linking.openURL(url);
