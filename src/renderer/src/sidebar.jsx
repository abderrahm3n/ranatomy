// Color per anatomical category. Keys should match `category` values in bones-data.json.
const CATEGORY_COLORS = {
  'long': '#3B82F6',
  'court': '#F59E0B',
  'plat': '#EF4444',
}

const FALLBACK_COLORS = ['#5ba3c9', '#c97d5b', '#9b7ec9', '#5bc98e', '#c9a15b', '#c95b7d', '#5bc9c0']

// Deterministic fallback so categories missing from CATEGORY_COLORS still get a stable color.
function getCategoryColor(category) {
  if (!category) return FALLBACK_COLORS[0]
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category]
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
        <i className="ti ti-bone-off" aria-hidden="true"></i>
        <p>Select a bone to see details</p>
        {isIsolated && (
          <button className="pill-show-all" onClick={onToggleIsolate}>
            Show all
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="sidebar">
      <span
        className="bone-category"
        style={{
          color: getCategoryColor(bone.category),
          borderColor: getCategoryColor(bone.category),
          backgroundColor: `${getCategoryColor(bone.category)}1a`,
        }}
      >
        {bone.category || 'Bone'}
      </span>
      <p className="bone-name">{bone.namefr }</p>
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
