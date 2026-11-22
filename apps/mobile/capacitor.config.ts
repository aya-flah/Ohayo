import type { CapacitorConfig } from '@capacitor/cli';

/** One codebase: the Android app shows the same build as the website (apps/web). */
const config: CapacitorConfig = {
  appId: 'tn.sonae.app',
  appName: 'Sonae',
  webDir: '../web/dist',
  android: {
    backgroundColor: '#0b121e',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#0b121e',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: false,
      backgroundColor: '#0b121e',
    },
  },
};

export default config;
