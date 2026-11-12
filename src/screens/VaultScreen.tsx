import React, { useState, useEffect, useCallback } from 'react';
import { notifyPermissionDenied } from '../services/permissionAlerts';
import { enter } from '../theme/motion';
import { AnalyticsService } from '../services/analyticsService';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Modal,
  Dimensions,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, {
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Lock,
  Plus,
  Trash2,
  Undo2,
  ShieldCheck,
  Delete,
  X,
  Sparkles,
  Check,
  Images,
  KeyRound,
  Fingerprint,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library/legacy';
import { FlashList } from '@shopify/flash-list';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { ScreenHeader } from '../components/layout/ScreenHeader';
import { colors, alpha } from '../theme/colors';
import {
  hasVaultPin,
  verifyVaultPin,
  setVaultPin,
  getVaultItems,
  lockPhotoToVault,
  restorePhotoFromVault,
  deleteVaultItem,
  getVaultLockout,
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled,
  authenticateWithDevice,
  hasDeviceLock,
  VaultItem,
} from '../services/vaultService';

const { width } = Dimensions.get('window');
const COLUMN_SIZE = (width - 56) / 3;
const PICKER_COLUMN_SIZE = (width - 64) / 3;

interface GalleryPickerItem {
  id: string;
  uri: string;
  filename: string;
}

export const VaultScreen: React.FC = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [isConfiguringPin, setIsConfiguringPin] = useState<boolean>(false);
  const [pinStep, setPinStep] = useState<'enter' | 'create' | 'confirm' | 'change_old'>('enter');
  // True while the create/confirm steps are replacing an existing PIN, not setting the first one.
  const [changingPin, setChangingPin] = useState<boolean>(false);
  const [biometricAvailable, setBiometricAvailable] = useState<boolean>(false);
  const [biometricOn, setBiometricOn] = useState<boolean>(false);
  const [pinValue, setPinValue] = useState<string>('');
  const [firstPin, setFirstPin] = useState<string>('');
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Gallery Picker Modal State
  const [pickerVisible, setPickerVisible] = useState<boolean>(false);
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPickerItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState<boolean>(false);
  const [selectedPickerIds, setSelectedPickerIds] = useState<Set<string>>(new Set());
  const [lockingBatch, setLockingBatch] = useState<boolean>(false);
  const [pickerPermissionDenied, setPickerPermissionDenied] = useState<boolean>(false);

  const checkPinStatus = useCallback(async () => {
    try {
      setLoading(true);
      const hasPin = await hasVaultPin();
      setBiometricAvailable(await isBiometricAvailable());
      setBiometricOn(await isBiometricEnabled());
      if (!hasPin) {
        setIsConfiguringPin(true);
        setPinStep('create');
      } else {
        setIsConfiguringPin(false);
        setPinStep('enter');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkPinStatus();
  }, [checkPinStatus]);

  // Biometric unlock is offered once when the vault opens; the PIN stays as the fallback.
  useEffect(() => {
    if (!loading && biometricOn && biometricAvailable && !isConfiguringPin && !isUnlocked) {
      handleBiometricUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, biometricOn, biometricAvailable, isConfiguringPin]);

  const loadItems = async () => {
    try {
      const items = await getVaultItems();
      setVaultItems(items);
    } catch (err) {
      console.warn('Failed loading vault items:', err);
    }
  };

  const handleDigitPress = async (digit: string) => {
    if (pinValue.length >= 4) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const nextPin = pinValue + digit;
    setPinValue(nextPin);

    if (nextPin.length === 4) {
      if (pinStep === 'create') {
        setFirstPin(nextPin);
        setPinValue('');
        setPinStep('confirm');
      } else if (pinStep === 'confirm') {
        if (nextPin === firstPin) {
          await setVaultPin(nextPin);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          Alert.alert(
            t('general.success'),
            changingPin ? t('vault.pin_changed') : t('vault.pin_created')
          );
          AnalyticsService.trackVaultAction(changingPin ? 'pin_change' : 'pin_create');
          setChangingPin(false);
          setIsUnlocked(true);
          setPinValue('');
          await loadItems();
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          Alert.alert(t('general.error'), t('vault.pin_mismatch'));
          setPinValue('');
          setFirstPin('');
          setPinStep('create');
        }
      } else if (pinStep === 'change_old') {
        const check = await verifyVaultPin(nextPin);
        setPinValue('');
        if (check.ok) {
          setPinStep('create');
          setFirstPin('');
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          reportFailedPin(check.lockedForMs, t('vault.pin_incorrect'));
        }
      } else if (pinStep === 'enter') {
        const check = await verifyVaultPin(nextPin);
        setPinValue('');
        if (check.ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          AnalyticsService.trackVaultAction('unlock');
          setIsUnlocked(true);
          await loadItems();
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          reportFailedPin(check.lockedForMs, t('vault.pin_incorrect'));
        }
      }
    }
  };

  /** Shows the wrong-PIN message, or how long the vault is locked for. */
  const reportFailedPin = (lockedForMs: number, fallback: string) => {
    if (lockedForMs > 0) {
      const seconds = Math.ceil(lockedForMs / 1000);
      const minutes = Math.ceil(seconds / 60);
      Alert.alert(
        t('vault.locked_title'),
        seconds < 120
          ? t('vault.locked_seconds', { count: seconds })
          : t('vault.locked_minutes', { count: minutes })
      );
      return;
    }
    Alert.alert(t('general.error'), fallback);
  };

  const handleBiometricUnlock = async () => {
    const ok = await authenticateWithDevice(t('vault.unlock_prompt'));
    if (!ok) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    AnalyticsService.trackVaultAction('biometric_unlock');
    setIsUnlocked(true);
    setPinValue('');
    await loadItems();
  };

  const handleToggleBiometric = async (enabled: boolean) => {
    if (enabled) {
      const ok = await authenticateWithDevice(t('vault.biometric_confirm_prompt'));
      if (!ok) return;
    }
    await setBiometricEnabled(enabled);
    setBiometricOn(enabled);
    AnalyticsService.logEvent('vault_biometric_toggled', { enabled });
  };

  const handleChangePin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setChangingPin(true);
    setIsUnlocked(false);
    setPinValue('');
    setPinStep('change_old');
  };

  /** Forgot the PIN: the device's own lock (fingerprint, face or screen PIN) proves ownership. */
  const handleForgotPin = async () => {
    if (!(await hasDeviceLock())) {
      Alert.alert(t('vault.forgot_pin_title'), t('vault.forgot_pin_no_lock'));
      return;
    }
    Alert.alert(t('vault.forgot_pin_title'), t('vault.forgot_pin_body'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('vault.forgot_pin_continue'),
        onPress: async () => {
          const ok = await authenticateWithDevice(t('vault.reset_prompt'));
          if (!ok) return;
          AnalyticsService.trackVaultAction('pin_reset');
          setChangingPin(true);
          setPinValue('');
          setFirstPin('');
          setPinStep('create');
        },
      },
    ]);
  };

  const handleDeleteDigit = () => {
    if (pinValue.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setPinValue((prev) => prev.slice(0, -1));
    }
  };

  // Open interactive photo picker modal
  const handleOpenPicker = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPickerVisible(true);
    setPickerLoading(true);
    setSelectedPickerIds(new Set());

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (status !== 'granted') {
        setPickerLoading(false);
        setPickerPermissionDenied(true);
        notifyPermissionDenied('media');
        return;
      }
      setPickerPermissionDenied(false);

      const page = await MediaLibrary.getAssetsAsync({
        first: 80,
        mediaType: 'photo',
        sortBy: [['creationTime', false]],
      });

      setGalleryPhotos(
        page.assets.map((a) => ({
          id: a.id,
          uri: a.uri,
          filename: a.filename || `Photo_${a.id.slice(0, 6)}`,
        }))
      );
    } catch (e) {
      console.warn('Error loading gallery photos for picker:', e);
    } finally {
      setPickerLoading(false);
    }
  };

  const togglePickerSelect = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedPickerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmLockPhotos = async () => {
    if (selectedPickerIds.size === 0 || lockingBatch) return;
    setLockingBatch(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      const chosenPhotos = galleryPhotos.filter((p) => selectedPickerIds.has(p.id));
      let locked = 0;
      for (const p of chosenPhotos) {
        const ok = await lockPhotoToVault(p.uri, p.id);
        if (ok) locked += 1;
      }

      if (locked === 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        Alert.alert(t('general.error'), t('vault.lock_failed'));
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      AnalyticsService.trackToolUsed('vault_lock', { count: locked });
      Alert.alert(t('general.success'), t('vault.lock_success', { count: locked }));
      setPickerVisible(false);
      setSelectedPickerIds(new Set());
      await loadItems();
    } catch (err) {
      console.warn('Error locking chosen photos:', err);
      Alert.alert(t('general.error'), t('vault.lock_failed'));
    } finally {
      setLockingBatch(false);
    }
  };

  const handleRestorePhoto = async (item: VaultItem) => {
    setActionLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const success = await restorePhotoFromVault(item);
    setActionLoading(false);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(t('general.success'), t('vault.restore_success'));
      setSelectedItem(null);
      await loadItems();
    }
  };

  const handleDeletePhoto = (item: VaultItem) => {
    Alert.alert(t('vault.delete_permanently'), t('vault.delete_confirm'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.confirm'),
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          await deleteVaultItem(item);
          setActionLoading(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setSelectedItem(null);
          await loadItems();
        },
      },
    ]);
  };

  const handleLockVault = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    AnalyticsService.trackVaultAction('lock');
    setIsUnlocked(false);
    setPinValue('');
    setSelectedItem(null);
    setPinStep('enter');
  };

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          title={t('dashboard.app_title')}
          brand
          rightSlot={
            isUnlocked ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleLockVault}
                style={styles.lockButton}
              >
                <Lock color={colors.dangerRose} size={16} strokeWidth={2.4} />
                <Text style={styles.lockButtonText}>{t('vault.lock_vault')}</Text>
              </TouchableOpacity>
            ) : undefined
          }
        />

        {!isUnlocked ? (
          /* PIN KEYPAD SCREEN */
          <Animated.View entering={enter(FadeIn.duration(300))} style={styles.pinContainer}>
            <View style={styles.pinHeader}>
              <View style={styles.lockBadge}>
                <Lock color={colors.primary} size={30} strokeWidth={2.2} />
              </View>
              <Text style={styles.pinTitle}>
                {pinStep === 'create'
                  ? t('vault.create_pin')
                  : pinStep === 'confirm'
                  ? t('vault.confirm_pin')
                  : pinStep === 'change_old'
                  ? t('vault.enter_old_pin')
                  : t('vault.enter_pin')}
              </Text>
              <Text style={styles.pinSubtitle}>{t('vault.subtitle')}</Text>
            </View>

            {/* 4 PIN Dots */}
            <View style={styles.pinDotsRow}>
              {[0, 1, 2, 3].map((index) => {
                const filled = pinValue.length > index;
                return (
                  <View
                    key={index}
                    style={[styles.pinDot, filled && styles.pinDotFilled]}
                  />
                );
              })}
            </View>

            {/* Keypad Grid */}
            <View style={styles.keypadGrid}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <TouchableOpacity
                  key={digit}
                  activeOpacity={0.7}
                  onPress={() => handleDigitPress(digit)}
                  accessibilityRole="button"
                  accessibilityLabel={digit}
                  style={styles.keyButton}
                >
                  <Text style={styles.keyText}>{digit}</Text>
                </TouchableOpacity>
              ))}

              <View style={styles.keyButtonEmpty} />

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleDigitPress('0')}
                style={styles.keyButton}
              >
                <Text style={styles.keyText}>0</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleDeleteDigit}
                accessibilityRole="button"
                accessibilityLabel={t('general.delete_digit')}
                style={styles.keyButton}
              >
                <Delete color={colors.textSecondary} size={24} />
              </TouchableOpacity>
            </View>

            {pinStep === 'enter' && (
              <View style={styles.pinLinksRow}>
                {biometricOn && biometricAvailable && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleBiometricUnlock}
                    style={styles.linkButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('vault.biometric_unlock')}
                  >
                    <Fingerprint color={colors.primary} size={18} strokeWidth={2.2} />
                    <Text style={styles.linkText}>{t('vault.biometric_unlock')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleForgotPin}
                  style={styles.linkButton}
                  accessibilityRole="button"
                >
                  <Text style={styles.linkText}>{t('vault.forgot_pin')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        ) : (
          /* UNLOCKED VAULT ALBUM VIEW */
          <View style={{ flex: 1 }}>
            <View style={styles.securityRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleChangePin}
                style={styles.securityChip}
                accessibilityRole="button"
              >
                <KeyRound color={colors.primary} size={16} strokeWidth={2.2} />
                <Text style={styles.securityChipText}>{t('vault.change_pin')}</Text>
              </TouchableOpacity>
              {biometricAvailable && (
                <View style={styles.securityChip}>
                  <Fingerprint color={colors.primary} size={16} strokeWidth={2.2} />
                  <Text style={styles.securityChipText} numberOfLines={1}>
                    {t('vault.biometric_label')}
                  </Text>
                  <Switch
                    value={biometricOn}
                    onValueChange={handleToggleBiometric}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              )}
            </View>

            <Animated.View entering={enter(FadeInDown.delay(100))} style={styles.vaultHeader}>
              <View>
                <Text style={styles.vaultTitle}>{t('vault.title')}</Text>
                <Text style={styles.vaultSubtitle}>
                  {t('vault.item_count', { count: vaultItems.length })}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleOpenPicker}
                style={styles.addPhotoButton}
              >
                <Plus color={colors.primary} size={17} style={{ marginRight: 6 }} />
                <Text style={styles.addPhotoText}>{t('vault.add_media')}</Text>
              </TouchableOpacity>
            </Animated.View>

            {vaultItems.length === 0 ? (
              <Animated.View entering={enter(FadeIn)} style={styles.emptyContainer}>
                <GlassPanel borderRadius={28} style={styles.emptyCard} contentStyle={styles.emptyCardContent}>
                  <ShieldCheck color={colors.successMint} size={48} style={{ marginBottom: 14 }} />
                  <Text style={styles.emptyTitle}>{t('vault.empty_vault')}</Text>
                  <Text style={styles.emptySub}>{t('vault.empty_vault_sub')}</Text>
                  <GlassButton
                    borderRadius={20}
                    borderColor={alpha(colors.primary, 0.45)}
                    style={styles.emptyAddBtn}
                    onPress={handleOpenPicker}
                  >
                    <Text style={styles.emptyAddBtnText}>{t('vault.add_media')}</Text>
                  </GlassButton>
                </GlassPanel>
              </Animated.View>
            ) : (
              <FlashList
                data={vaultItems}
                numColumns={3}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[
                  styles.gridContent,
                  { paddingBottom: Math.max(140, 100 + insets.bottom) },
                ]}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => setSelectedItem(item)}
                    style={styles.gridItem}
                  >
                    <Image source={{ uri: item.uri }} style={styles.gridImage} resizeMethod="resize" resizeMode="cover" />
                    <LinearGradient
                      colors={['transparent', 'rgba(15, 23, 42, 0.75)']}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.itemSizeBadge}>
                      <Text style={styles.itemSizeText}>{item.formattedSize}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}

        {/* Interactive Gallery Picker Modal */}
        <Modal visible={pickerVisible} animationType="slide" onRequestClose={() => setPickerVisible(false)}>
          <View style={styles.pickerModalOverlay}>
            <SafeAreaView style={styles.pickerSafeArea}>
              <View style={styles.pickerTopBar}>
                <TouchableOpacity activeOpacity={0.8} onPress={() => setPickerVisible(false)} style={styles.pickerCloseBtn}>
                  <X color={colors.textPrimary} size={20} />
                </TouchableOpacity>
                <Text style={styles.pickerHeaderTitle}>{t('vault.add_media')}</Text>
                <View style={{ width: 38 }} />
              </View>

              {pickerLoading ? (
                <View style={styles.pickerLoadingBox}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.pickerLoadingText}>{t('dashboard.status.scanning')}</Text>
                </View>
              ) : pickerPermissionDenied ? (
                <View style={styles.pickerLoadingBox}>
                  <Text style={styles.pickerLoadingText}>{t('vault.picker_permission')}</Text>
                </View>
              ) : galleryPhotos.length === 0 ? (
                <View style={styles.pickerLoadingBox}>
                  <Text style={styles.pickerLoadingText}>{t('vault.picker_empty')}</Text>
                </View>
              ) : (
                <View style={{ flex: 1 }}>
                  <FlashList
                    data={galleryPhotos}
                    numColumns={3}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.pickerGridContent}
                    renderItem={({ item }) => {
                      const isSelected = selectedPickerIds.has(item.id);
                      return (
                        <TouchableOpacity
                          activeOpacity={0.88}
                          onPress={() => togglePickerSelect(item.id)}
                          style={styles.pickerGridItem}
                        >
                          <Image source={{ uri: item.uri }} style={styles.pickerGridImage} resizeMethod="resize" resizeMode="cover" />
                          <View style={[styles.pickerCheckbox, isSelected && styles.pickerCheckboxActive]}>
                            {isSelected && <Check color="#FFF" size={14} strokeWidth={3} />}
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                  />

                  {/* Confirm Lock Button */}
                  {selectedPickerIds.size > 0 && (
                    <View style={styles.pickerFloatingBar}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={lockingBatch}
                        onPress={handleConfirmLockPhotos}
                        style={styles.confirmLockButton}
                      >
                        <LinearGradient colors={colors.primaryGradient} style={styles.confirmLockGradient}>
                          {lockingBatch ? (
                            <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 8 }} />
                          ) : (
                            <Lock color="#FFF" size={18} style={{ marginRight: 8 }} />
                          )}
                          <Text style={styles.confirmLockText}>
                            {t('vault.lock_selected', { count: selectedPickerIds.size })}
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </SafeAreaView>
          </View>
        </Modal>

        {/* Selected Item Preview Modal */}
        {selectedItem && (
          <Modal visible={Boolean(selectedItem)} transparent animationType="fade" onRequestClose={() => setSelectedItem(null)}>
            <View style={styles.previewModalOverlay}>
              <SafeAreaView style={styles.previewModalSafeArea}>
                <View style={styles.previewTopBar}>
                  <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedItem(null)} style={styles.previewCloseBtn}>
                    <X color="#FFF" size={20} />
                  </TouchableOpacity>
                  <Text style={styles.previewTitleText}>{selectedItem.formattedSize}</Text>
                  <View style={{ width: 40 }} />
                </View>

                <View style={styles.previewImageContainer}>
                  <Image source={{ uri: selectedItem.uri }} style={styles.previewFullImage} resizeMethod="resize" resizeMode="contain" />
                </View>

                <View style={styles.previewActionsRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={actionLoading}
                    onPress={() => handleRestorePhoto(selectedItem)}
                    style={styles.restoreBtn}
                  >
                    <Undo2 color={colors.primarySoft} size={18} style={{ marginRight: 8 }} />
                    <Text style={styles.restoreBtnText}>{t('vault.restore_to_gallery')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={actionLoading}
                    onPress={() => handleDeletePhoto(selectedItem)}
                    style={styles.deleteBtn}
                  >
                    <Trash2 color={colors.dangerLight} size={18} style={{ marginRight: 8 }} />
                    <Text style={styles.deleteBtnText}>{t('vault.delete_permanently')}</Text>
                  </TouchableOpacity>
                </View>
              </SafeAreaView>
            </View>
          </Modal>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  safeArea: {
    flex: 1,
  },
  pinLinksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 18,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  securityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  securityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: alpha(colors.primary, 0.1),
  },
  securityChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  lockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: alpha(colors.dangerRose, 0.08),
    borderWidth: 1,
    borderColor: alpha(colors.dangerRose, 0.3),
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  lockButtonText: {
    color: colors.dangerRose,
    fontSize: 13,
    fontWeight: '800',
  },
  pinContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingBottom: 40,
  },
  pinHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  lockBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: alpha(colors.primary, 0.1),
    borderWidth: 1.5,
    borderColor: alpha(colors.primary, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pinTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  pinSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  pinDotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 36,
  },
  pinDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  pinDotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 280,
    justifyContent: 'space-between',
    gap: 14,
  },
  keyButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  keyButtonEmpty: {
    width: 76,
    height: 76,
  },
  keyText: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  vaultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  vaultTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  vaultSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: alpha(colors.primary, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.32),
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  addPhotoText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  gridContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 110,
  },
  gridItem: {
    width: COLUMN_SIZE,
    height: COLUMN_SIZE,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
    marginRight: 8,
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  itemSizeBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  itemSizeText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  emptyCard: {
    borderRadius: 28,
  },
  emptyCardContent: {
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyAddBtn: {
    width: 180,
    height: 44,
  },
  emptyAddBtnText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  pickerSafeArea: {
    flex: 1,
  },
  pickerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerHeaderTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  pickerLoadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  pickerGridContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 110,
  },
  pickerGridItem: {
    width: PICKER_COLUMN_SIZE,
    height: PICKER_COLUMN_SIZE,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
    marginRight: 8,
    position: 'relative',
  },
  pickerGridImage: {
    width: '100%',
    height: '100%',
  },
  pickerCheckbox: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCheckboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pickerFloatingBar: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
  },
  confirmLockButton: {
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  confirmLockGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  confirmLockText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
  },
  previewModalOverlay: {
    flex: 1,
    backgroundColor: colors.scrimMedia,
  },
  previewModalSafeArea: {
    flex: 1,
  },
  previewTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  previewCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitleText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  previewImageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFullImage: {
    width: '100%',
    height: '100%',
  },
  previewActionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  restoreBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(colors.primary, 0.16),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.45),
    paddingVertical: 14,
    borderRadius: 20,
  },
  restoreBtnText: {
    color: colors.primarySoft,
    fontSize: 13,
    fontWeight: '800',
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(colors.dangerRose, 0.16),
    borderWidth: 1,
    borderColor: alpha(colors.dangerRose, 0.45),
    paddingVertical: 14,
    borderRadius: 20,
  },
  deleteBtnText: {
    color: colors.dangerLight,
    fontSize: 13,
    fontWeight: '800',
  },
});
