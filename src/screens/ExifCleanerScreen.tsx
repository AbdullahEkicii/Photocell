import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import {
  ArrowLeft,
  ShieldCheck,
  MapPin,
  Sparkles,
  Info,
  Check,
  EyeOff,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';

import { AtmosphericBackground } from '../components/glass/AtmosphericBackground';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { colors } from '../theme/colors';
import {
  fetchExifCandidates,
  cleanPhotoMetadata,
  saveCleanedPhoto,
  ExifPhotoItem,
} from '../services/exifCleaner';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  onBack: () => void;
}

export const ExifCleanerScreen: React.FC<Props> = ({ onBack }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<ExifPhotoItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadPhotos = useCallback(async () => {
    try {
      setLoading(true);
      const items = await fetchExifCandidates(40);
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
      const success = await saveCleanedPhoto(item.id, cleanUri, false);
      setProcessingId(null);

      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          t('general.success'),
          t('exif_cleaner.clean_success')
        );
      }
    } catch (err) {
      setProcessingId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(t('general.error'), 'Failed cleaning metadata');
    }
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
          <Text style={styles.topBarTitle}>{t('exif_cleaner.title')}</Text>
          <View style={{ width: 40 }} />
        </Animated.View>

        {/* Info Banner */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.infoBanner}>
          <GlassPanel borderRadius={24} style={styles.infoPanel} contentStyle={styles.infoContent} intensity={25}>
            <View style={styles.infoBadgeRow}>
              <ShieldCheck color={colors.successMint} size={18} style={{ marginRight: 6 }} />
              <Text style={styles.infoBadgeText}>{t('exif_cleaner.clean_badge')}</Text>
            </View>
            <Text style={styles.infoDesc}>{t('exif_cleaner.info_text')}</Text>
          </GlassPanel>
        </Animated.View>

        {/* Photo List */}
        {loading ? (
          <Animated.View entering={FadeIn} style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.successMint} style={{ marginBottom: 12 }} />
            <Text style={styles.loadingText}>{t('dashboard.status.scanning')}</Text>
          </Animated.View>
        ) : (
          <FlashList
            data={photos}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(50, insets.bottom + 20) },
            ]}
            renderItem={({ item }) => {
              const isBusy = processingId === item.id;
              return (
                <View style={styles.cardWrapper}>
                  <GlassPanel borderRadius={24} style={styles.photoCard} contentStyle={styles.photoCardContent} intensity={25}>
                    <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="cover" />
                    
                    <View style={styles.cardDetails}>
                      <Text style={styles.photoName} numberOfLines={1}>{item.filename}</Text>
                      <View style={styles.locationPill}>
                        <MapPin color={colors.warningAmber} size={12} style={{ marginRight: 4 }} />
                        <Text style={styles.locationPillText}>{t('exif_cleaner.location_detected')}</Text>
                      </View>
                    </View>

                    <GlassButton
                      borderRadius={20}
                      borderColor={colors.successMint}
                      style={styles.cleanBtn}
                      onPress={() => handleCleanPhoto(item)}
                      disabled={isBusy}
                    >
                      {isBusy ? (
                        <ActivityIndicator size="small" color={colors.successMint} />
                      ) : (
                        <>
                          <EyeOff color={colors.successMint} size={14} style={{ marginRight: 4 }} />
                          <Text style={styles.cleanBtnText}>{t('exif_cleaner.clean_and_save')}</Text>
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
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  infoBanner: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  infoPanel: {
    borderRadius: 24,
  },
  infoContent: {
    padding: 16,
  },
  infoBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.successMint,
    letterSpacing: 1,
  },
  infoDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  cardWrapper: {
    marginBottom: 12,
  },
  photoCard: {
    borderRadius: 24,
  },
  photoCardContent: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 16,
    marginRight: 14,
  },
  cardDetails: {
    flex: 1,
    paddingRight: 8,
  },
  photoName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  locationPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.warningAmber,
  },
  cleanBtn: {
    paddingHorizontal: 12,
    height: 38,
  },
  cleanBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.successMint,
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
});
