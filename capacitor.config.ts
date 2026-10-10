import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.wakeful.home',
  appName: 'Wakeful',
  webDir: 'dist',
  backgroundColor: '#000000',
  android: { allowMixedContent: false, backgroundColor: '#000000' },
};
export default config;
