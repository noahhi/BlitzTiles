import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Settings {
  theme: 'dark' | 'light';
  leftHanded: boolean;
  autoZoom: boolean;
  scorePreview: boolean;
  lastMoveHighlight: boolean;
  scorePopup: boolean;
  timerUrgency: boolean;
}

interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  toggleTheme: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: 'dark',
      leftHanded: false,
      autoZoom: true,
      scorePreview: true,
      lastMoveHighlight: true,
      scorePopup: true,
      timerUrgency: true,
      set: (key, value) => set({ [key]: value }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
    }),
    { name: 'blitztiles-settings' },
  ),
);
