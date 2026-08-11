import { useRef, useState, useCallback } from 'react'
import ThreeScene from './threeScene'
import Sidebar from './sidebar'
import SearchBox from './searchbox'
import bonesData from './assets/bones.json'
import Reset from './reset'

function App() {
  const [selectedBone, setSelectedBone] = useState(null)
  const [isIsolated, setIsIsolated] = useState(false)
  const sceneRef = useRef(null)

  const handleSelectBone = useCallback((bone) => {
    setSelectedBone(bone)
  }, [])

  const handleIsolateChange = useCallback((val) => {
    setIsIsolated(val)
  }, [])

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-brand">
          <i className="ti ti-bone" aria-hidden="true"></i>
          <span>Anatomy Viewer</span>
        </div>
        <SearchBox
          bones={bonesData}
          onSelectBone={(bone) => {
            sceneRef.current?.selectBone(bone)
          }}
        />
      </div>

      <div className="app-body">
        <div className="canvas-area">
          <ThreeScene
            ref={sceneRef}
            onSelectBone={handleSelectBone}
            onIsolateChange={handleIsolateChange}
          />
        </div>
        <Sidebar
          bone={selectedBone}
          isIsolated={isIsolated}
          onToggleIsolate={() => sceneRef.current?.toggleIsolate()}
          onHide={() => sceneRef.current?.hideSelected()}
        />
        <Reset onReset={() => sceneRef.current?.reset()} />
      </div>
    </div>
  )
}

export default App
