import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ShieldCheck, MapPin, EyeOff, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { ScreenHeader } from '../components/layout/ScreenHeader';
import { EmptyState, LoadingState } from '../components/layout/EmptyState';
import { colors, alpha, radius } from '../theme/colors';
import {
  fetchExifCandidates,
  cleanPhotoMetadata,
  saveCleanedPhoto,
  ExifPhotoItem,
} from '../services/exifCleaner';

interface Props {
  onBack: () => void;
}

export const ExifCleanerScreen: React.FC<Props> = ({ onBack }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<ExifPhotoItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [cleanedIds, setCleanedIds] = useState<Set<string>>(new Set());

  const loadPhotos = useCallback(async () => {
    try {
      setLoading(true);
      const items = await fetchExifCandidates(120);
      setPhotos(items);
    } catch (err) {
      console.warn('Failed loading exif candidates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const handleCleanPhoto = async (item: ExifPhotoItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setProcessingId(item.id);

    try {
      const cleanUri = await cleanPhotoMetadata(item.uri);
      const outcome = await saveCleanedPhoto(item.id, cleanUri);
      setProcessingId(null);

      if (outcome === 'replaced') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        // Mark inline so the user can see which photos are already handled
        // instead of losing that state behind an alert.
        setCleanedIds((prev) => new Set(prev).add(item.id));
        Alert.alert(t('general.success'), t('exif_cleaner.clean_success'));
      } else if (outcome === 'copy_only') {
        // The original still has its GPS data, so it must not be shown as cleaned.
        Alert.alert(t('general.error'), t('exif_cleaner.clean_copy_only'));
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        Alert.alert(t('general.error'), t('exif_cleaner.clean_failed'));
      }
    } catch (err) {
      setProcessingId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(t('general.error'), t('exif_cleaner.clean_failed'));
    }
  };

  return (
    <View style={styles.container}>
      <AtmosphericBackground />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title={t('exif_cleaner.title')} onBack={onBack} />

        <Animated.View entering={FadeInDown.duration(400).delay(60)} style={styles.infoBanner}>
          <GlassPanel
            borderRadius={radius.card}
            borderColor={alpha(colors.successMint, 0.24)}
            contentStyle={styles.infoContent}
            intensity={26}
            glowAccent={colors.successMint}
          >
            <View style={styles.infoBadgeRow}>
              <ShieldCheck color={colors.successMint} size={16} />
              <Text style={styles.infoBadgeText}>{t('exif_cleaner.clean_badge')}</Text>
            </View>
            <Text style={styles.infoDesc}>{t('exif_cleaner.info_text')}</Text>
          </GlassPanel>
        </Animated.View>

        {loading ? (
          <LoadingState label={t('dashboard.status.scanning')} accent={colors.successMint} />
        ) : photos.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={t('exif_cleaner.no_photos')}
            description={t('exif_cleaner.no_photos_desc')}
            accent={colors.successMint}
          />
        ) : (
          <FlashList
            data={photos}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: Math.max(50, insets.bottom + 20),
            }}
            renderItem={({ item }) => {
              const isBusy = processingId === item.id;
              const isCleaned = cleanedIds.has(item.id);

              return (
                <View style={styles.cardWrapper}>
                  <GlassPanel
                    borderRadius={radius.card}
                    borderColor={isCleaned ? alpha(colors.successMint, 0.4) : colors.border}
                    contentStyle={styles.cardContent}
                    intensity={26}
                  >
                    <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMethod="resize" resizeMode="cover" />

                    <View style={styles.cardDetails}>
                      <Text style={styles.photoName} numberOfLines={1}>
                        {item.filename}
                      </Text>
                      {isCleaned ? (
                        <View style={[styles.pill, styles.pillClean]}>
                          <Check color={colors.successMint} size={11} strokeWidth={3} />
                          <Text style={[styles.pillText, { color: colors.successMint }]}>
                            {t('exif_cleaner.cleaned_badge')}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.pill, styles.pillLocation]}>
                          <MapPin color={colors.warningAmber} size={11} />
                          <Text style={[styles.pillText, { color: colors.warningAmber }]}>
                            {t('exif_cleaner.location_detected')}
                          </Text>
                        </View>
                      )}
                    </View>

                    <GlassButton
                      compact
                      borderRadius={radius.chip}
                      borderColor={alpha(colors.successMint, 0.45)}
                      glowColor={colors.successMint}
                      style={styles.cleanBtn}
                      onPress={() => handleCleanPhoto(item)}
                      disabled={isBusy || isCleaned}
                    >
                      {isBusy ? (
                        <ActivityIndicator size="small" color={colors.successMint} />
                      ) : (
                        <>
                          <EyeOff color={colors.successMint} size={13} />
                          <Text style={styles.cleanBtnText}>{t('exif_cleaner.clean_action')}</Text>
                        </>
                      )}
                    </GlassButton>
                  </GlassPanel>
                </View>
              );
            }}
          />
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
  infoBanner: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  infoContent: {
    padding: 15,
  },
  infoBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  infoBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.successMint,
    letterSpacing: 0.8,
  },
  infoDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  cardWrapper: {
    marginBottom: 10,
  },
  cardContent: {
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 15,
    marginRight: 12,
    backgroundColor: colors.surfaceSunken,
  },
  cardDetails: {
    flex: 1,
    paddingRight: 8,
  },
  photoName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 5,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  pillLocation: {
    backgroundColor: alpha(colors.warningAmber, 0.12),
  },
  pillClean: {
    backgroundColor: alpha(colors.successMint, 0.12),
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cleanBtn: {
    width: 'auto',
    height: 38,
  },
  cleanBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.successMint,
    marginLeft: 5,
  },
});
