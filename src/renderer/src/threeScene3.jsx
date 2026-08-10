import { forwardRef, useImperativeHandle, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import Stats from 'three/addons/libs/stats.module.js'
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

    // --- FPS counter (top-left overlay) — real numbers, not eyeballing ---
    const stats = new Stats()
    stats.dom.style.position = 'absolute'
    stats.dom.style.top = '0px'
    stats.dom.style.left = '0px'
    currentMount.style.position = currentMount.style.position || 'relative'
    currentMount.appendChild(stats.dom)

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

    // --- Load a GLB model ---
    // clickableObjects / selectedMeshes must exist before loader.load's
    // callback fires (it's async, so this is safe, but declaring them
    // first keeps the intent obvious).
    let clickableObjects = []
    let selectedMeshes = []   // ALL submeshes belonging to the currently selected bone
    let selectedName = null
    let isIsolated = false
    const HIGHLIGHT_EMISSIVE = 0x00ffff
    const BONE_COLOR = 0xe8e2d5 // flat bone tone — no texture sampling

    const loader = new GLTFLoader()

    // One shared material for every bone (they're all the same flat
    // color now) and one shared highlight material — swapping a mesh's
    // material reference between the two is far cheaper than each mesh
    // owning its own material instance.
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: BONE_COLOR,
      roughness: 0.6,
    })
    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: BONE_COLOR,
      roughness: 0.6,
      emissive: new THREE.Color(HIGHLIGHT_EMISSIVE),
      emissiveIntensity: 1,
    })

    loader.load(
      '/src/assets/skeleton4.glb',
      (gltf) => {
        const model = gltf.scene
        model.scale.set(4, 4, 4)

        model.traverse((node) => {
          if (!node.isMesh) return

          // Blender bakes custom split normals into the mesh; only
          // recompute if the GLB genuinely has none, otherwise this
          // silently flattens surface detail on every bone.
          if (!node.geometry.attributes.normal) {
            node.geometry.computeVertexNormals()
          }

          // A Blender object with MULTIPLE material slots exports as a
          // Group (named after the object) containing several child
          // Meshes — one per slot — each usually named "<Object>_1",
          // "<Object>_2", etc. Detect that split and remember the
          // shared/logical name so we can select the whole bone, not
          // just the slot the ray happened to hit.
          const parent = node.parent
          const isMultiMaterialGroup =
            parent && parent.isGroup &&
            parent.children.filter((c) => c.isMesh).length > 1
          node.userData.boneName = isMultiMaterialGroup ? parent.name : node.name

          node.material = baseMaterial

          clickableObjects.push(node)
        })

        scene.add(model)

        // NEXT OPTIMIZATION STEP (if FPS is still not enough):
        // All meshes now share `baseMaterial`, so they're candidates for
        // merging into one draw call with BufferGeometryUtils.mergeGeometries.
        // The catch: merging collapses them into one mesh, so you'd lose
        // per-bone raycasting/selection unless you track index ranges per
        // bone (geometry groups) instead. Only worth doing if stats.js
        // still shows a bottleneck after this change — ask me if so.
      },
      undefined, // onProgress — wire up a loading bar here if you want one
      (error) => {
        console.error('❌ Failed to load skeleton2.glb:', error)
      }
    )

    // Returns every submesh sharing a logical bone name (handles
    // multi-material bones split into several Mesh nodes).
    function getGroupByName(name) {
      return clickableObjects.filter((m) => m.userData.boneName === name)
    }

    function highlight(meshes) {
      meshes.forEach((mesh) => {
        mesh.material = highlightMaterial
      })
    }

    function unhighlight(meshes) {
      meshes.forEach((mesh) => {
        mesh.material = baseMaterial
      })
    }

    // --- 6. Click Handler (Raycasting Logic) ---
    function onPointerClick(event) {
      // Calculate mouse position in normalized device coordinates (-1 to +1)
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(pointer, camera)

      // Check for intersections with all meshes in the model
      const intersects = raycaster.intersectObjects(clickableObjects)

      // --- A. If we previously selected a bone, revert the whole group ---
      if (selectedMeshes.length) {
        unhighlight(selectedMeshes)
        selectedMeshes = []
        selectedName = null
      }

      // --- B. If we clicked on something, highlight its whole bone group ---
      if (intersects.length > 0) {
        const hitMesh = intersects[0].object
        const name = hitMesh.userData.boneName || hitMesh.name

        const group = getGroupByName(name)
        highlight(group)
        selectedMeshes = group
        selectedName = name

        console.log(`🦴 Clicked: ${name} (${group.length} submesh${group.length > 1 ? 'es' : ''})`)
        onSelectBone(findBoneByMeshName(name)) // <-- tell React
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
      if (!selectedMeshes.length) return

      isIsolated = !isIsolated
      clickableObjects.forEach((mesh) => {
        mesh.visible = isIsolated ? selectedMeshes.includes(mesh) : true
      })
      onIsolateChange(isIsolated) // tell React the new state
    }


    function clearSelection() {
      if (selectedMeshes.length) {
        unhighlight(selectedMeshes)
        selectedMeshes = []
        selectedName = null
      }
      onSelectBone(null)
    }


    function resetView() {
      clickableObjects.forEach((mesh) => {
        mesh.visible = true
      })
      if (selectedMeshes.length) {
        unhighlight(selectedMeshes)
        selectedMeshes = []
        selectedName = null
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

      // Match against logical bone group names (not raw mesh names —
      // multi-material bones have several raw mesh names but one
      // logical name).
      const groupNames = [...new Set(clickableObjects.map((m) => m.userData.boneName))]
      const matchName = groupNames.find((name) => {
        const lower = (name || '').toLowerCase()
        return aliases.includes(lower) || lower === targetName
      })

      // Revert whatever was previously selected/highlighted
      if (selectedMeshes.length) {
        unhighlight(selectedMeshes)
        selectedMeshes = []
        selectedName = null
      }

      // If we were isolated, drop back to showing everything so the
      // newly searched bone is actually visible
      if (isIsolated) {
        clickableObjects.forEach((mesh) => { mesh.visible = true })
        isIsolated = false
        onIsolateChange(false)
      }

      if (matchName) {
        const group = getGroupByName(matchName)
        highlight(group)
        selectedMeshes = group
        selectedName = matchName
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
      stats.begin()
      frameId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
      stats.end()
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.dispose()
      controls.dispose()
      if (currentMount.contains(stats.dom)) {
        currentMount.removeChild(stats.dom)
      }
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
