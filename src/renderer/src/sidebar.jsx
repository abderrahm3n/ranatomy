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
      artère: '#EF4444',
      veine: '#3B82F6',
      'sinus / plexus': '#9b7ec9'
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
function colorForCategory(category, categoryColors) {
  if (!category) return FALLBACK_COLORS[0]
  if (categoryColors[category]) return categoryColors[category]

  let hash = 0
  for (let i = 0; i < category.length; i++) {
    hash = (hash << 5) - hash + category.charCodeAt(i)
    hash |= 0
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length]
}

function displayNameFor(entity) {
  return entity.namefr || entity.name || entity.id || 'Structure'
}

function Sidebar({ entity, isIsolated, onToggleIsolation, onHideSelection }) {
  if (!entity) {
    return (
      <div className="sidebar sidebar-empty">
        <i className="ti ti-focus-2" aria-hidden="true"></i>
        <p>Sélectionnez une structure pour voir les détails</p>
        {isIsolated && (
          <button className="pill-show-all" onClick={onToggleIsolation}>
            Show all
          </button>
        )}
      </div>
    )
  }

  const meta = SYSTEM_META[entity.system] || DEFAULT_META
  const categoryColor = colorForCategory(entity.category, meta.categoryColors)
  const displayName = displayNameFor(entity)
  const showCategory = Boolean(entity.category)

  return (
    <div className="sidebar">
      {showCategory && (
        <span
          className="entity-category"
          style={{
            color: categoryColor,
            borderColor: categoryColor,
            backgroundColor: `${categoryColor}1a`
          }}
        >
          {entity.category || meta.categoryFallback}
        </span>
      )}
      <p className="entity-name">{displayName}</p>
      {entity.description && <p className="entity-description">{entity.description}</p>}
      <div className="sidebar-divider" />
      <div className="sidebar-actions">
        <button
          className={`btn btn-primary ${isIsolated ? 'active' : ''}`}
          onClick={onToggleIsolation}
        >
          <i className={`ti ${isIsolated ? 'ti-eye' : 'ti-focus-2'}`} aria-hidden="true"></i>
          {isIsolated ? 'Show all' : 'Isolate'}
          <kbd className="btn-kbd">I</kbd>
        </button>
        <button className="btn btn-ghost" onClick={onHideSelection}>
          <i className="ti ti-eye-off" aria-hidden="true"></i>
          Hide
          <kbd className="btn-kbd">H</kbd>
        </button>
      </div>
    </div>
  )
}

export default Sidebar
