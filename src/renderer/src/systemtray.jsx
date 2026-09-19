// Ordered list of anatomical systems the tray can control. Add an entry
// here (and load the matching model in threeScene.jsx, tagging its meshes
// under the same key) to grow the tray — nothing else needs to change.
import { SYSTEMS } from './systems'

function SystemTray({ systems, onToggle }) {
  return (
    <div className="system-tray">
      {SYSTEMS.map(({ key, label, icon }) => {
        const isOn = systems[key] !== false
        return (
          <button
            key={key}
            className={`system-btn ${isOn ? 'active' : 'off'}`}
            onClick={() => onToggle(key)}
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

