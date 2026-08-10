import { forwardRef, useImperativeHandle, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { findBoneByMeshName } from './utils/lookup';

const ThreeScene = forwardRef(function ThreeScene({ onSelectBone, onIsolateChange }, ref) {
  const mountRef = useRef(null)
  const sceneApiRef = useRef({})

  useEffect(() => {
    const currentMount = mountRef.current

    // --- 1. Setup Scene, Camera, Renderer ---
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d0f11) // Dark blue-grey background

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
    renderer.shadowMap.enabled = true // Good for realism later
    currentMount.appendChild(renderer.domElement)

    // --- 2. Controls (Orbit) ---
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true // Smooth inertial movement
    controls.dampingFactor = 0.05
    controls.screenSpacePanning = true
    controls.maxPolarAngle = Math.PI

    // --- 3. Lights (clinical/studio rig — keeps the model readable from every angle) ---

    // Hemisphere light: soft ambient fill that mimics bounced room light
    // (cool sky tone from above, warm neutral "floor" tone from below)
    // This alone guarantees no side of the model ever goes fully black.
    const hemiLight = new THREE.HemisphereLight(0xdfe9f5, 0x3a3a3a, 0.9)
    scene.add(hemiLight)

    // Low-level ambient as a safety net on top of the hemisphere light,
    // so even unlit crevices (e.g. inside the ribcage) stay legible.
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25)
    scene.add(ambientLight)

    // Key light: primary shadow-casting light, defines bone surface detail
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3)
    keyLight.position.set(10, 15, 10)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(2048, 2048)
    keyLight.shadow.bias = -0.0005
    scene.add(keyLight)

    // Fill light: opposite side of the key light, lower intensity,
    // softens shadows so anatomical landmarks aren't lost in darkness
    const fillLight = new THREE.DirectionalLight(0xeef3ff, 0.5)
    fillLight.position.set(-10, 5, -8)
    scene.add(fillLight)

    // Rim/back light: separates the model from the background and
    // highlights contours (skull ridges, spine curvature, etc.)
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.8)
    rimLight.position.set(0, 10, -12)
    scene.add(rimLight)

    // Front fill: gentle light straight from the camera side so the
    // side facing the viewer is never underlit, even when orbiting
    const frontFill = new THREE.DirectionalLight(0xffffff, 0.4)
    frontFill.position.set(0, 2, 15)
    scene.add(frontFill)


    // --- 4. Raycaster Setup ---
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    // This will store all the meshes from your OBJ file
    //add here anatomy 3d model

    // ... (your scene, camera, renderer, lights setup remains the same) ...

    // --- Load an OBJ model ---
    const loader = new GLTFLoader()
    loader.load('/src/assets/skeleton4.glb', (gltf) => {
      const model = gltf.scene
      model.scale.set(4, 4, 4)
      model.traverse((node) => {
        if (node.isMesh) {
          node.geometry.computeVertexNormals()

          // IMPORTANT: Store reference to all meshes for raycasting
          clickableObjects.push(node)
        }
      })
      scene.add(model)
    })
    let clickableObjects = []
    let selectedObject = null
    let originalColor = null
    let isIsolated = false
    const HIGHLIGHT_EMISSIVE = 0x00ffff
    // --- 6. Click Handler (Raycasting Logic) ---
    function onPointerClick(event) {
      // Calculate mouse position in normalized device coordinates (-1 to +1)
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(pointer, camera)

      // Check for intersections with all meshes in the OBJ
      const intersects = raycaster.intersectObjects(clickableObjects)

      // --- A. If we previously selected an object, revert its color ---
      if (selectedObject) {
        selectedObject.material.color.setHex(originalColor)
        selectedObject = null
        originalColor = null
      }

      // --- B. If we clicked on something, highlight it ---
      if (intersects.length > 0) {
        // Get the first clicked mesh
        const hitMesh = intersects[0].object

        // Save its original color so we can revert later
        originalColor = hitMesh.material.color.getHex()

        // Change its color to a bright highlight (e.g., cyan/glow)
        hitMesh.material.color.setHex(0x00ffff)

        // Store reference to the selected mesh
        selectedObject = hitMesh

        // --- C. Anatomy Info (THIS IS WHERE YOU ADD YOUR DATA) ---
        // Try to get a name from the mesh, or fallback to generic
        const partName = hitMesh.name || `Part ${clickableObjects.indexOf(hitMesh) + 1}`
        console.log(`🦴 Clicked: ${partName}`)
        onSelectBone(findBoneByMeshName(partName)) // <-- tell React
      } else {
        onSelectBone(null) // clicked empty space, clear sidebar
      }
    }

    // --- 7. Attach the click listener ---
    // --- Drag vs Click detection ---
    let pointerDownPos = { x: 0, y: 0 }
    const DRAG_THRESHOLD = 3 // pixels — tweak to taste

    function onPointerDown(event) {
      pointerDownPos = { x: event.clientX, y: event.clientY }
    }

    function onPointerUp(event) {
      const dx = event.clientX - pointerDownPos.x
      const dy = event.clientY - pointerDownPos.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < DRAG_THRESHOLD) {
        onPointerClick(event) // only treat as a "click" if barely moved
      }
    }

    // instead of:
    // renderer.domElement.addEventListener('click', onPointerClick)

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    // Optional: Use 'pointerdown' for faster response, but 'click' is more intuitive

    // Add a grid helper to visualize the ground
    //const gridHelper = new THREE.GridHelper(20, 20, 0x88aaff, 0x335588)
    //scene.add(gridHelper)

    function toggleIsolate() {
      if (!selectedObject) return

      isIsolated = !isIsolated
      clickableObjects.forEach((mesh) => {
        mesh.visible = isIsolated ? mesh === selectedObject : true
      })
      onIsolateChange(isIsolated) // tell React the new state
    }


function clearSelection() {
      if (selectedObject) {
        selectedObject.material.color.setHex(originalColor)
         selectedObject.visible = false
        selectedObject = null
        originalColor = null
      }
      onSelectBone(null)
    }


    function resetView() {
      clickableObjects.forEach((mesh) => {
        mesh.visible = true
      })
      if (selectedObject) {
        selectedObject.material.color.setHex(originalColor)
        selectedObject = null
      }
      isIsolated = false
      onIsolateChange(false)
      onSelectBone(null)
      controls.reset()
    }
        // --- Programmatic selection (e.g. from SearchBox) ---
    // Mirrors the highlight logic in onPointerClick, but finds the target
    // mesh by matching the bone's meshAliases / name instead of raycasting.
    function selectBoneExternally(bone) {
      if (!bone) {
        clearSelection()
        return
      }

      const aliases = (bone.meshAliases || []).map((a) => a.toLowerCase())
      const targetName = (bone.name || '').toLowerCase()

      const match = clickableObjects.find((mesh) => {
        const meshName = (mesh.name || '').toLowerCase()
        return aliases.includes(meshName) || meshName === targetName
      })

      // Revert whatever was previously selected/highlighted
      if (selectedObject) {
        selectedObject.material.color.setHex(originalColor)
        selectedObject = null
        originalColor = null
      }

      // If we were isolated, drop back to showing everything so the
      // newly searched bone is actually visible
      if (isIsolated) {
        clickableObjects.forEach((mesh) => { mesh.visible = true })
        isIsolated = false
        onIsolateChange(false)
      }

      if (match) {
        originalColor = match.material.color.getHex()
        match.material.color.setHex(0x00ffff)
        selectedObject = match
      } else {
        console.warn(`⚠️ No mesh found for bone "${bone.name}" — check meshAliases`)
      }

      onSelectBone(bone)
    }


    sceneApiRef.current = { toggleIsolate, resetView, clearSelection, selectBoneExternally}

    // --- 6. Handle Window Resize ---
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

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.dispose()
      controls.dispose()
      // remove ALL children, not just assume one canvas
      while (currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement)
      }
    }
  }, [onSelectBone, onIsolateChange])

  useImperativeHandle(ref, () => ({
    toggleIsolate: () => sceneApiRef.current.toggleIsolate?.(),
    reset: () => sceneApiRef.current.resetView?.(),
    clearSelection: () => sceneApiRef.current.clearSelection?.(),
        selectBone: (bone) => sceneApiRef.current.selectBoneExternally?.(bone)
  }))

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
})

export default ThreeScene
