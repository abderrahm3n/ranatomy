function Reset({ onReset }){
  return(
    <button className='reset-fab' onClick={onReset} aria-label="Reset view">
      <i className='ti ti-refresh' aria-hidden="true"></i>
      <span className="reset-fab-label">Reset view</span>
    </button>
  )

}

export default Reset
