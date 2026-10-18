"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { useSimulation } from "./SimulationProvider";
import MachineStreamTooltips from "./MachineStreamTooltips";
import type { SimulationStep } from "./simulation-data";

type LoadedObject = {
  object: THREE.Object3D;
  baseScale: number;
  basePosition: THREE.Vector3;
};

const FLOOR_SIZE = 120;
// Increased to speed up camera movement toward targets
const CAMERA_LERP_SPEED = 6;

const normalizeObject = (object: THREE.Object3D, desiredSize = 1) => {
  const box = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  box.getCenter(center);
  object.position.sub(center);

  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) {
    const scaleFactor = desiredSize / maxDim;
    object.scale.multiplyScalar(scaleFactor);
  }
};

function prepareSteps(steps: SimulationStep[]): SimulationStep[] {
  if (steps.every((step) => step.position)) return steps;
  const spacing = 3;
  const offset = (steps.length - 1) / 2;
  return steps.map((step, index) => ({
    ...step,
    position: step.position ?? [spacing * (index - offset), 0, 0],
  }));
}

export default function SimulationScene({
  embedded = false,
}: {
  /** Inside the factory shell viewport (fills its parent, no 100vh floor). */
  embedded?: boolean;
} = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const objectsRef = useRef(new Map<string, LoadedObject>());
  const rafRef = useRef<number | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const targetCameraPositionRef = useRef(new THREE.Vector3());
  const targetOrbitRef = useRef(new THREE.Vector3());
  const animationClockRef = useRef(new THREE.Clock());

  const [containerSize, setContainerSize] = useState({
    width: 1280,
    height: 720,
  });

  // local flag to show all machine tooltips (used for autonomous mode)
  const [isAutonomousMode, setIsAutonomousMode] = useState(false);
  // bump this when models are added/removed so the component re-renders and
  // child tooltip logic can pick up changes to `objectsRef` (Map mutations
  // don't trigger renders by themselves).
  const [modelsVersion, setModelsVersion] = useState(0);
  // attach global autonomous start/stop listeners
  useAutonomousFlag(setIsAutonomousMode);

  const { steps, activeMachineId } = useSimulation();
  const arrangedSteps = useMemo(() => prepareSteps(steps), [steps]);

  // keep latest active id in a ref for animation loop
  const activeIdRef = useRef<string | null>(activeMachineId);
  activeIdRef.current = activeMachineId;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);

    const width = container.clientWidth || window.innerWidth || 1280;
    const height = container.clientHeight || window.innerHeight || 720;

    setContainerSize({ width, height });

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);
    camera.position.set(0, 6, 12);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);
    controls.update();
    controlsRef.current = controls;

    targetCameraPositionRef.current.copy(camera.position);
    targetOrbitRef.current.copy(controls.target);
    animationClockRef.current.getDelta();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos: { x: number; y: number } | null = null;

    const focusOnObject = (targetObject: THREE.Object3D) => {
      const cameraInstance = cameraRef.current;
      const orbit = controlsRef.current;
      if (!cameraInstance || !orbit) return;

      const box = new THREE.Box3().setFromObject(targetObject);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const distance = Math.max(maxDim * 2, 6);

      const baseDirection = new THREE.Vector3()
        .subVectors(cameraInstance.position, orbit.target)
        .normalize();
      const rotatedDirection = baseDirection
        .clone()
        .applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          THREE.MathUtils.degToRad(18)
        )
        .multiplyScalar(distance);

      const finalPosition = center.clone().add(rotatedDirection);
      finalPosition.y = Math.max(
        finalPosition.y,
        center.y + Math.max(maxDim * 0.5, 1.2)
      );
      targetCameraPositionRef.current.copy(finalPosition);
      targetOrbitRef.current.copy(center);
    };

    const resolveStepFromObject = (
      object: THREE.Object3D
    ): { stepId: string; root: THREE.Object3D } | null => {
      let current: THREE.Object3D | null = object;
      while (current) {
        const stepId = current.userData?.stepId as string | undefined;
        if (stepId && objectsRef.current.has(stepId)) {
          const entry = objectsRef.current.get(stepId);
          if (entry) {
            return { stepId, root: entry.object };
          }
        }
        current = current.parent;
      }
      return null;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerDownPos = { x: event.clientX, y: event.clientY };
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (pointerDownPos) {
        const deltaX = Math.abs(event.clientX - pointerDownPos.x);
        const deltaY = Math.abs(event.clientY - pointerDownPos.y);
        if (deltaX > 6 || deltaY > 6) {
          pointerDownPos = null;
          return;
        }
      }
      pointerDownPos = null;

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const interactables = Array.from(objectsRef.current.values()).map(
        (entry) => entry.object
      );
      if (!interactables.length) return;

      const intersections = raycaster.intersectObjects(interactables, true);
      if (!intersections.length) return;

      const resolved = resolveStepFromObject(intersections[0].object);
      if (!resolved) return;

      focusOnObject(resolved.root);
      activeIdRef.current = resolved.stepId;
      setHighlight(resolved.stepId);
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    // lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x223344, 0.6);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(8, 12, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.5);
    rimLight.position.set(-10, 8, -6);
    scene.add(rimLight);

    // floor and subtle grid
    const floorGeo = new THREE.CircleGeometry(FLOOR_SIZE, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.9,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const gridHelper = new THREE.GridHelper(
      FLOOR_SIZE * 0.8,
      24,
      0x1d4ed8,
      0x1d4ed8
    );
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    const loader = new GLTFLoader();

    const setHighlight = (id: string | null) => {
      for (const [
        modelId,
        { object, baseScale, basePosition },
      ] of objectsRef.current) {
        const isActive = modelId === id;
        object.traverse((child: any) => {
          if (!child?.isMesh) return;
          const materials: THREE.Material[] = [];
          if (Array.isArray(child.material)) {
            materials.push(...child.material);
          } else if (child.material) {
            materials.push(child.material as THREE.Material);
          }
          for (const mat of materials) {
            mat.transparent = true;
            const targetOpacity = isActive ? 1 : 0.25;
            if ((mat as any).opacity !== targetOpacity) {
              (mat as any).opacity = targetOpacity;
              mat.needsUpdate = true;
            }
            if ("emissive" in mat && mat.emissive instanceof THREE.Color) {
              const emissiveColor = isActive ? 0x60a5fa : 0x000000;
              mat.emissive.setHex(emissiveColor);
              (mat as any).emissiveIntensity = isActive ? 0.7 : 0;
            }
          }
        });
        object.userData.baseScale = baseScale;
        object.userData.basePosition = basePosition;
      }
    };

    const loadStep = (step: SimulationStep, index: number) => {
      loader.load(
        step.modelSrc,
        (gltf) => {
          const obj = gltf.scene;
          obj.traverse((child: any) => {
            if (child?.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          normalizeObject(obj, 1);

          if (typeof step.scale === "number" && Number.isFinite(step.scale)) {
            obj.scale.multiplyScalar(step.scale);
          } else {
            obj.scale.multiplyScalar(1.5);
          }

          const hasRotation = Array.isArray(step.rotation);
          if (hasRotation) {
            const [rx = 0, ry = 0, rz = 0] = step.rotation ?? [0, 0, 0];
            const usesDegrees = [rx, ry, rz].some(
              (value) => Math.abs(value) > Math.PI * 2
            );
            const factor = usesDegrees ? Math.PI / 180 : 1;
            obj.rotation.set(rx * factor, ry * factor, rz * factor);
          }

          const [x = index * 2.5, y = 0, z = 0] = step.position ?? [
            index * 2.5,
            0,
            0,
          ];
          const adjustedY = y - 0.2;
          obj.position.set(x, adjustedY, z);

          scene.add(obj);
          const baseScale = obj.scale.x;
          const basePosition = new THREE.Vector3(x, adjustedY, z);
          objectsRef.current.set(step.id, {
            object: obj,
            baseScale,
            basePosition,
          });
          // trigger a re-render so consumers of objectsRef (tooltips) update
          setModelsVersion((v) => v + 1);
          // ensure userData exists before spreading (avoid spreading undefined)
          obj.userData = {
            ...(obj.userData ?? {}),
            baseScale,
            basePosition,
            stepId: step.id,
          };
          obj.traverse((child: any) => {
            child.userData = {
              ...(child.userData ?? {}),
              stepId: step.id,
            };
          });
          setHighlight(activeIdRef.current);
        },
        undefined,
        (error) => {
          // eslint-disable-next-line no-console
          console.error("Failed to load simulation model", step.id, error);
        }
      );
    };

    arrangedSteps.forEach(loadStep);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      const cameraInstance = cameraRef.current;
      const orbit = controlsRef.current;
      const delta = animationClockRef.current.getDelta();
      const lerpStep = Math.min(1, CAMERA_LERP_SPEED * delta);

      if (cameraInstance && orbit) {
        cameraInstance.position.lerp(targetCameraPositionRef.current, lerpStep);
        orbit.target.lerp(targetOrbitRef.current, lerpStep);
        orbit.update();
      }

      controls.update();

      const activeId = activeIdRef.current;
      for (const [
        modelId,
        { object, baseScale, basePosition },
      ] of objectsRef.current) {
        const goalScale = modelId === activeId ? baseScale * 1.12 : baseScale;
        const currentScale = object.scale.x;
        // faster scale interpolation for snappier focus transitions
        const nextScale = THREE.MathUtils.lerp(currentScale, goalScale, 0.28);
        object.scale.setScalar(nextScale);

        const targetHeight = basePosition.y + (modelId === activeId ? 0.35 : 0);
        // faster position interpolation for more responsive movement
        object.position.x = THREE.MathUtils.lerp(
          object.position.x,
          basePosition.x,
          0.28
        );
        object.position.z = THREE.MathUtils.lerp(
          object.position.z,
          basePosition.z,
          0.28
        );
        object.position.y = THREE.MathUtils.lerp(
          object.position.y,
          targetHeight,
          0.28
        );
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth || window.innerWidth;
      const h = containerRef.current.clientHeight || window.innerHeight;
      setContainerSize({ width: w, height: h });
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener("resize", handleResize);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      controls.dispose();
      renderer.dispose();
      arrangedSteps.forEach((step) => {
        const loaded = objectsRef.current.get(step.id);
        if (!loaded) return;
        loaded.object.traverse((child: any) => {
          if (child?.isMesh) {
            const materials: THREE.Material[] = [];
            if (Array.isArray(child.material)) {
              materials.push(...child.material);
            } else if (child.material) {
              materials.push(child.material as THREE.Material);
            }
            materials.forEach((mat) => {
              if ("dispose" in mat && typeof mat.dispose === "function") {
                mat.dispose();
              }
            });
            if (child.geometry?.dispose) child.geometry.dispose();
          }
        });
        scene.remove(loaded.object);
      });
      objectsRef.current.clear();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, [arrangedSteps]);

  useEffect(() => {
    // update highlight when active machine changes
    if (!objectsRef.current.size) return;
    for (const [
      modelId,
      { object, baseScale, basePosition },
    ] of objectsRef.current) {
      const isActive = modelId === activeMachineId;
      object.traverse((child: any) => {
        if (!child?.isMesh) return;
        const materials: THREE.Material[] = [];
        if (Array.isArray(child.material)) {
          materials.push(...child.material);
        } else if (child.material) {
          materials.push(child.material as THREE.Material);
        }
        for (const mat of materials) {
          (mat as any).transparent = true;
          (mat as any).opacity = isActive ? 1 : 0.25;
          if ("emissive" in mat && mat.emissive instanceof THREE.Color) {
            const emissiveColor = isActive ? 0x60a5fa : 0x000000;
            mat.emissive.setHex(emissiveColor);
            (mat as any).emissiveIntensity = isActive ? 0.7 : 0;
          }
          mat.needsUpdate = true;
        }
      });
      object.userData.baseScale = baseScale;
      object.userData.basePosition = basePosition;
      if (!isActive) {
        object.position.x = THREE.MathUtils.lerp(
          object.position.x,
          basePosition.x,
          0.18
        );
        object.position.y = THREE.MathUtils.lerp(
          object.position.y,
          basePosition.y,
          0.18
        );
        object.position.z = THREE.MathUtils.lerp(
          object.position.z,
          basePosition.z,
          0.18
        );
      }
    }
  }, [activeMachineId]);

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={embedded ? { width: "100%", height: "100%" } : { minHeight: "100vh", width: "100%" }}
      />
      <MachineStreamTooltips
        camera={cameraRef.current}
        machineObjects={objectsRef.current}
        containerWidth={containerSize.width}
        containerHeight={containerSize.height}
        containerEl={containerRef.current}
        showAll={isAutonomousMode}
      />
    </>
  );
}

// Listen for global autonomous start/stop events dispatched by the UI
// (e.g. the bottom bar) so the scene can toggle the multi-tooltip mode.
function useAutonomousFlag(
  setter: React.Dispatch<React.SetStateAction<boolean>>
) {
  useEffect(() => {
    const onStart = () => setter(true);
    const onStop = () => setter(false);
    window.addEventListener("__autonomousStarted", onStart as EventListener);
    window.addEventListener("__autonomousStopped", onStop as EventListener);
    return () => {
      window.removeEventListener(
        "__autonomousStarted",
        onStart as EventListener
      );
      window.removeEventListener(
        "__autonomousStopped",
        onStop as EventListener
      );
    };
  }, [setter]);
}

// Attach the autonomous listeners inside the module so the hook can run when
// the component mounts.
// (We call it from the component body above via the setter.)
