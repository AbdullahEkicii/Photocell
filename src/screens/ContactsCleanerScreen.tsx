import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Users, Check, Trash2, UserX, Copy, ShieldCheck, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { ScreenHeader } from '../components/layout/ScreenHeader';
import { FilterChips } from '../components/layout/FilterChips';
import { EmptyState, LoadingState } from '../components/layout/EmptyState';
import { colors, alpha, radius } from '../theme/colors';
import { scanDeviceContacts, deleteChosenContacts, ContactsScanResult } from '../services/contactsCleaner';

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
      setSelectedIds(new Set());
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
    if (filter === 'empty') return allItems.filter((i) => i.type === 'empty');
    return allItems;
  }, [allItems, filter]);

  const toggleSelect = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0 || deleting) return;

    Alert.alert(
      t('contacts_cleaner.delete_confirm_title'),
      t('contacts_cleaner.delete_confirm_desc', { count: selectedIds.size }),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.confirm'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const allDeleted = await deleteChosenContacts(Array.from(selectedIds));
              if (allDeleted) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                Alert.alert(t('general.success'), t('contacts_cleaner.success_deleted'));
              } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                Alert.alert(t('general.error'), t('contacts_cleaner.delete_failed'));
              }
              await loadContacts();
            } catch (err) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
              Alert.alert(t('general.error'), t('contacts_cleaner.delete_failed'));
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
        <ScreenHeader
          title={t('contacts_cleaner.title')}
          onBack={onBack}
          onRefresh={loadContacts}
        />

        <Animated.View entering={FadeInDown.duration(400).delay(60)} style={styles.filterSection}>
          <FilterChips
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('contacts_cleaner.filter_all') },
              { value: 'duplicates', label: t('contacts_cleaner.filter_duplicates') },
              { value: 'empty', label: t('contacts_cleaner.filter_empty') },
            ]}
          />
        </Animated.View>

        {loading ? (
          <LoadingState label={t('dashboard.status.scanning')} />
        ) : scanResult && !scanResult.hasPermission ? (
          <EmptyState
            icon={ShieldCheck}
            title={t('contacts_cleaner.permission_title')}
            description={t('contacts_cleaner.permission_desc')}
            accent={colors.warningAmber}
            action={
              <GlassButton
                borderRadius={radius.control}
                borderColor={alpha(colors.primary, 0.45)}
                style={styles.permissionBtn}
                compact
                onPress={loadContacts}
              >
                <Sparkles color={colors.primary} size={15} />
                <Text style={styles.permissionBtnText}>
                  {t('contacts_cleaner.grant_permission')}
                </Text>
              </GlassButton>
            }
          />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('contacts_cleaner.all_contacts_clean')}
            description={t('contacts_cleaner.all_contacts_clean_desc')}
            accent={colors.successMint}
          />
        ) : (
          <FlashList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            extraData={selectedIds}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: Math.max(100, insets.bottom + 90),
            }}
            renderItem={({ item }) => {
              const isSelected = selectedIds.has(item.id);
              const isEmpty = item.type === 'empty';

              return (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => toggleSelect(item.id)}
                  style={styles.cardWrapper}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                >
                  <GlassPanel
                    borderRadius={radius.card}
                    borderColor={isSelected ? alpha(colors.dangerRose, 0.5) : colors.border}
                    contentStyle={styles.cardContent}
                    intensity={26}
                  >
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: alpha(
                            isEmpty ? colors.warningAmber : colors.accent,
                            0.12
                          ),
                          borderColor: alpha(isEmpty ? colors.warningAmber : colors.accent, 0.28),
                        },
                      ]}
                    >
                      {isEmpty ? (
                        <UserX color={colors.warningAmber} size={19} />
                      ) : (
                        <Copy color={colors.accent} size={19} />
                      )}
                    </View>

                    <View style={styles.cardDetails}>
                      <Text style={styles.contactName} numberOfLines={1}>
                        {item.name || t('contacts_cleaner.unnamed_contact')}
                      </Text>
                      <Text style={styles.contactPhone} numberOfLines={1}>
                        {item.phone || t('contacts_cleaner.no_number')}
                      </Text>
                      {item.duplicateWith ? (
                        <Text style={styles.duplicateNotice} numberOfLines={1}>
                          {t('contacts_cleaner.matched_with', { name: item.duplicateWith })}
                        </Text>
                      ) : null}
                    </View>

                    <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                      {isSelected && (
                        <Check color={colors.textOnAccent} size={14} strokeWidth={3} />
                      )}
                    </View>
                  </GlassPanel>
                </TouchableOpacity>
              );
            }}
          />
        )}

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
              accessibilityRole="button"
            >
              <LinearGradient colors={colors.roseGradient} style={styles.deleteGradient}>
                {deleting ? (
                  <ActivityIndicator color={colors.textOnAccent} size="small" />
                ) : (
                  <Trash2 color={colors.textOnAccent} size={18} />
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
    backgroundColor: colors.canvas,
  },
  safeArea: {
    flex: 1,
  },
  filterSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  cardWrapper: {
    marginBottom: 10,
  },
  cardContent: {
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  cardDetails: {
    flex: 1,
    paddingRight: 8,
  },
  contactName: {
    fontSize: 14.5,
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
    width: 25,
    height: 25,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.dangerRose,
    borderColor: colors.dangerRose,
  },
  permissionBtn: {
    width: 'auto',
    height: 44,
  },
  permissionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    marginLeft: 7,
  },
  floatingBar: {
    position: 'absolute',
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
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 8,
  },
  deleteGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  deleteButtonText: {
    color: colors.textOnAccent,
    fontSize: 14,
    fontWeight: '900',
  },
});
