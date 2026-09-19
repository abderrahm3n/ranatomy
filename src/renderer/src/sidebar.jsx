// Per-system look: category palette + fallback wording. Add an entry here
// (keyed to the same system key used in threeScene.jsx / systemtray.jsx)
// whenever a new system gets its own selectable meshes. `categoryColors`
// keys should match whatever `category`-like field that system's catalog
// uses (bones-data.json today; a future vessels-data.json, etc.).
const SYSTEM_META = {
  skeletal: {
    categoryColors: {
      long: '#3B82F6',
      court: '#F59E0B',
      plat: '#EF4444'
    },
    categoryFallback: 'Os'
  },
  cardiovascular: {
    categoryColors: {
      artere: '#EF4444',
      veine: '#3B82F6',
      capillaire: '#F59E0B'
    },
    categoryFallback: 'Vaisseau'
  }
}

const DEFAULT_META = { categoryColors: {}, categoryFallback: 'Structure' }

const FALLBACK_COLORS = [
  '#5ba3c9',
  '#c97d5b',
  '#9b7ec9',
  '#5bc98e',
  '#c9a15b',
  '#c95b7d',
  '#5bc9c0'
]

// Deterministic fallback so categories missing from a system's palette
// still get a stable color, rather than all collapsing to one default.
function getCategoryColor(category, categoryColors) {
  if (!category) return FALLBACK_COLORS[0]
  if (categoryColors[category]) return categoryColors[category]
  let hash = 0
  for (let i = 0; i < category.length; i++) {
    hash = (hash << 5) - hash + category.charCodeAt(i)
    hash |= 0
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length]
}

function Sidebar({ bone, isIsolated, onToggleIsolate, onHide }) {
  if (!bone) {
    return (
      <div className="sidebar sidebar-empty">
        <i className="ti ti-focus-2" aria-hidden="true"></i>
        <p>Sélectionnez une structure pour voir les détails</p>
        {isIsolated && (
          <button className="pill-show-all" onClick={onToggleIsolate}>
            Show all
          </button>
        )}
      </div>
    )
  }

  const meta = SYSTEM_META[bone.system] || DEFAULT_META
  const color = getCategoryColor(bone.category, meta.categoryColors)
  // namefr is bone-catalog-specific; anything without a catalog entry yet
  // (e.g. an unmatched vessel mesh) falls back to its raw mesh name.
  const displayName = bone.namefr || bone.name
  // The category pill only makes sense for systems whose catalog actually
  // assigns a category (bones today). Selecting from a system with no
  // catalog entries yet would otherwise show a made-up fallback label.
  const showCategory = Boolean(bone.category) || bone.system === 'skeletal'

  return (
    <div className="sidebar">
      {showCategory && (
        <span
          className="bone-category"
          style={{
            color,
            borderColor: color,
            backgroundColor: `${color}1a`
          }}
        >
          {bone.category || meta.categoryFallback}
        </span>
      )}
      <p className="bone-name">{displayName}</p>
      {bone.description && <p className="bone-description">{bone.description}</p>}
      <div className="sidebar-divider" />
      <div className="sidebar-actions">
        <button
          className={`btn btn-primary ${isIsolated ? 'active' : ''}`}
          onClick={onToggleIsolate}
        >
          <i className={`ti ${isIsolated ? 'ti-eye' : 'ti-focus-2'}`} aria-hidden="true"></i>
          {isIsolated ? 'Show all' : 'Isolate'}
        </button>
        <button className="btn btn-ghost" onClick={onHide}>
          <i className="ti ti-eye-off" aria-hidden="true"></i>
          Hide
        </button>
      </div>
    </div>
  )
}

export default Sidebar
