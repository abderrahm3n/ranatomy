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

    // --- Load the skeleton model ---
    const loader = new GLTFLoader()

    // Two shared materials keep draw calls low. We highlight by SWAPPING
    // the material reference on a mesh, never by mutating .color/.emissive
    // on a shared material instance directly — doing that would recolor
    // every mesh currently using that material, not just the clicked one.
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8e2d5,
      roughness: 0.6,
      metalness: 0.05,
    })
    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8e2d5,
      emissive: 0x00ffff,
      emissiveIntensity: 0.6,
      roughness: 0.6,
      metalness: 0.05,
    })

    let clickableObjects = []        // every raycastable submesh
    const boneGroups = new Map()     // resolved boneName -> [meshes]
    let selectedBoneName = null
    let isIsolated = false

    // GLTFLoader splits a multi-material Blender object into several child
    // Mesh nodes under one parent Group. The parent Group name is usually
    // the real bone name (e.g. "Femur.l"); the auto-generated child mesh
    // names look like "Femur.l_1", "Femur.l_2". Walk up to find the name
    // that actually identifies the bone instead of trusting the submesh.
    function resolveBoneName(mesh) {
      if (mesh.name && !/_\d+$/.test(mesh.name)) return mesh.name
      let p = mesh.parent
      while (p) {
        if (p.name) return p.name
        p = p.parent
      }
      return mesh.name
    }

    loader.load('/src/assets/skeleton4.glb', (gltf) => {
      const model = gltf.scene
      model.scale.set(4, 4, 4)

      model.traverse((node) => {
        if (!node.isMesh) return
        node.geometry.computeVertexNormals()

        const boneName = resolveBoneName(node)
        node.userData.boneName = boneName
        node.material = baseMaterial

        clickableObjects.push(node)
        if (!boneGroups.has(boneName)) boneGroups.set(boneName, [])
        boneGroups.get(boneName).push(node)
      })

      scene.add(model)
    })
    // --- 6. Click Handler (Raycasting Logic) ---
    function onPointerClick(event) {
      // Calculate mouse position in normalized device coordinates (-1 to +1)
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(pointer, camera)

      // Check for intersections with all meshes in the model, skipping
      // any that are currently hidden
      const intersects = raycaster.intersectObjects(
        clickableObjects.filter((mesh) => mesh.visible)
      )

      // Revert whatever bone group was previously highlighted
      unhighlightSelection()

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object

        // Defensive: should already be excluded by the filter above, but
        // guard here too in case intersects ever gets built another way.
        if (!hitMesh.visible) {
          onSelectBone(null)
          return
        }

        const boneName = hitMesh.userData.boneName || hitMesh.name

        highlightBoneGroup(boneName)

        console.log(`🦴 Clicked: ${boneName}`)
        onSelectBone(findBoneByMeshName(boneName)) // <-- tell React
      } else {
        onSelectBone(null) // clicked empty space, clear sidebar
      }
    }

    // Highlight every submesh that belongs to the clicked bone (not just
    // the one submesh the ray happened to hit), by swapping in the shared
    // highlight material.
    function highlightBoneGroup(boneName) {
      const group = boneGroups.get(boneName) || []
      group.forEach((mesh) => { mesh.material = highlightMaterial })
      selectedBoneName = boneName
    }

    function unhighlightSelection() {
      if (!selectedBoneName) return
      const group = boneGroups.get(selectedBoneName) || []
      group.forEach((mesh) => { mesh.material = baseMaterial })
      selectedBoneName = null
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
      if (!selectedBoneName) return

      isIsolated = !isIsolated
      const selectedGroup = new Set(boneGroups.get(selectedBoneName) || [])
      clickableObjects.forEach((mesh) => {
        mesh.visible = isIsolated ? selectedGroup.has(mesh) : true
      })
      onIsolateChange(isIsolated) // tell React the new state
    }


    function clearSelection() {
      unhighlightSelection()
      onSelectBone(null)
    }

    // Hides the currently selected bone (all submeshes in its group).
    // Distinct from isolate: this removes the bone from view entirely,
    // rather than hiding everything else around it.
    function hideSelected() {
      if (!selectedBoneName) return
      const group = boneGroups.get(selectedBoneName) || []
      group.forEach((mesh) => {
        mesh.visible = false
        mesh.material = baseMaterial // reset material so it's not stuck highlighted when shown again later
      })
      selectedBoneName = null
      onSelectBone(null)
    }


    function resetView() {
      clickableObjects.forEach((mesh) => {
        mesh.visible = true
      })
      unhighlightSelection()
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

      // Match against resolved bone-group names, not raw submesh names.
      // Skip groups that are currently hidden — a hidden bone shouldn't
      // be selectable via search any more than via a click.
      const matchedBoneName = [...boneGroups.keys()].find((name) => {
        const lower = name.toLowerCase()
        const nameMatches = aliases.includes(lower) || lower === targetName
        if (!nameMatches) return false
        const group = boneGroups.get(name) || []
        return group.some((mesh) => mesh.visible)
      })

      // Revert whatever was previously selected/highlighted
      unhighlightSelection()

      // If we were isolated, drop back to showing everything so the
      // newly searched bone is actually visible
      if (isIsolated) {
        clickableObjects.forEach((mesh) => { mesh.visible = true })
        isIsolated = false
        onIsolateChange(false)
      }

      if (matchedBoneName) {
        highlightBoneGroup(matchedBoneName)
      } else {
        console.warn(`⚠️ No mesh group found for bone "${bone.name}" — check meshAliases`)
      }

      onSelectBone(bone)
    }


    sceneApiRef.current = { toggleIsolate, resetView, clearSelection, selectBoneExternally, hideSelected }

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
    selectBone: (bone) => sceneApiRef.current.selectBoneExternally?.(bone),
    hideSelected: () => sceneApiRef.current.hideSelected?.()
  }))

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
})

export default ThreeScene
