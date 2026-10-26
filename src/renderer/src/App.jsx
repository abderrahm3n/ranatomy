import { useRef, useState, useCallback, useEffect } from 'react'
import ThreeScene from './threeScene'
import Sidebar from './sidebar'
import SearchBox from './searchbox'
import Reset from './reset'
import SystemTray from './systemtray'
import bonesData from './assets/bones.json'
import cardioData from './assets/cardio.json'
import { SYSTEMS, SYSTEM_SHORTCUTS } from './systems'

const getPossibleMeshNames = (item) => {
  const names = new Set()

  // Add explicit aliases or meshName if available
  if (Array.isArray(item.meshAliases)) item.meshAliases.forEach((n) => names.add(n))
  if (item.meshName) names.add(item.meshName)

  // Fallback to id, namefr, or name
  if (item.id) {
    names.add(item.id)
    names.add(item.id.replace(/\s+/g, '_')) // handle spaces -> underscores
  }
  if (item.namefr) {
    names.add(item.namefr)
    names.add(item.namefr.replace(/\s+/g, '_'))
  }

  return Array.from(names)
}
// Module scope: stable reference, so ThreeScene's effect doesn't re-init.
// Normalizes bones.json (meshAliases[]) and cardio.json (meshName) into one shape.
const ENTITIES = [
  ...bonesData.map((b) => ({
    ...b,
    system: 'skeletal',
    category: b.category, // 'long' | 'court' | 'plat'
    meshNames: getPossibleMeshNames(b)
  })),
  ...cardioData.map((c) => ({
    ...c,
    system: 'cardiovascular',
    category: c.type, // 'artère' | 'veine' | 'sinus / plexus'
    meshNames: getPossibleMeshNames(c)
  }))
]

function App() {
  const [selectedEntity, setSelectedEntity] = useState(null)
  const [isIsolated, setIsIsolated] = useState(false)
  const [systemVisibility, setSystemVisibility] = useState({})
  const sceneRef = useRef(null)

  const handleSelectEntity = useCallback((entity) => {
    setSelectedEntity(entity)
  }, [])

  const handleIsolationChange = useCallback((isolated) => {
    setIsIsolated(isolated)
  }, [])

  const handleSystemVisibilityChange = useCallback((visibility) => {
    setSystemVisibility(visibility)
  }, [])

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const isTypingTarget = (target) => {
      if (!(target instanceof HTMLElement)) return false
      return (
        target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      )
    }

    const handleKeyDown = (event) => {
      // Don't steal browser/system shortcuts (Ctrl+H, Cmd+H, Alt+H, …)
      if (event.ctrlKey || event.metaKey || event.altKey) return
      // Don't fire while typing in the search box
      if (isTypingTarget(event.target)) return
      // Ignore auto-repeat from a held key
      if (event.repeat) return

      switch (event.key.toLowerCase()) {
        case 'h':
          event.preventDefault()
          sceneRef.current?.hideSelection()
          break
        case 'i':
          event.preventDefault()
          sceneRef.current?.toggleIsolation()
          break
        case 'r':
          event.preventDefault()
          sceneRef.current?.resetView()
          break
        case 'escape':
          event.preventDefault()
          sceneRef.current?.clearSelection()
          break

        default:
          break
      }
      const systemKey = SYSTEM_SHORTCUTS.get(event.key.toLowerCase())
      if (systemKey) {
        event.preventDefault()
        sceneRef.current?.toggleSystem(systemKey)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-brand">
          <i className="ti ti-bone" aria-hidden="true"></i>
          <span>Anatomy Viewer</span>
        </div>
        <SearchBox
          entities={ENTITIES}
          onSelectEntity={(entity) => sceneRef.current?.focusEntity(entity)}
        />
      </div>

      <div className="app-body">
        <div className="canvas-area">
          <ThreeScene
            ref={sceneRef}
            entities={ENTITIES}
            onSelectEntity={handleSelectEntity}
            onIsolationChange={handleIsolationChange}
            onSystemVisibilityChange={handleSystemVisibilityChange}
          />
        </div>
        <Sidebar
          entity={selectedEntity}
          isIsolated={isIsolated}
          onToggleIsolation={() => sceneRef.current?.toggleIsolation()}
          onHideSelection={() => sceneRef.current?.hideSelection()}
        />
        <SystemTray
          systemVisibility={systemVisibility}
          onToggleSystem={(system) => sceneRef.current?.toggleSystem(system)}
        />
        <Reset onReset={() => sceneRef.current?.resetView()} />
      </div>
    </div>
  )
}

export default App
