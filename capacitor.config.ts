import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.wakeful.home',
  appName: 'Wakeful',
  webDir: 'dist',
  backgroundColor: '#0b0e13',
  android: { allowMixedContent: false, backgroundColor: '#0b0e13' },
};
export default config;
