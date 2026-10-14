import { SYSTEMS } from './systems'

// Ordered list of anatomical systems the tray can control. Add an entry to
// systems.js and load the matching model in threeScene.jsx under the same
// key — nothing else needs to change.
function SystemTray({ systemVisibility, onToggleSystem }) {
  return (
    <div className="system-tray">
      {SYSTEMS.map(({ key, label, icon }) => {
        const isOn = systemVisibility[key] !== false
        return (
          <button
            key={key}
            className={`system-btn ${isOn ? 'active' : 'off'}`}
            onClick={() => onToggleSystem(key)}
            aria-label={label}
            aria-pressed={isOn}
          >
            <i className={`ti ${icon}`} aria-hidden="true"></i>
            <span className="system-btn-label">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default SystemTray
