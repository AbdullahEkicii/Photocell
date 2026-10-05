import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Sparkles,
  Images,
  Calendar,
  Layers,
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle2,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { GlassPanel } from '../glass/GlassPanel';
import { colors, alpha, radius } from '../../theme/colors';

const { width } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const OnboardingGuideModal: React.FC<Props> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState<number>(0);

  const steps = [
    {
      icon: Images,
      iconColor: colors.primary,
      titleKey: 'guide.step1_title',
      descKey: 'guide.step1_desc',
      accentColor: colors.primary,
    },
    {
      icon: Calendar,
      iconColor: colors.accent,
      titleKey: 'guide.step2_title',
      descKey: 'guide.step2_desc',
      accentColor: colors.accent,
    },
    {
      icon: Layers,
      iconColor: colors.successMint,
      titleKey: 'guide.step3_title',
      descKey: 'guide.step3_desc',
      accentColor: colors.successMint,
    },
  ];

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onClose();
  };

  const currentStepData = steps[currentStep];
  const IconComponent = currentStepData.icon;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <GlassPanel
          borderRadius={32}
          borderColor={alpha(currentStepData.accentColor, 0.28)}
          fillColor={colors.surface}
          style={styles.modalCard}
          contentStyle={styles.modalContent}
          intensity={45}
          glowAccent={currentStepData.accentColor}
        >
          {/* Close button */}
          <TouchableOpacity activeOpacity={0.8} onPress={onClose} style={styles.closeBtn}>
            <X color={colors.textMuted} size={20} />
          </TouchableOpacity>

          {/* Icon Badge */}
          <Animated.View key={`icon-${currentStep}`} entering={ZoomIn.duration(300)} style={[styles.iconBadge, { backgroundColor: `${currentStepData.accentColor}18`, borderColor: `${currentStepData.accentColor}50` }]}>
            <IconComponent color={currentStepData.accentColor} size={36} strokeWidth={2.4} />
          </Animated.View>

          {/* Title and Description */}
          <Animated.View key={`text-${currentStep}`} entering={FadeInDown.duration(300)} style={styles.textGroup}>
            <Text style={styles.stepTitle}>{t(currentStepData.titleKey)}</Text>
            <Text style={styles.stepDesc}>{t(currentStepData.descKey)}</Text>
          </Animated.View>

          {/* Pagination Indicators */}
          <View style={styles.dotsRow}>
            {steps.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  currentStep === index && [
                    styles.dotActive,
                    { backgroundColor: currentStepData.accentColor },
                  ],
                ]}
              />
            ))}
          </View>

          {/* Navigation Controls */}
          <View style={styles.actionRow}>
            {currentStep > 0 ? (
              <TouchableOpacity activeOpacity={0.8} onPress={handlePrev} style={styles.prevBtn}>
                <ChevronLeft color={colors.textSecondary} size={20} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 44 }} />
            )}

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleNext}
              style={styles.nextBtn}
            >
              <LinearGradient
                colors={[
                  currentStepData.accentColor,
                  alpha(currentStepData.accentColor, 0.82),
                ]}
                style={styles.nextBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.nextBtnText}>
                  {currentStep === steps.length - 1
                    ? t('guide.got_it')
                    : t('guide.next_step')}
                </Text>
                <ChevronRight color="#FFF" size={16} strokeWidth={2.5} style={{ marginLeft: 4 }} />
              </LinearGradient>
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
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 32,
  },
  modalContent: {
    padding: 24,
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  textGroup: {
    alignItems: 'center',
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  stepDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.borderStrong,
  },
  dotActive: {
    width: 24,
    borderRadius: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  prevBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtn: {
    flex: 1,
    marginLeft: 12,
    height: 48,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  nextBtnGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  nextBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
