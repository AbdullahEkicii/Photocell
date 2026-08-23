import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library/legacy';
import { FlashList } from '@shopify/flash-list';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { colors } from '../theme/colors';
import {
  hasVaultPin,
  verifyVaultPin,
  setVaultPin,
  getVaultItems,
  lockPhotoToVault,
  restorePhotoFromVault,
  deleteVaultItem,
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
  const [pinStep, setPinStep] = useState<'enter' | 'create' | 'confirm'>('enter');
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

  const checkPinStatus = useCallback(async () => {
    try {
      setLoading(true);
      const hasPin = await hasVaultPin();
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
          Alert.alert(t('general.success'), t('vault.pin_created'));
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
      } else if (pinStep === 'enter') {
        const isValid = await verifyVaultPin(nextPin);
        if (isValid) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setIsUnlocked(true);
          setPinValue('');
          await loadItems();
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          Alert.alert(t('general.error'), t('vault.pin_incorrect'));
          setPinValue('');
        }
      }
    }
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
        return;
      }

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
      for (const p of chosenPhotos) {
        await lockPhotoToVault(p.uri, p.id);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(t('general.success'), t('vault.lock_success'));
      setPickerVisible(false);
      setSelectedPickerIds(new Set());
      await loadItems();
    } catch (err) {
      console.warn('Error locking chosen photos:', err);
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
    setIsUnlocked(false);
    setPinValue('');
    setSelectedItem(null);
    setPinStep('enter');
  };

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Header Bar */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.headerBar}>
          <View style={styles.headerLeftGroup}>
            <ShieldCheck color={colors.successMint} size={24} strokeWidth={2.4} />
            <Text style={styles.appTitle}>{t('vault.title')}</Text>
          </View>

          {isUnlocked && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleLockVault}
              style={styles.lockButton}
            >
              <Lock color={colors.dangerRose} size={16} strokeWidth={2.4} />
              <Text style={styles.lockButtonText}>{t('vault.lock_vault')}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {!isUnlocked ? (
          /* PIN KEYPAD SCREEN */
          <Animated.View entering={FadeIn.duration(300)} style={styles.pinContainer}>
            <View style={styles.pinHeader}>
              <View style={styles.lockBadge}>
                <Lock color={colors.neonCyan} size={32} strokeWidth={2.4} />
              </View>
              <Text style={styles.pinTitle}>
                {pinStep === 'create'
                  ? t('vault.create_pin')
                  : pinStep === 'confirm'
                  ? t('vault.confirm_pin')
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
                style={styles.keyButton}
              >
                <Delete color={colors.textSecondary} size={24} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : (
          /* UNLOCKED VAULT ALBUM VIEW */
          <View style={{ flex: 1 }}>
            <Animated.View entering={FadeInDown.delay(100)} style={styles.vaultHeader}>
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
                <Plus color={colors.neonCyan} size={18} style={{ marginRight: 6 }} />
                <Text style={styles.addPhotoText}>{t('vault.add_media')}</Text>
              </TouchableOpacity>
            </Animated.View>

            {vaultItems.length === 0 ? (
              <Animated.View entering={FadeIn} style={styles.emptyContainer}>
                <GlassPanel borderRadius={28} style={styles.emptyCard} contentStyle={styles.emptyCardContent}>
                  <ShieldCheck color={colors.successMint} size={48} style={{ marginBottom: 14 }} />
                  <Text style={styles.emptyTitle}>{t('vault.empty_vault')}</Text>
                  <Text style={styles.emptySub}>{t('vault.empty_vault_sub')}</Text>
                  <GlassButton
                    borderRadius={20}
                    borderColor={colors.neonCyan}
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
                    <Image source={{ uri: item.uri }} style={styles.gridImage} resizeMode="cover" />
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
                  <ActivityIndicator size="large" color={colors.neonCyan} />
                  <Text style={styles.pickerLoadingText}>{t('dashboard.status.scanning')}</Text>
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
                          <Image source={{ uri: item.uri }} style={styles.pickerGridImage} resizeMode="cover" />
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
                        <LinearGradient colors={['#9333EA', '#7E22CE']} style={styles.confirmLockGradient}>
                          {lockingBatch ? (
                            <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 8 }} />
                          ) : (
                            <Lock color="#FFF" size={18} style={{ marginRight: 8 }} />
                          )}
                          <Text style={styles.confirmLockText}>
                            {`Seçilen ${selectedPickerIds.size} Fotoğrafı Kasaya Kilitle`}
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
                  <Image source={{ uri: selectedItem.uri }} style={styles.previewFullImage} resizeMode="contain" />
                </View>

                <View style={styles.previewActionsRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={actionLoading}
                    onPress={() => handleRestorePhoto(selectedItem)}
                    style={styles.restoreBtn}
                  >
                    <Undo2 color={colors.neonCyan} size={18} style={{ marginRight: 8 }} />
                    <Text style={styles.restoreBtnText}>{t('vault.restore_to_gallery')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={actionLoading}
                    onPress={() => handleDeletePhoto(selectedItem)}
                    style={styles.deleteBtn}
                  >
                    <Trash2 color={colors.dangerRose} size={18} style={{ marginRight: 8 }} />
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
    backgroundColor: colors.oledBlack,
  },
  safeArea: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.9)',
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  lockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  lockButtonText: {
    color: colors.dangerRose,
    fontSize: 12,
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
    backgroundColor: 'rgba(147, 51, 234, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(147, 51, 234, 0.35)',
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
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  pinDotFilled: {
    backgroundColor: colors.neonCyan,
    borderColor: colors.neonCyan,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
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
    backgroundColor: 'rgba(147, 51, 234, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(147, 51, 234, 0.4)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  addPhotoText: {
    color: colors.neonCyan,
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
    fontSize: 10,
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
    color: colors.neonCyan,
    fontSize: 14,
    fontWeight: '800',
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
    borderBottomColor: '#E2E8F0',
  },
  pickerCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    backgroundColor: colors.neonCyan,
    borderColor: colors.neonCyan,
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
    shadowColor: colors.neonCyan,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
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
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
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
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(147, 51, 234, 0.4)',
    paddingVertical: 14,
    borderRadius: 20,
  },
  restoreBtnText: {
    color: colors.neonCyan,
    fontSize: 13,
    fontWeight: '800',
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.4)',
    paddingVertical: 14,
    borderRadius: 20,
  },
  deleteBtnText: {
    color: colors.dangerRose,
    fontSize: 13,
    fontWeight: '800',
  },
});
