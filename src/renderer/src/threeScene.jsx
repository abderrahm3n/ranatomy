import { forwardRef, useImperativeHandle, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { findBoneByMeshName } from './utils/lookup'
import skeleton from './assets/skeleton4.glb?url'
import cardio from './assets/cardio.glb?url'

const ThreeScene = forwardRef(function ThreeScene({ onSelectBone, onIsolateChange }, ref) {
  const mountRef = useRef(null)
  const sceneApiRef = useRef({})

  useEffect(() => {
    const currentMount = mountRef.current

    // --- 1. Scene, Camera, Renderer ---
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

    // --- 2. Controls ---
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.screenSpacePanning = true
    controls.maxPolarAngle = Math.PI

    // --- 3. Lights ---
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

    // --- 4. Materials & State ---
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8e2d5,
      roughness: 0.6,
      metalness: 0.05
    })

    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8e2d5,
      emissive: 0x00ffff,
      emissiveIntensity: 0.4,
      roughness: 0.6,
      metalness: 0.05
    })
    const cardioMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4d4d,
      roughness: 0.4,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85
    })

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    let meshes = []
    let selectedMesh = null
    let isIsolated = false

    // --- 5. Loader ---
    const loader = new GLTFLoader()
    loader.load(skeleton, (gltf) => {
      const model = gltf.scene
      model.scale.set(4, 4, 4)

      model.traverse((node) => {
        if (!node.isMesh) return
        node.geometry.computeVertexNormals()
        node.material = baseMaterial
        meshes.push(node)
      })

      scene.add(model)
    })

    loader.load(cardio, (gltf) => {
      const cardioModel = gltf.scene
      // Adjust position/scale to sit correctly relative to the skeleton
      cardioModel.position.set(0, 0, 0) // example offset
      cardioModel.scale.set(4, 4, 4) // adjust as needed

      cardioModel.traverse((node) => {
        if (!node.isMesh) return
        node.geometry.computeVertexNormals()
        node.material = cardioMaterial // use the cardio-specific material
        meshes.push(node) // add to the interactive list
      })

      scene.add(cardioModel)
    })

    // --- 6. Material Swapping & Selection Helpers ---
    function selectMesh(mesh, boneDataOverride) {
      if (selectedMesh) {
        selectedMesh.material = baseMaterial
      }

      selectedMesh = mesh

      if (mesh) {
        mesh.material = highlightMaterial
        const boneData = boneDataOverride || findBoneByMeshName(mesh.name)
        onSelectBone(boneData || { name: mesh.name })
      } else {
        onSelectBone(null)
      }
    }

    function clearSelection() {
      selectMesh(null)
    }

    // --- 7. Click & Drag Handling ---
    let pointerDownPos = { x: 0, y: 0 }
    const DRAG_THRESHOLD = 3

    function onPointerClick(event) {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(pointer, camera)

      const intersects = raycaster.intersectObjects(meshes.filter((m) => m.visible))

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object
        console.log(hitMesh)
        selectMesh(hitMesh)
      } else {
        clearSelection()
      }
    }

    function onPointerDown(event) {
      pointerDownPos = { x: event.clientX, y: event.clientY }
    }

    function onPointerUp(event) {
      const dx = event.clientX - pointerDownPos.x
      const dy = event.clientY - pointerDownPos.y
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) {
        onPointerClick(event)
      }
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    // --- 8. Public Actions ---
    // Add this variable inside the useEffect, near other state variables
    let previousVisibility = null // stores an array of booleans

    function toggleIsolate() {
      // --- Turn OFF isolation (always possible) ---
      if (isIsolated) {
        if (previousVisibility) {
          meshes.forEach((mesh, index) => {
            mesh.visible = previousVisibility[index]
          })
          previousVisibility = null
        } else {
          // fallback – should not happen
          meshes.forEach((mesh) => (mesh.visible = true))
        }
        isIsolated = false
        onIsolateChange(false)
        return
      }

      // --- Turn ON isolation (requires a selected mesh) ---
      if (!selectedMesh) return

      previousVisibility = meshes.map((mesh) => mesh.visible)
      meshes.forEach((mesh) => {
        mesh.visible = mesh === selectedMesh
      })
      isIsolated = true
      onIsolateChange(true)
    }

    function hideSelected() {
      if (!selectedMesh) return

      selectedMesh.visible = false
      selectedMesh.material = baseMaterial
      selectedMesh = null
      onSelectBone(null)
    }

    function resetView() {
      meshes.forEach((mesh) => {
        mesh.visible = true
        mesh.material = baseMaterial
      })
      selectedMesh = null
      isIsolated = false
      onIsolateChange(false)
      onSelectBone(null)
      controls.reset()
    }

    function selectBoneSearchBox(bone) {
      if (!bone) {
        clearSelection()
        return
      }

      if (isIsolated) {
        meshes.forEach((mesh) => {
          mesh.visible = true
        })
        isIsolated = false
        onIsolateChange(false)
      }

      // Collect potential target keys: bone ID, explicit meshAliases, or name variants
      const searchTerms = [bone.id, bone.name, bone.namefr, ...(bone.meshAliases || [])]
        .filter(Boolean)
        .map((term) => term.toLowerCase())

      const foundMesh = meshes.find((mesh) => {
        if (!mesh.visible) return false
        const meshName = mesh.name.toLowerCase()

        return searchTerms.some((term) => {
          // 1. Exact match
          if (meshName === term) return true

          // 2. Prefix/Suffix match for left/right designations (e.g. "radius.l", "radius_l", "radius.r")
          const pattern = new RegExp(`^${term}[._-]?(l|r|left|right)?$`, 'i')
          return pattern.test(meshName)
        })
      })

      if (foundMesh) {
        selectMesh(foundMesh, bone)
      } else {
        console.warn(`⚠️ Mesh not found for bone "${bone.name || bone.namefr || bone.id}"`)
        clearSelection()
      }
    }

    sceneApiRef.current = {
      toggleIsolate,
      resetView,
      clearSelection,
      selectBoneSearchBox,
      hideSelected
    }

    // --- 9. Resize & Render Loop ---
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
    }
    animate()

    // --- 10. Cleanup ---
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
  }, [onSelectBone, onIsolateChange])

  useImperativeHandle(ref, () => ({
    toggleIsolate: () => sceneApiRef.current.toggleIsolate?.(),
    reset: () => sceneApiRef.current.resetView?.(),
    clearSelection: () => sceneApiRef.current.clearSelection?.(),
    selectBone: (bone) => sceneApiRef.current.selectBoneSearchBox?.(bone),
    hideSelected: () => sceneApiRef.current.hideSelected?.()
  }))

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
})

export default ThreeScene
