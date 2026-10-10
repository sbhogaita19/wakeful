export type Tab = 'home' | 'spend' | 'bills' | 'wealth' | 'aware' | 'values' | 'income' | 'import' | 'settings';
export interface ViewProps { go: (t: Tab) => void; }
