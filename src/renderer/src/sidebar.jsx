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
      <span className="bone-category">{bone.category || 'Bone'}</span>
      <p className="bone-name">{bone.namefr || bone.name}</p>
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
