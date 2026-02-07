import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Settings {
  leftHanded: boolean;
  autoZoom: boolean;
  scorePreview: boolean;
  lastMoveHighlight: boolean;
  scorePopup: boolean;
  timerUrgency: boolean;
}

interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      leftHanded: false,
      autoZoom: true,
      scorePreview: true,
      lastMoveHighlight: true,
      scorePopup: true,
      timerUrgency: true,
      set: (key, value) => set({ [key]: value }),
    }),
    { name: 'blitztiles-settings' },
  ),
);
