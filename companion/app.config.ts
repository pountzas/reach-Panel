import type { ExpoConfig } from 'expo/config';

import { androidVersionCode, VERSION } from './src/versioning.cjs';

export { VERSION, androidVersionCode };

const easProjectId = process.env.EAS_PROJECT_ID;

const config: ExpoConfig = {
  name: 'ReachPanel Companion',
  slug: 'reachpanel-companion',
  version: VERSION,
  orientation: 'landscape',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  scheme: 'reachpanel-companion',
  ios: {
    supportsTablet: true,
    requireFullScreen: true,
    bundleIdentifier: 'com.reachpanel.companion',
    infoPlist: {
      UIDeviceFamily: [2],
    },
  },
  android: {
    package: 'com.reachpanel.companion',
    versionCode: androidVersionCode(VERSION),
    softwareKeyboardLayoutMode: 'pan',
    adaptiveIcon: {
      backgroundColor: '#121820',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
    ],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    [
      'expo-camera',
      {
        cameraPermission: 'Allow ReachPanel Companion to scan the pairing QR code.',
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission:
          'Allow ReachPanel Companion to capture dictation audio for the Windows host.',
        recordAudioAndroid: true,
      },
    ],
    [
      'expo-navigation-bar',
      {
        enforceContrast: true,
        style: 'light',
        hidden: true,
      },
    ],
    'expo-screen-orientation',
    'expo-asset',
  ],
  web: {
    favicon: './assets/favicon.png',
  },
  extra: {
    eas: easProjectId ? { projectId: easProjectId } : {},
  },
};

export default config;
