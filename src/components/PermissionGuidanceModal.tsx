import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Linking, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Lock, AlertTriangle, ChevronRight, X, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { GlassPanel } from './glass/GlassPanel';
import { GlassButton } from './glass/GlassButton';
import { colors } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const PermissionGuidanceModal: React.FC<Props> = ({ visible, onClose }) => {
  const { t } = useTranslation();

  if (!visible) return null;

  const handleOpenSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Linking.openSettings().catch(() => {});
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <GlassPanel
          borderRadius={32}
          borderColor="rgba(245, 158, 11, 0.4)"
          style={styles.modalCard}
          contentStyle={styles.modalContent}
          intensity={45}
        >
          {/* Header Warning Ring */}
          <View style={styles.warningRing}>
            <AlertTriangle color={colors.warningAmber} size={32} strokeWidth={2.4} />
          </View>

          {/* Security Badge */}
          <View style={styles.badgeRow}>
            <Lock color={colors.neonCyan} size={13} style={{ marginRight: 5 }} />
            <Text style={styles.badgeText}>{t('permission.limited_alert_badge')}</Text>
          </View>

          {/* Title */}
          <Text style={styles.titleText}>{t('permission.limited_alert_title')}</Text>

          {/* Description */}
          <Text style={styles.descText}>{t('permission.limited_alert_desc')}</Text>

          {/* Privacy Guarantee Box */}
          <View style={styles.privacyBox}>
            <View style={styles.privacyHeader}>
              <ShieldCheck color={colors.successMint} size={18} style={{ marginRight: 8 }} />
              <Text style={styles.privacyTitle}>{t('permission.privacy_guarantee_title')}</Text>
            </View>
            <Text style={styles.privacyDesc}>{t('permission.privacy_guarantee_desc')}</Text>
          </View>

          {/* Buttons */}
          <View style={styles.buttonGroup}>
            <GlassButton
              borderRadius={26}
              borderColor="rgba(0, 242, 254, 0.5)"
              glowColor={colors.neonCyan}
              style={styles.settingsButton}
              onPress={handleOpenSettings}
            >
              <View style={styles.buttonInner}>
                <Sparkles color={colors.neonCyan} size={18} style={{ marginRight: 8 }} />
                <Text style={styles.settingsButtonText}>{t('permission.open_settings_btn')}</Text>
                <ChevronRight color={colors.neonCyan} size={18} style={{ marginLeft: 4 }} />
              </View>
            </GlassButton>

            <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.dismissButton}>
              <Text style={styles.dismissButtonText}>{t('permission.dismiss_btn')}</Text>
            </TouchableOpacity>
          </View>
        </GlassPanel>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 370,
    borderRadius: 32,
  },
  modalContent: {
    padding: 24,
    alignItems: 'center',
  },
  warningRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: colors.warningAmber,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 242, 254, 0.12)',
    borderColor: 'rgba(0, 242, 254, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    marginBottom: 12,
  },
  badgeText: {
    color: colors.neonCyan,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  titleText: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  descText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    fontWeight: '500',
    marginBottom: 18,
  },
  privacyBox: {
    width: '100%',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    marginBottom: 20,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  privacyTitle: {
    color: colors.successMint,
    fontSize: 12,
    fontWeight: '800',
  },
  privacyDesc: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
  },
  buttonGroup: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  settingsButton: {
    width: '100%',
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  settingsButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  dismissButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dismissButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});
