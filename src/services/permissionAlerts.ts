import { Alert, Linking } from 'react-native';

import i18n from '../i18n';

/**
 * One place for "permission denied" messages. Each kind is announced at most once per
 * app session, so a screen that reloads does not keep popping the same alert.
 */
export type PermissionKind = 'media' | 'contacts' | 'location';

const announced = new Set<PermissionKind>();

export function notifyPermissionDenied(kind: PermissionKind): void {
  if (announced.has(kind)) return;
  announced.add(kind);
  const t = i18n.t.bind(i18n);
  Alert.alert(t('permission.title'), t(`permission.body_${kind}`), [
    { text: t('settings.cancel'), style: 'cancel' },
    {
      text: t('permission.open_settings'),
      onPress: () => {
        Linking.openSettings().catch(() => {});
      },
    },
  ]);
}
