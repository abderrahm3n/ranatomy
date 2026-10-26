import { forwardRef, useImperativeHandle, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import skeleton from './assets/squelette.glb?url'
import cardio from './assets/cardiovasculair.glb?url'
import nervous from './assets/nerveux.glb?url'
import muscular from './assets/musculair.glb?url'
import ligcart from './assets/ligcart.glb?url'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const normalizeMeshKey = (str) => {
  if (typeof str !== 'string') return ''
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '')
}

const BASE_MATERIAL_CONFIG = {
  skeletal: { color: 0xe8e2d5, roughness: 0.6, metalness: 0.05 },
  cardiovascular: { color: 0xff4d4d, roughness: 0.4, metalness: 0.1 },
  nervous: { color: 0xf2c94c, roughness: 0.55, metalness: 0.05 },
  muscular: { color: 0xffffff, roughness: 0.4, metalness: 0.2 },
    ligcart:       { color: 0xc9d6a8, roughness: 0.6, metalness: 0.05 }  // ← add this
}

const HIGHLIGHT_MATERIAL_CONFIG = {
  color: 0xe8e2d5,
  emissive: 0x00ffff,
  emissiveIntensity: 1,
  roughness: 0.6,
  metalness: 0.01
}
const SYSTEM_MODELS = [
  { system: 'skeletal', url: skeleton, scale: 4, position: [0, 0, 0] },
  { system: 'cardiovascular', url: cardio, scale: 4, position: [0, 0, 0] },
  { system: 'nervous', url: nervous, scale: 4, position: [0, 0, 0] },
  { system: 'muscular', url: muscular, scale: 4, position: [0, 0, 0] },
  { system: 'ligcart', url:ligcart,  scale: 4, position: [0,0,0]}
]

const DEFAULT_VISIBLE = new Set(['skeletal'])

const DRAG_THRESHOLD_PX = 3

// Small helpers used by the fly animation
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

const FLY_MIN_DURATION = 450
const FLY_MAX_DURATION = 1100
// How much of the FOV the mesh should fill. 1.0 = sphere touches edges,
// <1 gives breathing room around it.
const FLY_FRAME_FILL = 0.55
const FLY_MIN_DISTANCE = 0.6

const ThreeScene = forwardRef(function ThreeScene(
  { entities = [], onSelectEntity, onIsolationChange, onSystemVisibilityChange },
  ref
) {
  const mountRef = useRef(null)
  const sceneApiRef = useRef({})

  const callbacksRef = useRef({})
  callbacksRef.current = { onSelectEntity, onIsolationChange, onSystemVisibilityChange }

  useEffect(() => {
    const currentMount = mountRef.current
    let disposed = false

    const emitSelect = (entity) => callbacksRef.current.onSelectEntity?.(entity)
    const emitIsolation = (value) => callbacksRef.current.onIsolationChange?.(value)

    let needsRender = true
    const invalidate = () => {
      needsRender = true
    }

    // ---- Scene / camera / renderer ----
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d0f11)

    const camera = new THREE.PerspectiveCamera(
      45,
      currentMount.clientWidth / currentMount.clientHeight,
      0.1,
      1000
    )
    camera.position.set(0, 0, 10)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    })
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight)
    currentMount.appendChild(renderer.domElement)

    // Renderer
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 0.8

    // Environment
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.45
    pmrem.dispose()
    // ---- Controls ----
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.screenSpacePanning = true
    controls.maxPolarAngle = Math.PI
    controls.addEventListener('change', invalidate)

    // ---- Camera fly state ----
    // While non-null, the animate loop interpolates camera position + controls
    // target each frame. Cancelled on user interaction or a new fly.
    let flyAnimation = null
    const cancelFly = () => {
      flyAnimation = null
    }
    controls.addEventListener('start', cancelFly)

    // Lights
    scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x3a3a3a, 0.35))
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.7)
    keyLight.position.set(10, 15, 10)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xeef3ff, 0.25)
    fillLight.position.set(-10, 5, -8)
    scene.add(fillLight)

    // ---- Materials ----
    const highlightMaterial = new THREE.MeshStandardMaterial(HIGHLIGHT_MATERIAL_CONFIG)
    const baseMaterialBySystem = {}
    Object.entries(BASE_MATERIAL_CONFIG).forEach(([system, config]) => {
      baseMaterialBySystem[system] = new THREE.MeshStandardMaterial(config)
    })

    // ---- Runtime state ----
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    const meshes = []
    const meshesBySystem = {}
    const systemVisibility = {}
    const ownedMaterials = new Set() // ← add this

    let selectedMesh = null
    let isIsolated = false
    let preIsolationVisibility = null

    const meshByMeshName = new Map()
    const entityByMeshName = new Map()

    Object.keys(BASE_MATERIAL_CONFIG).forEach((system) => {
      meshesBySystem[system] = []
      systemVisibility[system] = DEFAULT_VISIBLE.has(system)
    })

    entities.forEach((entity) => {
      ;(entity.meshNames || []).forEach((name) => {
        entityByMeshName.set(normalizeMeshKey(name), entity)
      })
    })

    function emitSystemVisibility() {
      callbacksRef.current.onSystemVisibilityChange?.({ ...systemVisibility })
    }

    function registerMesh(node, system) {
      meshes.push(node)
      meshesBySystem[system].push(node)
      meshByMeshName.set(normalizeMeshKey(node.name), node)

      node.userData.system = system
      node.userData.entity = entityByMeshName.get(normalizeMeshKey(node.name)) || null
      node.visible = !isIsolated && systemVisibility[system] !== false
    }

    function warnOrphanMeshes(system) {
      const orphans = meshesBySystem[system].filter((mesh) => !mesh.userData.entity)
      if (orphans.length) {
        console.warn(
          `[${system}] meshes with no catalog entry:`,
          orphans.map((m) => m.name)
        )
      }
    }

    // ---- Lazy loading ----
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)

    const loadPromises = new Map()

    function ensureSystemLoaded(system) {
      if (loadPromises.has(system)) return loadPromises.get(system)

      const config = SYSTEM_MODELS.find((m) => m.system === system)
      if (!config) return Promise.resolve()

      const promise = loader
        .loadAsync(config.url)
        .then((gltf) => {
          if (disposed) {
            gltf.scene.traverse((n) => n.isMesh && n.geometry.dispose())
            return
          }

          gltf.scene.scale.setScalar(config.scale)
          gltf.scene.position.set(...config.position)

          gltf.scene.traverse((node) => {
            if (!node.isMesh) return
            if (!node.geometry.attributes.normal) node.geometry.computeVertexNormals()

            // Keep whatever GLTFLoader created from Blender's Principled BSDF.
            // Track each material so the cleanup can dispose it — previously the
            // loaded materials were leaked, only geometries were disposed.
            const mats = Array.isArray(node.material) ? node.material : [node.material]
            for (const m of mats) {
              if (!m) continue
              ownedMaterials.add(m)

              // Optional, useful for thin shells like vessels that you modelled with
              // backfaces showing in Blender:
              // m.side = THREE.DoubleSide
            }

            node.userData.originalMaterial = node.material
            registerMesh(node, system)
          })

          scene.add(gltf.scene)
          warnOrphanMeshes(system)
          emitSystemVisibility()
          invalidate()
        })
        .catch((err) => {
          loadPromises.delete(system)
          console.error(`Failed to load system "${system}"`, err)
        })

      loadPromises.set(system, promise)
      return promise
    }

    Object.keys(systemVisibility).forEach((system) => {
      if (systemVisibility[system]) ensureSystemLoaded(system)
    })
    emitSystemVisibility()

    // ---- Selection ----
    function restoreMeshMaterial(mesh) {
      mesh.material =
        mesh.userData.originalMaterial ||
        baseMaterialBySystem[mesh.userData.system] ||
        highlightMaterial
      invalidate()
    }

    function applySelection(mesh, entityOverride) {
      if (selectedMesh) restoreMeshMaterial(selectedMesh)
      selectedMesh = mesh
      invalidate()

      if (!mesh) {
        emitSelect(null)
        return
      }

      mesh.material = highlightMaterial

      const entity = entityOverride ||
        mesh.userData.entity || { id: mesh.name, namefr: mesh.name, meshNames: [mesh.name] }

      emitSelect({ ...entity, system: mesh.userData.system })
    }

    function clearSelection() {
      applySelection(null)
    }

    // ---- Camera fly ----
    const _flyBox = new THREE.Box3()
    const _flyCenter = new THREE.Vector3()
    const _flySize = new THREE.Vector3()
    const _flyDir = new THREE.Vector3()

    function flyToMesh(mesh) {
      if (!mesh) return

      // World-space bounding box of the mesh (accounts for parent scale + position).
      _flyBox.setFromObject(mesh)
      if (_flyBox.isEmpty()) return

      _flyBox.getCenter(_flyCenter)
      _flyBox.getSize(_flySize)

      // Use the bounding sphere radius so elongated bones don't under/overshoot.
      const radius = Math.max(_flySize.length() * 0.5, 0.15)

      // Distance so the sphere fills FLY_FRAME_FILL of the vertical FOV.
      const halfFov = (camera.fov * Math.PI) / 360
      const distance = Math.max(FLY_MIN_DISTANCE, radius / Math.sin(halfFov) / FLY_FRAME_FILL)

      // Preserve the current view direction: pull the camera along the vector
      // from controls.target toward the camera. Direction stays constant for
      // the whole animation, so the fly is a clean dolly toward the target.
      _flyDir.subVectors(camera.position, controls.target)
      if (_flyDir.lengthSq() < 1e-6) _flyDir.set(0, 0, 1)
      _flyDir.normalize()

      const startPos = camera.position.clone()
      const startTarget = controls.target.clone()

      const endTarget = _flyCenter.clone()
      const endPos = _flyCenter.clone().addScaledVector(_flyDir, distance)

      // Adaptive duration: snappier for short hops, more cinematic for long ones.
      const travel = startPos.distanceTo(endPos)
      const duration = Math.min(FLY_MAX_DURATION, Math.max(FLY_MIN_DURATION, 350 + travel * 45))

      flyAnimation = {
        startTime: performance.now(),
        duration,
        startPos,
        endPos,
        startTarget,
        endTarget
      }
      invalidate()
    }

    // ---- Pointer interaction ----
    // ---- Pointer / tap state ----
    let pointerDownPos = { x: 0, y: 0 }
    let pointerDownTime = 0
    let activePointers = 0 // how many pointers are currently down
    let gestureHadMultiTouch = false // set true if 2+ pointers touched during this gesture

    let lastTapTime = 0
    let lastTapPos = { x: 0, y: 0 }

    const TAP_MAX_MS = 250 // longer than this = long-press, not a tap
    const TAP_MAX_MOVE_PX = 10 // movement during a single tap
    const DOUBLE_TAP_MS = 300
    const DOUBLE_TAP_PX = 40 // distance between the two taps

    const visibleScratch = []

    function pickMeshAtPointer(event) {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)

      visibleScratch.length = 0
      for (let i = 0; i < meshes.length; i++) {
        if (meshes[i].visible) visibleScratch.push(meshes[i])
      }

      const hits = raycaster.intersectObjects(visibleScratch, false)
      return hits.length > 0 ? hits[0].object : null
    }

    function onPointerDown(event) {
      activePointers++
      if (activePointers > 1) gestureHadMultiTouch = true
      pointerDownPos = { x: event.clientX, y: event.clientY }
      pointerDownTime = performance.now()
    }

    function onPointerUp(event) {
      activePointers = Math.max(0, activePointers - 1)

      // Wait until all fingers are lifted before judging the gesture.
      if (activePointers > 0) return

      const wasMultiTouch = gestureHadMultiTouch
      gestureHadMultiTouch = false

      // Multi-touch gestures (pinch, two-finger pan) never count as taps.
      if (wasMultiTouch) {
        lastTapTime = 0
        return
      }
      const now = performance.now()
      const dt = now - pointerDownTime
      const dx = event.clientX - pointerDownPos.x
      const dy = event.clientY - pointerDownPos.y

      // Single-finger tap: fast and stationary.
      if (dt > TAP_MAX_MS || Math.hypot(dx, dy) > TAP_MAX_MOVE_PX) {
        lastTapTime = 0
        return
      }

      const hitMesh = pickMeshAtPointer(event)

      // First tap: select (or clear on empty space), and arm double-tap detection.
      if (hitMesh) applySelection(hitMesh)
      else clearSelection()

      const tapDx = event.clientX - lastTapPos.x
      const tapDy = event.clientY - lastTapPos.y
      const isDoubleTap =
        lastTapTime > 0 &&
        now - lastTapTime < DOUBLE_TAP_MS &&
        Math.hypot(tapDx, tapDy) < DOUBLE_TAP_PX

      if (isDoubleTap && hitMesh) {
        showSystem(hitMesh.userData.system)
        setMeshVisible(hitMesh, true)
        flyToMesh(hitMesh)
        lastTapTime = 0 // consume so a triple-tap doesn't re-fire
        return
      }

      lastTapTime = now
      lastTapPos = { x: event.clientX, y: event.clientY }
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    // ---- Visibility helpers ----
    function setMeshVisible(mesh, isVisible) {
      mesh.visible = isVisible
      invalidate()
    }

    function restoreVisibilityFromSnapshot() {
      meshes.forEach((mesh) => {
        if (preIsolationVisibility && preIsolationVisibility.has(mesh)) {
          mesh.visible = preIsolationVisibility.get(mesh)
        } else {
          mesh.visible = systemVisibility[mesh.userData.system] !== false
        }
      })
      preIsolationVisibility = null
      invalidate()
    }

    function exitIsolation() {
      restoreVisibilityFromSnapshot()
      isIsolated = false
      emitIsolation(false)
    }

    function showSystem(system) {
      if (!meshesBySystem[system] || systemVisibility[system]) return
      systemVisibility[system] = true
      meshesBySystem[system].forEach((m) => setMeshVisible(m, true))
      emitSystemVisibility()
    }

    // ---- Public actions ----
    function toggleIsolation() {
      if (isIsolated) {
        exitIsolation()
        return
      }
      if (!selectedMesh) return

      preIsolationVisibility = new Map(meshes.map((mesh) => [mesh, mesh.visible]))
      meshes.forEach((mesh) => setMeshVisible(mesh, mesh === selectedMesh))
      isIsolated = true
      emitIsolation(true)
    }

    function hideSelection() {
      if (!selectedMesh) return
      setMeshVisible(selectedMesh, false)
      restoreMeshMaterial(selectedMesh)
      selectedMesh = null
      emitSelect(null)
    }

    function toggleSystemVisibility(system) {
      if (!meshesBySystem[system]) return

      if (isIsolated) exitIsolation()

      if (!systemVisibility[system]) {
        showSystem(system)
        ensureSystemLoaded(system)
      } else {
        systemVisibility[system] = false
        meshesBySystem[system].forEach((mesh) => setMeshVisible(mesh, false))
        if (selectedMesh && meshesBySystem[system].includes(selectedMesh)) {
          clearSelection()
        }
        emitSystemVisibility()
      }
    }

    function resetView() {
      cancelFly()
      Object.keys(systemVisibility).forEach((system) => {
        systemVisibility[system] = DEFAULT_VISIBLE.has(system)
      })

      meshes.forEach((mesh) => {
        setMeshVisible(mesh, systemVisibility[mesh.userData.system])
        restoreMeshMaterial(mesh)
      })

      selectedMesh = null
      isIsolated = false
      preIsolationVisibility = null

      emitIsolation(false)
      emitSelect(null)
      emitSystemVisibility()
      controls.reset()
      invalidate()
    }

    // Shared resolution: makes sure the entity's system is loaded + visible,
    // then returns the matching mesh (or null + a warning).
    async function resolveEntityMesh(entity) {
      if (!entity) return null

      if (entity.system && meshesBySystem[entity.system]) {
        showSystem(entity.system)
        await ensureSystemLoaded(entity.system)
        if (disposed) return null
      }

      for (const meshName of entity.meshNames || []) {
        const candidate = meshByMeshName.get(normalizeMeshKey(meshName))
        if (candidate) return candidate
      }

      console.warn(
        `No mesh for entity "${entity.id}" (${entity.namefr || entity.name}). ` +
          `Tried: ${(entity.meshNames || []).join(', ') || '(none)'}`
      )
      return null
    }

    async function selectEntity(entity) {
      if (!entity) {
        clearSelection()
        return
      }

      const mesh = await resolveEntityMesh(entity)
      if (!mesh || disposed) return

      showSystem(mesh.userData.system)
      setMeshVisible(mesh, true)
      applySelection(mesh, entity)
    }

    // Same as selectEntity, but also flies the camera to frame the mesh.
    // Use this from search results / list items — not from canvas clicks.
    async function focusEntity(entity) {
      if (!entity) {
        clearSelection()
        return
      }

      const mesh = await resolveEntityMesh(entity)
      if (!mesh || disposed) return

      showSystem(mesh.userData.system)
      setMeshVisible(mesh, true)
      applySelection(mesh, entity)
      flyToMesh(mesh)
    }

    sceneApiRef.current = {
      toggleIsolation,
      resetView,
      clearSelection,
      selectEntity,
      focusEntity,
      hideSelection,
      toggleSystemVisibility
    }

    // ---- Resize & render loop ----
    const onResize = () => {
      camera.aspect = currentMount.clientWidth / currentMount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight)
      invalidate()
    }
    window.addEventListener('resize', onResize)

    let frameId

    function animate() {
      frameId = requestAnimationFrame(animate)

      // Delta in seconds, clamped so a tab-switch or debugger pause
      // doesn't fling the gizmo animation to its end state.

      let moved = false

      // Advance the camera fly before controls.update(), so OrbitControls
      // picks up our new position/target cleanly (no fighting).
      if (flyAnimation) {
        const elapsed = performance.now() - flyAnimation.startTime
        const t = Math.min(1, elapsed / flyAnimation.duration)
        const e = easeInOutCubic(t)

        camera.position.lerpVectors(flyAnimation.startPos, flyAnimation.endPos, e)
        controls.target.lerpVectors(flyAnimation.startTarget, flyAnimation.endTarget, e)

        moved = true
        if (t >= 1) flyAnimation = null
      }

      if (controls.update()) moved = true

      if (moved || needsRender) {
        renderer.render(scene, camera)
        needsRender = false
      }
    }
    animate()

    // ---- Cleanup ----
    return () => {
      disposed = true
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.removeEventListener('change', invalidate)
      controls.removeEventListener('start', cancelFly)

      scene.traverse((o) => o.isMesh && o.geometry.dispose())
      Object.values(baseMaterialBySystem).forEach((m) => m.dispose())
      ownedMaterials.forEach((m) => m.dispose()) // ← add this
      highlightMaterial.dispose()
      scene.environment?.dispose()

      controls.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      while (currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement)
      }
    }
  }, [entities])

  useImperativeHandle(ref, () => ({
    toggleIsolation: () => sceneApiRef.current.toggleIsolation?.(),
    resetView: () => sceneApiRef.current.resetView?.(),
    clearSelection: () => sceneApiRef.current.clearSelection?.(),
    selectEntity: (entity) => sceneApiRef.current.selectEntity?.(entity),
    focusEntity: (entity) => sceneApiRef.current.focusEntity?.(entity),
    hideSelection: () => sceneApiRef.current.hideSelection?.(),
    toggleSystem: (system) => sceneApiRef.current.toggleSystemVisibility?.(system)
  }))

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
})

export default ThreeScene
