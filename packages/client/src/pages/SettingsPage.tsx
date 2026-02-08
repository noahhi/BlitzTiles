import { useNavigate } from 'react-router-dom';
import { SettingsPanel } from '../components/settings/SettingsPanel';
import './SettingsPage.css';

export function SettingsPage() {
  const navigate = useNavigate();

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          &#x2190;
        </button>
        <h2 className="settings-title">Settings</h2>
      </div>
      <div className="settings-content">
        <SettingsPanel />
      </div>
    </div>
  );
}
