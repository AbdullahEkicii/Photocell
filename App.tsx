import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
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

import { PhotoAsset } from './src/services/mediaScanner';
import {
  initializeNotifications,
  getNotificationSettings,
} from './src/services/notificationService';
import { AnalyticsService, ScreenName } from './src/services/analyticsService';
import * as Notifications from 'expo-notifications';

type AppScreen =
  | TabType
  | 'reviewer'
  | 'photo_compressor'
  | 'videos'
  | 'exif_cleaner'
  | 'heavy_media'
  | 'contacts_cleaner';

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('home');
  const [previousTab, setPreviousTab] = useState<TabType>('photos');
  const [assetsToReview, setAssetsToReview] = useState<PhotoAsset[]>([]);
  const [groupedAssetsToReview, setGroupedAssetsToReview] = useState<
    PhotoAsset[][] | undefined
  >(undefined);
  const [reviewTitle, setReviewTitle] = useState<string>('');
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  useEffect(() => {
    initializeNotifications().catch(() => {});
    getNotificationSettings()
      .then((s) => {
        if (typeof s.fullscreenEnabled === 'boolean') {
          setIsFullScreen(s.fullscreenEnabled);
        }
      })
      .catch(() => {});

    // Listen to user tapping a scheduled notification
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const screen = response.notification.request.content.data
          ?.screen as TabType | undefined;
        if (
          screen &&
          ['home', 'photos', 'timeline', 'tools', 'vault', 'report'].includes(
            screen
          )
        ) {
          setCurrentScreen(screen);
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  // Track screen transitions in Firebase Analytics
  useEffect(() => {
    let screenName: ScreenName = 'home';
    switch (currentScreen) {
      case 'home':
        screenName = 'home';
        break;
      case 'photos':
        screenName = 'photos_dashboard';
        break;
      case 'timeline':
        screenName = 'timeline';
        break;
      case 'tools':
        screenName = 'tools_hub';
        break;
      case 'photo_compressor':
        screenName = 'photo_compressor';
        break;
      case 'videos':
        screenName = 'video_compressor';
        break;
      case 'exif_cleaner':
        screenName = 'exif_cleaner';
        break;
      case 'heavy_media':
        screenName = 'heavy_media';
        break;
      case 'contacts_cleaner':
        screenName = 'contacts_cleaner';
        break;
      case 'vault':
        screenName = 'vault';
        break;
      case 'report':
        screenName = 'report';
        break;
      case 'reviewer':
        screenName = 'reviewer';
        break;
      default:
        screenName = 'home';
    }
    AnalyticsService.logScreenView(screenName).catch(() => {});
  }, [currentScreen]);

  const goToReview = (
    assets: PhotoAsset[],
    title?: string,
    groupedAssets?: PhotoAsset[][]
  ) => {
    setAssetsToReview(assets);
    setGroupedAssetsToReview(groupedAssets);
    setReviewTitle(title || '');
    if (
      ['home', 'photos', 'timeline', 'tools', 'vault', 'report'].includes(
        currentScreen
      )
    ) {
      setPreviousTab(currentScreen as TabType);
    }
    setCurrentScreen('reviewer');
  };

  const goBackFromReview = () => {
    setCurrentScreen(previousTab);
  };

  const handleSelectTab = (tab: TabType) => {
    setCurrentScreen(tab);
  };

  const handleSelectTool = (tool: ToolScreenType) => {
    setCurrentScreen(tool);
  };

  const isSubScreen = [
    'reviewer',
    'photo_compressor',
    'exif_cleaner',
    'heavy_media',
    'contacts_cleaner',
  ].includes(currentScreen);

  const activeTab: TabType = isSubScreen
    ? previousTab
    : (currentScreen as TabType);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar hidden={isFullScreen} style="dark" />
        {showSplash ? (
          <CustomSplashScreen onFinish={() => setShowSplash(false)} />
        ) : (
          <>
            {currentScreen === 'home' ? (
              <HomeScreen
                onNavigate={handleSelectTab}
                onFullscreenToggle={(val) => setIsFullScreen(val)}
              />
            ) : currentScreen === 'photos' ? (
              <DashboardScreen
                onSmartClean={goToReview}
                onNavigate={handleSelectTab}
                onFullscreenToggle={(val) => setIsFullScreen(val)}
              />
            ) : currentScreen === 'timeline' ? (
              <TimelineScreen
                onStartMonthDetox={(assets, monthTitle) =>
                  goToReview(assets, monthTitle)
                }
              />
            ) : currentScreen === 'tools' ? (
              <ToolsHubScreen onSelectTool={handleSelectTool} />
            ) : currentScreen === 'photo_compressor' ? (
              <PhotoCompressorScreen onBack={() => setCurrentScreen('tools')} />
            ) : currentScreen === 'videos' ? (
              <VideoCompressorScreen />
            ) : currentScreen === 'exif_cleaner' ? (
              <ExifCleanerScreen onBack={() => setCurrentScreen('tools')} />
            ) : currentScreen === 'heavy_media' ? (
              <HeavyMediaScreen onBack={() => setCurrentScreen('tools')} />
            ) : currentScreen === 'contacts_cleaner' ? (
              <ContactsCleanerScreen onBack={() => setCurrentScreen('tools')} />
            ) : currentScreen === 'vault' ? (
              <VaultScreen />
            ) : currentScreen === 'report' ? (
              <ReportScreen />
            ) : (
              <ReviewerScreen
                assets={assetsToReview}
                groupedAssets={groupedAssetsToReview}
                onBack={goBackFromReview}
                categoryTitle={reviewTitle}
              />
            )}

            {!isSubScreen && (
              <BottomNavBar activeTab={activeTab} onSelectTab={handleSelectTab} />
            )}
          </>
        )}
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
