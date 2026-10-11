export type Tab = 'home' | 'spend' | 'bills' | 'wealth' | 'aware' | 'values' | 'income' | 'import' | 'share' | 'settings';
export interface ViewProps { go: (t: Tab) => void; }
