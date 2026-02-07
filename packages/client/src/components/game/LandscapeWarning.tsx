import './LandscapeWarning.css';

export function LandscapeWarning() {
  return (
    <div className="landscape-warning">
      <div className="landscape-warning-content">
        <div className="rotate-icon">&#x21BB;</div>
        <div>Please rotate your device to portrait mode</div>
      </div>
    </div>
  );
}
