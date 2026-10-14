import { forwardRef, useImperativeHandle, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import skeleton from './assets/squelette.glb?url'
import cardio from './assets/cardiovasculair.glb?url'
import nervous from './assets/nerveux.glb?url'
import muscular from './assets/musculair.glb?url'


// top of threeScene.jsx, module scope
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

// Per-system base materials. Adding a system = one entry here + one loader below.
const BASE_MATERIAL_CONFIG = {
  skeletal: {
    color: 0xe8e2d5,
    roughness: 0.6,
    metalness: 0.05
  },
  cardiovascular: {
    color: 0xff4d4d,
    roughness: 0.4,
    metalness: 0.1,
  },
  nervous: {
    color: 0xf2c94c,
    roughness: 0.55,
    metalness: 0.05
  },
  muscular:{
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.2
  }
}

const HIGHLIGHT_MATERIAL_CONFIG = {
  color: 0xe8e2d5,
  emissive: 0x00ffff,
  emissiveIntensity: 0.4,
  roughness: 0.6,
  metalness: 0.05
}

const DRAG_THRESHOLD_PX = 3

const ThreeScene = forwardRef(function ThreeScene(
  { entities = [], onSelectEntity, onIsolationChange, onSystemVisibilityChange },
  ref
) {
  const mountRef = useRef(null)
  const sceneApiRef = useRef({})

  useEffect(() => {
    const currentMount = mountRef.current

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
    camera.lookAt(0, 10, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight)
    renderer.shadowMap.enabled = true
    currentMount.appendChild(renderer.domElement)

    // ---- Controls ----
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.screenSpacePanning = true
    controls.maxPolarAngle = Math.PI

    // ---- Lights ----
    scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x3a3a3a, 0.9))
    scene.add(new THREE.AmbientLight(0xffffff, 0.25))

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3)
    keyLight.position.set(10, 15, 10)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(2048, 2048)
    keyLight.shadow.bias = -0.0005
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xeef3ff, 0.5)
    fillLight.position.set(-10, 5, -8)
    scene.add(fillLight)

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.8)
    rimLight.position.set(0, 10, -12)
    scene.add(rimLight)

    const frontFill = new THREE.DirectionalLight(0xffffff, 0.4)
    frontFill.position.set(0, 2, 15)
    scene.add(frontFill)

    // ---- Materials ----
    const highlightMaterial = new THREE.MeshStandardMaterial(HIGHLIGHT_MATERIAL_CONFIG)

    const baseMaterialBySystem = {}
    Object.entries(BASE_MATERIAL_CONFIG).forEach(([system, config]) => {
      baseMaterialBySystem[system] = new THREE.MeshStandardMaterial(config)
    })

    // ---- Runtime state ----
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    const meshes = [] // flat list of every interactive mesh
    const meshesBySystem = {} // { skeletal: [...], cardiovascular: [...] }
    const systemVisibility = {} // { skeletal: true, cardiovascular: true }

    let selectedMesh = null
    let isIsolated = false
    let preIsolationVisibility = null // boolean[] snapshot taken on isolate
    // ---- Lookup maps (built once from the normalized entity list) ----


    const meshByMeshName = new Map() // meshName -> Mesh
    const entityByMeshName = new Map() // meshName -> Entity

    Object.keys(BASE_MATERIAL_CONFIG).forEach((system) => {
      meshesBySystem[system] = []
      systemVisibility[system] = true
    })

    entities.forEach((entity) => {
  ;(entity.meshNames || []).forEach((name) => {
    entityByMeshName.set(normalizeMeshKey(name), entity)
  })
})
    // ---- Mesh registry ----
    function registerMesh(node, system) {
  meshes.push(node)
  if (!meshesBySystem[system]) {
    meshesBySystem[system] = []
    systemVisibility[system] = true
  }
  meshesBySystem[system].push(node)

  meshByMeshName.set(normalizeMeshKey(node.name), node)

  node.userData.system = system
  node.userData.entity = entityByMeshName.get(normalizeMeshKey(node.name)) || null
}

    function emitSystemVisibility() {
      onSystemVisibilityChange?.({ ...systemVisibility })
    }

    function warnOrphanMeshes(system) {
      const orphans = (meshesBySystem[system] || []).filter((mesh) => !mesh.userData.entity)
      if (orphans.length) {
        console.warn(
          `[${system}] meshes with no catalog entry:`,
          orphans.map((m) => m.name)
        )
      }
    }

    // ---- Loaders ----
    const loader = new GLTFLoader()

    // Per-system model files. Transform lives here so a new system is one entry.
const SYSTEM_MODELS = [
  { system: 'skeletal',       url: skeleton, scale: 4, position: [0, 0, 0] },
  { system: 'cardiovascular', url: cardio,   scale: 4, position: [0, 0, 0] },
  { system: 'nervous',        url: nervous,  scale: 4, position: [0, 0, 0] },
  { system: 'muscular',       url: muscular, scale: 4, position: [0,0,0] }
]

SYSTEM_MODELS.forEach(({ system, url, scale, position }) => {
  loader.load(url, (gltf) => {
    gltf.scene.scale.setScalar(scale)
    gltf.scene.position.set(...position)
    gltf.scene.traverse((node) => {
      if (!node.isMesh) return
      node.geometry.computeVertexNormals()
      const base = baseMaterialBySystem[system]
      node.material = base
      node.userData.originalMaterial = base
      registerMesh(node, system)
    })
    scene.add(gltf.scene)
    warnOrphanMeshes(system)
    emitSystemVisibility()
  })
})

    // ---- Selection ----
    function restoreMeshMaterial(mesh) {
      mesh.material =
        mesh.userData.originalMaterial ||
        baseMaterialBySystem[mesh.userData.system] ||
        highlightMaterial
    }

    function applySelection(mesh, entityOverride) {
      if (selectedMesh) restoreMeshMaterial(selectedMesh)
      selectedMesh = mesh

      if (!mesh) {
        onSelectEntity?.(null)
        return
      }

      mesh.material = highlightMaterial

      const entity = entityOverride ||
        mesh.userData.entity || { id: mesh.name, namefr: mesh.name, meshNames: [mesh.name] }

      onSelectEntity?.({ ...entity, system: mesh.userData.system })
    }

    function clearSelection() {
      applySelection(null)
    }

    // ---- Pointer interaction ----
    let pointerDownPos = { x: 0, y: 0 }

    function pickMeshAtPointer(event) {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(meshes.filter((m) => m.visible))
      return hits.length > 0 ? hits[0].object : null
    }

    function onPointerDown(event) {
      pointerDownPos = { x: event.clientX, y: event.clientY }
    }

    function onPointerUp(event) {
      const dx = event.clientX - pointerDownPos.x
      const dy = event.clientY - pointerDownPos.y
      if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD_PX) return

      const hitMesh = pickMeshAtPointer(event)
      if (hitMesh) applySelection(hitMesh)
      else clearSelection()
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    // ---- Visibility helpers ----
    function restoreVisibilityFromSnapshot() {
      if (preIsolationVisibility) {
        meshes.forEach((mesh, i) => {
          mesh.visible = preIsolationVisibility[i]
        })
        preIsolationVisibility = null
      } else {
        meshes.forEach((mesh) => {
          const system = mesh.userData.system
          mesh.visible = system ? systemVisibility[system] !== false : true
        })
      }
    }

    function setMeshVisible(mesh, isVisible) {
      mesh.visible = isVisible
    }

    // ---- Public actions ----
    function toggleIsolation() {
      if (isIsolated) {
        restoreVisibilityFromSnapshot()
        isIsolated = false
        onIsolationChange?.(false)
        return
      }

      if (!selectedMesh) return

      preIsolationVisibility = meshes.map((mesh) => mesh.visible)
      meshes.forEach((mesh) => {
        setMeshVisible(mesh, mesh === selectedMesh)
      })
      isIsolated = true
      onIsolationChange?.(true)
    }

    function hideSelection() {
      if (!selectedMesh) return
      setMeshVisible(selectedMesh, false)
      restoreMeshMaterial(selectedMesh)
      selectedMesh = null
      onSelectEntity?.(null)
    }

    function toggleSystemVisibility(system) {
      if (!meshesBySystem[system]) return

      if (isIsolated) {
        restoreVisibilityFromSnapshot()
        isIsolated = false
        onIsolationChange?.(false)
      }

      const nextVisible = !systemVisibility[system]
      systemVisibility[system] = nextVisible
      meshesBySystem[system].forEach((mesh) => {
        setMeshVisible(mesh, nextVisible)
      })

      if (selectedMesh && meshesBySystem[system].includes(selectedMesh) && !nextVisible) {
        clearSelection()
      }

      emitSystemVisibility()
    }

    function resetView() {
      Object.keys(systemVisibility).forEach((system) => {
        systemVisibility[system] = true
      })

      meshes.forEach((mesh) => {
        setMeshVisible(mesh, true)
        restoreMeshMaterial(mesh)
      })

      selectedMesh = null
      isIsolated = false
      preIsolationVisibility = null

      onIsolationChange?.(false)
      onSelectEntity?.(null)
      emitSystemVisibility()
      controls.reset()
    }

    function selectEntity(entity) {
      if (!entity) {
        clearSelection()
        return
      }

      let mesh = null
      for (const meshName of entity.meshNames || []) {
  const candidate = meshByMeshName.get(normalizeMeshKey(meshName))
  if (candidate) { mesh = candidate; break }
}

      if (!mesh) {
        console.warn(
          `No mesh for entity "${entity.id}" (${entity.namefr || entity.name}). ` +
            `Tried: ${(entity.meshNames || []).join(', ') || '(none)'}`
        )
        systemVisibility[system] = true
        meshesBySystem[system].forEach((m) => setMeshVisible(m, true))
        emitSystemVisibility()
      }
      setMeshVisible(mesh, true)

      applySelection(mesh, entity)
    }

    sceneApiRef.current = {
      toggleIsolation,
      resetView,
      clearSelection,
      selectEntity,
      hideSelection,
      toggleSystemVisibility
    }

    // ---- Resize & render loop ----
    const onResize = () => {
      camera.aspect = currentMount.clientWidth / currentMount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight)
    }
    window.addEventListener('resize', onResize)

    let frameId
    function animate() {
      frameId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
      console.log(renderer.info.render.calls, renderer.info.render.triangles)
    }
    animate()

    // ---- Cleanup ----
    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.dispose()
      controls.dispose()
      while (currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement)
      }
    }
  }, [entities, onSelectEntity, onIsolationChange, onSystemVisibilityChange])

  useImperativeHandle(ref, () => ({
    toggleIsolation: () => sceneApiRef.current.toggleIsolation?.(),
    resetView: () => sceneApiRef.current.resetView?.(),
    clearSelection: () => sceneApiRef.current.clearSelection?.(),
    selectEntity: (entity) => sceneApiRef.current.selectEntity?.(entity),
    hideSelection: () => sceneApiRef.current.hideSelection?.(),
    toggleSystem: (system) => sceneApiRef.current.toggleSystemVisibility?.(system)
  }))

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
})

export default ThreeScene
