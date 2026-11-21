import type { CapacitorConfig } from '@capacitor/cli';

/** One codebase: the Android app shows the same build as the website (apps/web). */
const config: CapacitorConfig = {
  appId: 'tn.sonae.app',
  appName: 'Sonae',
  webDir: '../web/dist',
  android: {
    backgroundColor: '#00419a',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#00419a',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#00419a',
    },
  },
};

export default config;
