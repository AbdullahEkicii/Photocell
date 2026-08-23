import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeIn, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Users,
  Check,
  Trash2,
  UserX,
  Copy,
  ShieldCheck,
  Sparkles,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { colors } from '../theme/colors';
import {
  scanDeviceContacts,
  deleteChosenContacts,
  CleanableContact,
  ContactsScanResult,
} from '../services/contactsCleaner';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ContactFilter = 'all' | 'duplicates' | 'empty';

interface Props {
  onBack: () => void;
}

export const ContactsCleanerScreen: React.FC<Props> = ({ onBack }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [scanResult, setScanResult] = useState<ContactsScanResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<ContactFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<boolean>(false);

  const loadContacts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await scanDeviceContacts();
      setScanResult(res);
    } catch (e) {
      console.warn('Failed scanning contacts:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const allItems = useMemo(() => {
    if (!scanResult) return [];
    return [
      ...scanResult.duplicateNumbers,
      ...scanResult.duplicateNames,
      ...scanResult.emptyContacts,
    ];
  }, [scanResult]);

  const filteredItems = useMemo(() => {
    if (filter === 'duplicates') {
      return allItems.filter((i) => i.type === 'duplicate_number' || i.type === 'duplicate_name');
    }
    if (filter === 'empty') {
      return allItems.filter((i) => i.type === 'empty');
    }
    return allItems;
  }, [allItems, filter]);

  const toggleSelect = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0 || deleting) return;

    Alert.alert(
      t('contacts_cleaner.delete_selected', { count: selectedIds.size }),
      t('settings.confirm'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.confirm'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            try {
              const idsArray = Array.from(selectedIds);
              await deleteChosenContacts(idsArray);
              setSelectedIds(new Set());
              Alert.alert(t('general.success'), t('contacts_cleaner.success_deleted'));
              await loadContacts();
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Bar */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.topBar}>
          <TouchableOpacity activeOpacity={0.8} onPress={onBack} style={styles.backButton}>
            <ArrowLeft color={colors.textPrimary} size={20} strokeWidth={2.4} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>{t('contacts_cleaner.title')}</Text>
          <View style={{ width: 40 }} />
        </Animated.View>

        {/* Filter Pills */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.filterSection}>
          <View style={styles.filterRow}>
            {(['all', 'duplicates', 'empty'] as ContactFilter[]).map((f) => {
              const active = filter === f;
              return (
                <TouchableOpacity
                  key={f}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setFilter(f);
                  }}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                >
                  <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                    {f === 'all'
                      ? t('contacts_cleaner.filter_all')
                      : f === 'duplicates'
                      ? t('contacts_cleaner.filter_duplicates')
                      : t('contacts_cleaner.filter_empty')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>

        {/* List or Permission Request */}
        {loading ? (
          <Animated.View entering={FadeIn} style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.neonCyan} style={{ marginBottom: 12 }} />
            <Text style={styles.loadingText}>{t('dashboard.status.scanning')}</Text>
          </Animated.View>
        ) : scanResult && !scanResult.hasPermission ? (
          <Animated.View entering={FadeIn} style={styles.emptyContainer}>
            <GlassPanel borderRadius={28} style={styles.emptyCard} contentStyle={styles.emptyCardContent}>
              <ShieldCheck color={colors.warningAmber} size={52} style={{ marginBottom: 14 }} />
              <Text style={styles.emptyTitle}>{t('contacts_cleaner.permission_title')}</Text>
              <Text style={styles.emptySub}>{t('contacts_cleaner.permission_desc')}</Text>
              <GlassButton
                borderRadius={20}
                borderColor={colors.neonCyan}
                style={styles.permissionBtn}
                onPress={loadContacts}
              >
                <Sparkles color={colors.neonCyan} size={16} style={{ marginRight: 6 }} />
                <Text style={styles.permissionBtnText}>{t('contacts_cleaner.grant_permission')}</Text>
              </GlassButton>
            </GlassPanel>
          </Animated.View>
        ) : filteredItems.length === 0 ? (
          <Animated.View entering={FadeIn} style={styles.emptyContainer}>
            <GlassPanel borderRadius={28} style={styles.emptyCard} contentStyle={styles.emptyCardContent}>
              <Users color={colors.successMint} size={52} style={{ marginBottom: 14 }} />
              <Text style={styles.emptyTitle}>{t('contacts_cleaner.all_contacts_clean')}</Text>
            </GlassPanel>
          </Animated.View>
        ) : (
          <FlashList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(90, insets.bottom + 60) },
            ]}
            renderItem={({ item }) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => toggleSelect(item.id)}
                  style={styles.cardWrapper}
                >
                  <GlassPanel
                    borderRadius={24}
                    borderColor={isSelected ? colors.dangerRose : 'rgba(226, 232, 240, 0.9)'}
                    style={styles.contactCard}
                    contentStyle={styles.contactCardContent}
                    intensity={25}
                  >
                    <View style={[styles.avatarBadge, item.type === 'empty' ? styles.avatarEmpty : styles.avatarDup]}>
                      {item.type === 'empty' ? (
                        <UserX color={colors.warningAmber} size={20} />
                      ) : (
                        <Copy color={colors.electricPurple} size={20} />
                      )}
                    </View>

                    <View style={styles.cardDetails}>
                      <Text style={styles.contactName} numberOfLines={1}>
                        {item.name || t('contacts_cleaner.empty_contacts')}
                      </Text>
                      <Text style={styles.contactPhone} numberOfLines={1}>
                        {item.phone || t('contacts_cleaner.empty_contacts')}
                      </Text>
                      {item.duplicateWith && (
                        <Text style={styles.duplicateNotice} numberOfLines={1}>
                          {`Eşleşen: ${item.duplicateWith}`}
                        </Text>
                      )}
                    </View>

                    {/* Checkbox */}
                    <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                      {isSelected && <Check color="#FFF" size={14} strokeWidth={3} />}
                    </View>
                  </GlassPanel>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Floating Delete Bar */}
        {selectedIds.size > 0 && (
          <Animated.View
            entering={FadeInUp.springify()}
            style={[styles.floatingBar, { bottom: Math.max(20, insets.bottom + 10) }]}
          >
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={deleting}
              onPress={handleDeleteSelected}
              style={styles.deleteButton}
            >
              <LinearGradient colors={['#F43F5E', '#BE123C']} style={styles.deleteGradient}>
                {deleting ? (
                  <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 8 }} />
                ) : (
                  <Trash2 color="#FFF" size={18} style={{ marginRight: 8 }} />
                )}
                <Text style={styles.deleteButtonText}>
                  {t('contacts_cleaner.delete_selected', { count: selectedIds.size })}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.9)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  filterSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  filterPillActive: {
    backgroundColor: 'rgba(147, 51, 234, 0.12)',
    borderColor: colors.neonCyan,
    borderWidth: 1.5,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: colors.neonCyan,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
  },
  cardWrapper: {
    marginBottom: 12,
  },
  contactCard: {
    borderRadius: 24,
  },
  contactCardContent: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarDup: {
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
  },
  avatarEmpty: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  cardDetails: {
    flex: 1,
    paddingRight: 8,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  contactPhone: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  duplicateNotice: {
    fontSize: 11,
    color: colors.warningAmber,
    fontWeight: '700',
    marginTop: 2,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.dangerRose,
    borderColor: colors.dangerRose,
  },
  floatingBar: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    zIndex: 50,
  },
  deleteButton: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: colors.dangerRose,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  deleteGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  emptyCard: {
    borderRadius: 28,
  },
  emptyCardContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  permissionBtn: {
    height: 44,
    paddingHorizontal: 20,
  },
  permissionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.neonCyan,
  },
});
