import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/i18n';
import { CustomSplashScreen } from './src/components/splash/CustomSplashScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { TimelineScreen } from './src/screens/TimelineScreen';
import { ToolsHubScreen, ToolScreenType } from './src/screens/ToolsHubScreen';
import { PhotoCompressorScreen } from './src/screens/PhotoCompressorScreen';
import { VideoCompressorScreen } from './src/screens/VideoCompressorScreen';
import { ExifCleanerScreen } from './src/screens/ExifCleanerScreen';
import { HeavyMediaScreen } from './src/screens/HeavyMediaScreen';
import { ContactsCleanerScreen } from './src/screens/ContactsCleanerScreen';
import { VaultScreen } from './src/screens/VaultScreen';
import { ReportScreen } from './src/screens/ReportScreen';
import { ReviewerScreen } from './src/screens/ReviewerScreen';
import { BottomNavBar, TabType } from './src/components/navigation/BottomNavBar';

import { PhotoAsset, checkMediaPermissionsStatus, prewarmPhotoScan } from './src/services/mediaScanner';
import { addReviewedAssets } from './src/services/timelineScanner';
import { ScanCacheService } from './src/services/scanCacheService';
import { isOnboardingCompleted, markOnboardingCompleted } from './src/services/onboardingService';
import { OnboardingScreen } from './src/components/onboarding/OnboardingScreen';
import {
  initializeNotifications,
  getNotificationSettings,
} from './src/services/notificationService';
import { AnalyticsService, ScreenName } from './src/services/analyticsService';
import * as Notifications from 'expo-notifications';

type ToolSubScreen = Exclude<ToolScreenType, never>;
type AppScreen = TabType | 'reviewer' | ToolSubScreen;

const TAB_SCREENS: TabType[] = ['home', 'photos', 'timeline', 'tools', 'vault', 'report'];

/**
 * Screens pushed on top of a tab. They hide the bottom bar and own a back
 * action — `videos` used to be missing here, which left the video compressor
 * with no way back and no highlighted tab.
 */
const SUB_SCREENS: AppScreen[] = [
  'reviewer',
  'photo_compressor',
  'videos',
  'exif_cleaner',
  'heavy_media',
  'contacts_cleaner',
];

const isTab = (screen: AppScreen): screen is TabType =>
  TAB_SCREENS.includes(screen as TabType);

const TOOL_SCREENS: ToolScreenType[] = [
  'photo_compressor',
  'videos',
  'exif_cleaner',
  'heavy_media',
  'contacts_cleaner',
];

const isToolScreen = (screen: string): screen is ToolScreenType =>
  TOOL_SCREENS.includes(screen as ToolScreenType);

const SCREEN_ANALYTICS_NAME: Record<AppScreen, ScreenName> = {
  home: 'home',
  photos: 'photos_dashboard',
  timeline: 'timeline',
  tools: 'tools_hub',
  vault: 'vault',
  report: 'report',
  reviewer: 'reviewer',
  photo_compressor: 'photo_compressor',
  videos: 'video_compressor',
  exif_cleaner: 'exif_cleaner',
  heavy_media: 'heavy_media',
  contacts_cleaner: 'contacts_cleaner',
};

interface ReviewRequest {
  assets: PhotoAsset[];
  groupedAssets?: PhotoAsset[][];
  title: string;
  /** Set when the review was started from a timeline month, so progress sticks. */
  monthId?: string;
  monthTotal?: number;
}

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('home');
  const [previousTab, setPreviousTab] = useState<TabType>('home');
  const [review, setReview] = useState<ReviewRequest | null>(null);
  // Full screen is the default (status bar and, on phones with on-screen
  // buttons, the navigation bar are hidden); Settings can turn it off.
  const [isFullScreen, setIsFullScreen] = useState<boolean>(true);
  const [onboarding, setOnboarding] = useState<'checking' | 'needed' | 'done'>('checking');

  useEffect(() => {
    isOnboardingCompleted()
      .then((done) => setOnboarding(done ? 'done' : 'needed'))
      .catch(() => setOnboarding('done'));
  }, []);

  const handleOnboardingFinished = useCallback(() => {
    markOnboardingCompleted().catch(() => {});
    setOnboarding('done');
  }, []);
  /** Bumped to force a tab screen to refetch after a review changed the gallery. */
  const [galleryVersion, setGalleryVersion] = useState<number>(0);

  const reviewRef = useRef<ReviewRequest | null>(null);
  reviewRef.current = review;

  /**
   * Routes a notification's `data.screen` payload to the right place.
   *
   * The video-optimization reminder points at `videos`, a tool screen rather
   * than a tab. The previous version only recognised tab names, so tapping
   * that particular notification silently did nothing.
   */
  const openScreenFromNotification = useCallback((screen: string) => {
    if (TAB_SCREENS.includes(screen as TabType)) {
      setPreviousTab(screen as TabType);
      setCurrentScreen(screen as TabType);
      return;
    }
    if (isToolScreen(screen)) {
      setPreviousTab('tools');
      setCurrentScreen(screen);
    }
  }, []);

  // Reminder scheduling and the background gallery scan wait until onboarding
  // is done. They used to start immediately, so a new user could get an OS
  // permission dialog before the app had explained why it was asking.
  useEffect(() => {
    if (onboarding !== 'done') return;

    initializeNotifications().catch(() => {});

    // Start the gallery scan quietly in the background as soon as the app
    // opens, so it's largely or fully done by the time the user actually taps
    // into the Photos tab — instead of the whole pipeline only starting then.
    // Only when permission is already granted: a silent background task is
    // the wrong moment to pop the OS permission dialog.
    checkMediaPermissionsStatus()
      .then((status) => {
        if (status.granted) prewarmPhotoScan();
      })
      .catch(() => {});
  }, [onboarding]);

  useEffect(() => {
    getNotificationSettings()
      .then((s) => {
        if (typeof s.fullscreenEnabled === 'boolean') {
          setIsFullScreen(s.fullscreenEnabled);
        }
      })
      .catch(() => {});

    // Listen for the user tapping a notification while the app is running.
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const screen = response.notification.request.content.data?.screen as
          | string
          | undefined;
        if (screen) openScreenFromNotification(screen);
      }
    );

    // Cold start: the app was launched by tapping a notification, so the
    // listener above never fires for it — the last response has to be read
    // explicitly instead.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const screen = response?.notification.request.content.data?.screen as
          | string
          | undefined;
        if (screen) openScreenFromNotification(screen);
      })
      .catch(() => {});

    return () => {
      subscription.remove();
    };
  }, [openScreenFromNotification]);

  // Track screen transitions in Firebase Analytics
  useEffect(() => {
    AnalyticsService.logScreenView(SCREEN_ANALYTICS_NAME[currentScreen] ?? 'home').catch(
      () => {}
    );
  }, [currentScreen]);

  const isSubScreen = SUB_SCREENS.includes(currentScreen);

  const goToReview = useCallback(
    (
      assets: PhotoAsset[],
      title?: string,
      groupedAssets?: PhotoAsset[][],
      monthId?: string
    ) => {
      setReview({
        assets,
        groupedAssets,
        title: title || '',
        monthId,
        monthTotal: monthId ? assets.length : undefined,
      });
      setCurrentScreen((screen) => {
        if (isTab(screen)) setPreviousTab(screen);
        return 'reviewer';
      });
    },
    []
  );

  /**
   * Persists which photos the user actually looked at, then returns to the tab
   * the review was started from.
   */
  const handleReviewFinished = useCallback((reviewedIds: string[]) => {
    const request = reviewRef.current;
    if (request?.monthId && reviewedIds.length > 0) {
      // Drop the cached months synchronously: the timeline remounts on the next
      // line and would otherwise re-read the pre-review percentages, because
      // addReviewedAssets only invalidates once its file write resolves.
      ScanCacheService.invalidateTimeline();
      addReviewedAssets(request.monthId, reviewedIds, request.monthTotal).catch(() => {});
    }
    if (reviewedIds.length > 0) setGalleryVersion((v) => v + 1);
    setReview(null);
    setCurrentScreen(previousTab);
  }, [previousTab]);

  const handleSelectTab = useCallback((tab: TabType) => {
    setCurrentScreen(tab);
    setPreviousTab(tab);
  }, []);

  const handleSelectTool = useCallback((tool: ToolScreenType) => {
    setCurrentScreen(tool);
  }, []);

  const goBackToTools = useCallback(() => setCurrentScreen('tools'), []);

  // Android hardware/gesture back: leave the sub-screen instead of the app.
  useEffect(() => {
    if (!isSubScreen) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (currentScreen === 'reviewer') {
        handleReviewFinished([]);
      } else {
        goBackToTools();
      }
      return true;
    });
    return () => subscription.remove();
  }, [isSubScreen, currentScreen, handleReviewFinished, goBackToTools]);

  const activeTab: TabType = isSubScreen ? previousTab : (currentScreen as TabType);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return (
          <HomeScreen
            key={`home-${galleryVersion}`}
            onNavigate={handleSelectTab}
            onFullscreenToggle={setIsFullScreen}
          />
        );
      case 'photos':
        return (
          <DashboardScreen
            key={`photos-${galleryVersion}`}
            onSmartClean={goToReview}
            onFullscreenToggle={setIsFullScreen}
          />
        );
      case 'timeline':
        return (
          <TimelineScreen
            key={`timeline-${galleryVersion}`}
            onStartMonthDetox={(assets, monthTitle, monthId) =>
              goToReview(assets, monthTitle, undefined, monthId)
            }
          />
        );
      case 'tools':
        return <ToolsHubScreen onSelectTool={handleSelectTool} />;
      case 'photo_compressor':
        return <PhotoCompressorScreen onBack={goBackToTools} />;
      case 'videos':
        return <VideoCompressorScreen onBack={goBackToTools} />;
      case 'exif_cleaner':
        return <ExifCleanerScreen onBack={goBackToTools} />;
      case 'heavy_media':
        return <HeavyMediaScreen onBack={goBackToTools} />;
      case 'contacts_cleaner':
        return <ContactsCleanerScreen onBack={goBackToTools} />;
      case 'vault':
        return <VaultScreen />;
      case 'report':
        return <ReportScreen key={`report-${galleryVersion}`} />;
      case 'reviewer':
        return (
          <ReviewerScreen
            assets={review?.assets ?? []}
            groupedAssets={review?.groupedAssets}
            categoryTitle={review?.title}
            onFinish={handleReviewFinished}
          />
        );
      default:
        return <HomeScreen onNavigate={handleSelectTab} onFullscreenToggle={setIsFullScreen} />;
    }
  };

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar hidden={isFullScreen} style="dark" />
        {/* Hides the Android navigation bar (the back/home/recents buttons on
            button-navigation phones) so the app draws over that strip; a swipe
            from the edge brings it back briefly. */}
        <NavigationBar hidden={isFullScreen} style="dark" />
        {showSplash ? (
          <CustomSplashScreen onFinish={() => setShowSplash(false)} />
        ) : onboarding === 'checking' ? null : onboarding === 'needed' ? (
          <OnboardingScreen onFinish={handleOnboardingFinished} />
        ) : (
          <>
            {renderScreen()}
            {!isSubScreen && (
              <BottomNavBar activeTab={activeTab} onSelectTab={handleSelectTab} />
            )}
          </>
        )}
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
