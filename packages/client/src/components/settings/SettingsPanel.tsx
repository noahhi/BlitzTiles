import { useSettingsStore, type Settings } from '../../hooks/useSettingsStore';
import { useTheme } from '../../hooks/useTheme';
import './SettingsPanel.css';

const toggles: { key: keyof Settings; label: string; description: string }[] = [
  {
    key: 'leftHanded',
    label: 'Left-Handed Mode',
    description: 'Move Submit button to the left side',
  },
  {
    key: 'autoZoom',
    label: 'Auto-Zoom',
    description: 'Zoom into the board when placing first tile',
  },
  {
    key: 'scorePreview',
    label: 'Score Preview',
    description: 'Show point value while placing tiles',
  },
  {
    key: 'lastMoveHighlight',
    label: 'Last Move Highlight',
    description: 'Outline the previous move on the board',
  },
  { key: 'scorePopup', label: 'Score Popup', description: 'Show floating score after each move' },
  {
    key: 'timerUrgency',
    label: 'Timer Urgency Effects',
    description: 'Pulse and flash when time is low',
  },
];

export function SettingsPanel() {
  const store = useSettingsStore();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="settings-panel">
      {/* Theme toggle */}
      <div className="settings-row theme-row">
        <div className="settings-label">
          <span className="settings-name">Theme</span>
          <span className="settings-desc">Switch between dark and light mode</span>
        </div>
        <div className="theme-toggle">
          <button
            className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => theme !== 'dark' && toggleTheme()}
          >
            🌙 Dark
          </button>
          <button
            className={`theme-option ${theme === 'light' ? 'active' : ''}`}
            onClick={() => theme !== 'light' && toggleTheme()}
          >
            ☀️ Light
          </button>
        </div>
      </div>

      {/* Other settings toggles */}
      {toggles.map(({ key, label, description }) => (
        <label key={key} className="settings-row">
          <div className="settings-label">
            <span className="settings-name">{label}</span>
            <span className="settings-desc">{description}</span>
          </div>
          <div
            className={`toggle-switch${store[key] ? ' on' : ''}`}
            onClick={() => store.set(key, !store[key])}
          >
            <div className="toggle-knob" />
          </div>
        </label>
      ))}
    </div>
  );
}
