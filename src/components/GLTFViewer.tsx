"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import {
  createFadeInMoveRightAnimation,
  createLadleCarAnimation,
  ModelAnimation,
} from "./modelAnimations";
import { createViewerControls, ViewerControlsAPI } from "./ViewerControls";
import { mountModelModal, unmountModelModal } from "./ModelModal";
import { ModelHoverTooltip, type ModelHoverInfo } from "./ModelHoverTooltip";
import MachineStreamTooltips from "./simulation/MachineStreamTooltips";
import type { MachineDetails } from "@/lib/machines";
import { loadMachineById, loadMachines } from "@/lib/machines";
import { STATUS_COLORS, getMachineStatus } from "@/lib/machine-display";

type ModelItem = {
  id: string; // unique identifier for the model
  src: string; // path to the glb
  position?: [number, number, number];
  rotation?: [number, number, number]; // Euler in radians
  scale?: number;
};

type Props = {
  // either provide legacy single `src` or an array of models
  src?: string;
  models?: ModelItem[];
  className?: string;
  style?: CSSProperties;
  // optional global texture applied to meshes (public path)
  textureUrl?: string;
  // optional URL (under public/) to load a JSON array of ModelItem to configure models/positions
  configUrl?: string;
};

const CAMERA_LERP_SPEED = 2;

export default function GLTFViewer({
  src = "/3d-model/furnace.glb",
  models,
  className,
  style,
  textureUrl = "",
  configUrl = "/3d-model/models.json",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Drone mode has been removed — keep a static ref set to false for any legacy checks
  const [hoverInfo, setHoverInfo] = useState<ModelHoverInfo | null>(null);
  const [containerSize, setContainerSize] = useState({
    width: 1280,
    height: 720,
  });
  const hoverMachineCacheRef = useRef<Map<string, MachineDetails | null>>(
    new Map()
  );
  const hoverFetchRef = useRef<Map<string, boolean>>(new Map());
  const objectsMapRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const cameraExternalRef = useRef<THREE.PerspectiveCamera | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth /
        Math.max(container.clientHeight, window.innerHeight || 600),
      0.1,
      1000
    );
    camera.position.set(0, 1.5, 3);
    const cameraRef = {
      current: camera,
    } as { current: THREE.PerspectiveCamera | null };
    cameraExternalRef.current = camera;

    const width = container.clientWidth || window.innerWidth || 1280;
    const height = container.clientHeight || window.innerHeight || 720;
    setContainerSize({ width, height });

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    // enable shadows for a more realistic floor contact
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type =
      (THREE as any).PCFSoftShadowMap || THREE.PCFSoftShadowMap;
    // ensure correct color space so sRGB textures display properly
    (renderer as any).outputEncoding = (THREE as any).sRGBEncoding;
    container.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(3, 10, 10);
    dir.castShadow = true;
    // configure shadow camera for directional light
    try {
      dir.shadow.mapSize.width = 2048;
      dir.shadow.mapSize.height = 2048;
      const d = 30;
      (dir.shadow.camera as any).left = -d;
      (dir.shadow.camera as any).right = d;
      (dir.shadow.camera as any).top = d;
      (dir.shadow.camera as any).bottom = -d;
      (dir.shadow.camera as any).near = 0.5;
      (dir.shadow.camera as any).far = 200;
    } catch (e) {
      /* ignore if shadow camera properties not writable */
    }
    scene.add(dir);

    // Additional lighting to improve model readability and depth.
    // Ambient light provides a soft base illumination so dark areas aren't fully black.
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambient);

    // Key point light: warm, bright source that simulates main studio light.
    const keyLight = new THREE.PointLight(0xfff2e6, 0.9, 0, 2);
    keyLight.position.set(5, 8, 5);
    keyLight.castShadow = true;
    try {
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.radius = 4;
    } catch (e) {
      /* ignore if shadow props not writable */
    }
    scene.add(keyLight);

    // Fill light: cool tint to balance warm key and reveal shadow details.
    const fillLight = new THREE.PointLight(0x88aaff, 0.35, 0, 1);
    fillLight.position.set(-6, 3, -4);
    scene.add(fillLight);

    // Rim/back light to create separation from background
    const rimLight = new THREE.PointLight(0xffffff, 0.2, 0, 1);
    rimLight.position.set(0, 6, -8);
    scene.add(rimLight);

    // add a ground plane and grid helper to define the map floor
    const floorSize = 200;
    const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0; // floor at y=0
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const grid = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
    grid.position.y = 0.001; // avoid z-fighting with floor
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.target.set(0, 1, 0);
    controls.update();
    const controlsRef = { current: controls } as { current: any };
    // drone mode disabled: always false
    const droneModeRef = { current: false } as { current: boolean };
    const targetCameraPosition = new THREE.Vector3().copy(camera.position);
    const targetOrbit = new THREE.Vector3().copy(controls.target);
    const animationClock = new THREE.Clock();
    animationClock.getDelta();
    let focusActive = false;
    let isUserInteracting = false;

    function focusOnObject(targetObject: THREE.Object3D | null, meta?: any) {
      if (!targetObject || droneModeRef.current) return;

      const cameraInstance = cameraRef.current;
      const orbit = controlsRef.current as OrbitControls | null;
      if (!cameraInstance || !orbit) return;

      const box = new THREE.Box3().setFromObject(targetObject);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const distance = Math.max(maxDim * 1.8, 3);

      const baseDirection = new THREE.Vector3()
        .subVectors(cameraInstance.position, orbit.target)
        .normalize();
      if (baseDirection.lengthSq() === 0) {
        baseDirection.set(0, 0.5, 1).normalize();
      }
      const rotatedDirection = baseDirection
        .clone()
        .applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          THREE.MathUtils.degToRad(15)
        )
        .multiplyScalar(distance);

      const finalPosition = center.clone().add(rotatedDirection);
      finalPosition.y = Math.max(
        center.y + Math.max(maxDim * 0.4, 0.8),
        finalPosition.y
      );

      targetCameraPosition.copy(finalPosition);
      targetOrbit.copy(center);
      focusActive = true;
      animationClock.getDelta();
      isUserInteracting = false;

      if (meta && meta.cameraOffset) {
        try {
          const offset = meta.cameraOffset as THREE.Vector3;
          if (offset instanceof THREE.Vector3) {
            targetCameraPosition.add(offset);
          }
        } catch (e) {
          /* ignore optional meta offsets */
        }
      }
    }

    const onControlsStart = () => {
      isUserInteracting = true;
      focusActive = false;
    };
    const onControlsEnd = () => {
      isUserInteracting = false;
      if (!focusActive) {
        targetCameraPosition.copy(camera.position);
        targetOrbit.copy(controls.target);
      }
    };
    (controls as any).addEventListener("start", onControlsStart);
    (controls as any).addEventListener("end", onControlsEnd);

    const gltfLoader = new GLTFLoader();
    const stlLoader = new STLLoader();
    const texLoader = new THREE.TextureLoader();
    let modalMounted = false;
    let pendingModalId: string | null = null;

    const openModalForObject = (object: THREE.Object3D, meta: any = {}) => {
      if (object?.userData?.allowInteraction === false) return;
      try {
        const id = object.userData?.modelId || object.name || "(unknown)";
        const description = meta?.description ?? object.userData?.description;
        const snapshot = object.clone(true);
        focusOnObject(object, meta);
        if (modalMounted) {
          try {
            unmountModelModal();
          } catch (err) {
            console.error("Failed to unmount existing model modal", err);
          }
          modalMounted = false;
        }
        mountModelModal({
          id,
          position: object.position.clone(),
          rotation: object.rotation.clone(),
          scale: object.scale.clone(),
          description,
          objectSnapshot: snapshot,
          onClose: () => {
            modalMounted = false;
          },
        });
        modalMounted = true;
        pendingModalId = null;
      } catch (err) {
        console.error("Failed to mount model modal", err);
      }
    };

    // Status rings: a flat ring under each machine in its status colour
    // (Running / Idle / Trouble / Maintenance / Shutdown). Not pickable.
    const statusRings: THREE.Mesh[] = [];
    const machinesForStatus = loadMachines().catch(() => [] as MachineDetails[]);
    const addStatusRing = (modelId: string, target: THREE.Object3D) => {
      void machinesForStatus.then((list) => {
        if (disposed || modelId === "arrow") return;
        const machine = list.find((item) => item.id === modelId);
        if (!machine) return;
        target.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(target);
        if (box.isEmpty()) return;
        const size = box.getSize(new THREE.Vector3());
        // Ellipse fitted to the footprint so long machines don't get huge rings.
        const rx = size.x * 0.55 + 0.06;
        const rz = size.z * 0.55 + 0.06;
        const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color(STATUS_COLORS[getMachineStatus(machine)]),
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const thickness = Math.min(0.12, Math.min(rx, rz) * 0.25);
        const ring = new THREE.Mesh(new THREE.RingGeometry(1 - thickness / Math.max(rx, rz), 1, 64), material);
        ring.rotation.x = -Math.PI / 2;
        ring.scale.set(rx, rz, 1);
        ring.position.set(
          (box.min.x + box.max.x) / 2,
          Math.max(box.min.y, 0) + 0.015, // never below the floor plane (y = 0)
          (box.min.z + box.max.z) / 2
        );
        ring.renderOrder = 2;
        ring.raycast = () => {};
        ring.userData.allowInteraction = false;
        scene.add(ring);
        statusRings.push(ring);
      });
    };

    // track loaded objects, materials and textures for cleanup
    const objects = new Map<string, THREE.Object3D>();
    // custom per-model animation handlers (e.g. arrow left->right motion)
    const customAnimations = new Map<string, ModelAnimation>();
    const clonedMaterials: THREE.Material[] = [];
    // outlineMeshes holds temporary outline overlays for special models (e.g. floor)
    const outlineMeshes: THREE.Mesh[] = [];
    const appliedTextures: THREE.Texture[] = [];
    // viewer controls (separate DOM panel) - provide deps for selection
    const controlsApi: ViewerControlsAPI = createViewerControls(container, {
      getObjects: () =>
        Array.from(objects.values()).filter(
          (obj) => obj.userData?.allowInteraction !== false
        ),
      camera,
      domElement: renderer.domElement,
      onSelect: ({ object, meta }) => {
        openModalForObject(object, meta);
      },
      onDeselect: () => {
        if (!modalMounted) return;
        try {
          unmountModelModal();
        } catch (err) {
          console.error("Failed to unmount model modal", err);
        }
        modalMounted = false;
      },
    });

    const handleExternalOpen = (event: Event) => {
      try {
        const detail = (event as CustomEvent<{ id?: string }>).detail;
        const targetId = detail?.id;
        if (!targetId) return;
        const direct =
          objects.get(targetId) ??
          Array.from(objects.values()).find((obj) => {
            const modelId = String(obj.userData?.modelId || obj.name || "");
            return modelId.toLowerCase() === targetId.toLowerCase();
          });
        if (direct) {
          openModalForObject(direct);
          pendingModalId = null;
          return;
        }
        pendingModalId = targetId;
      } catch (err) {
        console.error("Failed processing external model modal request", err);
      }
    };

    window.addEventListener(
      "__openModelModal",
      handleExternalOpen as EventListener
    );

    // helper to apply a texture to a mesh and clone materials safely
    const applyTextureToMesh = (mesh: any, texture: THREE.Texture | null) => {
      const mat = mesh.material;
      if (!mat) return;
      if (Array.isArray(mat)) {
        const newMats = mat.map((m: any) => {
          try {
            const cloned = m.clone();
            if (texture && "map" in cloned) cloned.map = texture;
            cloned.needsUpdate = true;
            clonedMaterials.push(cloned);
            return cloned;
          } catch (e) {
            const mm = new THREE.MeshStandardMaterial({ map: texture || null });
            mm.needsUpdate = true;
            clonedMaterials.push(mm);
            return mm;
          }
        });
        mesh.material = newMats as any;
      } else {
        try {
          const cloned = mat.clone();
          if (texture && "map" in cloned) cloned.map = texture;
          cloned.needsUpdate = true;
          mesh.material = cloned;
          clonedMaterials.push(cloned);
        } catch (e) {
          const mm = new THREE.MeshStandardMaterial({ map: texture || null });
          mm.needsUpdate = true;
          mesh.material = mm;
          clonedMaterials.push(mm);
        }
      }
    };

    // load optional global texture (if provided)
    let globalTexture: THREE.Texture | null = null;
    if (textureUrl) {
      try {
        texLoader.load(
          textureUrl,
          (texture) => {
            (texture as any).encoding = (THREE as any).sRGBEncoding;
            texture.flipY = false;
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(1, 1);
            texture.generateMipmaps = true;
            texture.minFilter =
              (THREE as any).LinearMipmapLinearFilter ||
              THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            try {
              (texture as any).anisotropy = (renderer as any).capabilities
                ?.getMaxAnisotropy
                ? (renderer as any).capabilities.getMaxAnisotropy()
                : ((renderer as any).capabilities || {}).maxAnisotropy || 1;
            } catch (e) {
              /* ignore */
            }
            texture.needsUpdate = true;
            globalTexture = texture;
            appliedTextures.push(texture);
            // once texture is ready, (re)apply to all already loaded meshes
            for (const obj of objects.values()) {
              try {
                if (obj.userData && obj.userData.modelId === "arrow") continue;
              } catch (e) {}
              obj.traverse((child: any) => {
                if (child.isMesh) applyTextureToMesh(child, globalTexture);
              });
            }
          },
          undefined,
          () => {
            // ignore texture load errors
          }
        );
      } catch (e) {
        // ignore
      }
    }

    // helper to center+scale an object to a reasonable size
    const normalizeObject = (obj: THREE.Object3D, desiredSize = 1.5) => {
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const scale = desiredSize / maxDim;
        obj.scale.setScalar(scale);
      }
      const center = new THREE.Vector3();
      box.getCenter(center);
      obj.position.sub(center);
    };

    // load or update models when `models` prop changes. We also support legacy `src` prop as a single model.
    const getModelList = () => {
      if (models && models.length > 0) return models;
      // load all known models from public/3d-model and arrange in a grid
      const files = [
        "arrow.glb",
        "casting-machine.glb",
        "furnace.glb",
        "homogenizing.glb",
        "rod-feeder.glb",
        "sir.glb",
        "ut.glb",
      ];
      const cols = 4;
      const spacing = 2.0;
      return files.map((fname, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const offsetX = (col - (cols - 1) / 2) * spacing;
        const offsetZ =
          (row - (Math.ceil(files.length / cols) - 1) / 2) * spacing;
        const id = fname.replace(/\.glb$/i, "");
        return {
          id,
          src: `/3d-model/${fname}`,
          position: [offsetX, 0, offsetZ] as [number, number, number],
          scale: 1,
        } as ModelItem;
      });
    };

    // map to track model src used for an id to detect re-loads
    const updateModels = (items: ModelItem[]) => {
      const incomingIds = new Set(items.map((m) => m.id));

      // remove objects that are not in incoming list
      for (const [id, obj] of objects.entries()) {
        if (!incomingIds.has(id)) {
          const anim = customAnimations.get(id);
          if (anim) {
            try {
              anim.dispose?.();
            } catch (e) {
              /* ignore */
            }
            customAnimations.delete(id);
          }
          scene.remove(obj);
          // dispose materials on meshes
          obj.traverse((child: any) => {
            if (child.isMesh) {
              try {
                if (child.material) {
                  if (Array.isArray(child.material)) {
                    child.material.forEach(
                      (mm: any) => mm.dispose && mm.dispose()
                    );
                  } else child.material.dispose && child.material.dispose();
                }
              } catch (e) {
                // ignore
              }
            }
          });
          objects.delete(id);
          objectsMapRef.current.delete(id);
        }
      }

      // add or update incoming models
      for (const m of items) {
        const existing = objects.get(m.id);
        if (existing) {
          // update transforms
          const [x = 0, y = 0, z = 0] = m.position || [0, 0, 0];
          existing.position.set(x, y, z);
          if (m.rotation)
            existing.rotation.set(m.rotation[0], m.rotation[1], m.rotation[2]);
          if (typeof m.scale === "number") existing.scale.setScalar(m.scale);
          continue;
        }

        // load new model (supports .glb/.gltf and .stl)
        const finalize = (obj: THREE.Object3D, animations: any[] = []) => {
          const idLower = (m.id || "").toLowerCase();
          const srcLower = (m.src || "").toLowerCase();
          const isFloor = idLower === "floor" || srcLower.includes("floor");
          const isLadleCar =
            idLower === "car" ||
            idLower === "ladle_car" ||
            srcLower.includes("ladle_car.glb");
          const isRoad = idLower === "road" || srcLower.includes("road.glb");
          const allowInteraction = !(isFloor || isLadleCar || isRoad);

          try {
            obj.userData = obj.userData || {};
            obj.userData.allowInteraction = allowInteraction;
            if (allowInteraction) {
              obj.userData.modelId = m.id;
            } else if ("modelId" in obj.userData) {
              delete obj.userData.modelId;
            }
          } catch (e) {
            /* ignore */
          }

          try {
            obj.traverse((child: any) => {
              child.userData = child.userData || {};
              child.userData.allowInteraction = allowInteraction;
              if (!allowInteraction) {
                if ("modelId" in child.userData) delete child.userData.modelId;
              } else if (typeof child.userData.modelId === "undefined") {
                child.userData.modelId = m.id;
              }
              if (child.isMesh) {
                try {
                  child.castShadow = true;
                  child.receiveShadow = true;
                } catch (e) {
                  /* ignore */
                }
                if (allowInteraction && !child.userData.modelId) {
                  child.userData.modelId = m.id;
                }
              }
            });
          } catch (e) {
            /* ignore */
          }

          try {
            normalizeObject(obj, 1.5);
          } catch (e) {
            /* ignore normalization errors */
          }

          const [x = 0, y = 0, z = 0] = m.position || [0, 0, 0];
          obj.position.set(x, y, z);
          if (m.rotation) {
            try {
              let rx = m.rotation[0] || 0;
              let ry = m.rotation[1] || 0;
              let rz = m.rotation[2] || 0;
              const limit = Math.PI * 2;
              const isLikelyDegrees =
                Math.abs(rx) > limit ||
                Math.abs(ry) > limit ||
                Math.abs(rz) > limit;
              if (isLikelyDegrees) {
                const toRad = (v: number) => (v * Math.PI) / 180;
                rx = toRad(rx);
                ry = toRad(ry);
                rz = toRad(rz);
              }
              obj.rotation.set(rx, ry, rz);
            } catch (e) {
              /* ignore rotation errors */
            }
          }
          if (typeof m.scale === "number") obj.scale.setScalar(m.scale);

          scene.add(obj);
          objects.set(m.id, obj);
          if (allowInteraction) addStatusRing(m.id, obj);
          objectsMapRef.current.set(m.id, obj);
          try {
            if (!obj.name) obj.name = m.id;
          } catch (e) {
            /* ignore */
          }

          try {
            obj.userData = obj.userData || {};
            if (isFloor) {
              obj.userData.allowInteraction = false;
              if ("modelId" in obj.userData) delete obj.userData.modelId;
              obj.userData.clips = [];
              // create a subtle glow/outline overlay for floor that does not affect
              // scene lighting. Use MeshBasicMaterial which is unlit so it won't
              // change lighting on other objects. We create slightly scaled
              // back-facing meshes for a soft outline effect.
              try {
                obj.traverse((child: any) => {
                  if (!child.isMesh) return;
                  try {
                    const geom = child.geometry;
                    if (!geom) return;
                    const outlineMat = new THREE.MeshBasicMaterial({
                      color: 0x00aaff,
                      transparent: true,
                      opacity: 0.18,
                      depthWrite: false,
                      side: THREE.BackSide,
                    });
                    const outlineMesh = new THREE.Mesh(geom, outlineMat);
                    outlineMesh.matrixAutoUpdate = false;
                    outlineMesh.applyMatrix4(child.matrixWorld);
                    // slightly enlarge to form an outline
                    outlineMesh.scale.multiplyScalar(1.02);
                    outlineMesh.renderOrder = (child.renderOrder || 0) - 1;
                    // keep track for cleanup
                    outlineMeshes.push(outlineMesh);
                    scene.add(outlineMesh);
                    // also track material for disposal
                    clonedMaterials.push(outlineMat);
                  } catch (e) {
                    /* ignore outline creation errors */
                  }
                });
              } catch (e) {
                /* ignore */
              }
            } else {
              if (typeof obj.userData.allowInteraction === "undefined") {
                obj.userData.allowInteraction = true;
              }
              obj.userData.modelId = m.id;
              obj.userData.clips = (animations || []).map(
                (a: any) => a?.name || ""
              );
            }
          } catch (e) {
            /* ignore */
          }

          if (
            allowInteraction &&
            pendingModalId &&
            m.id &&
            m.id.toLowerCase() === pendingModalId.toLowerCase()
          ) {
            openModalForObject(obj);
            pendingModalId = null;
          }

          try {
            const modelCfg: any = m as any;
            if (modelCfg && modelCfg.texture) {
              texLoader.load(
                modelCfg.texture,
                (t) => {
                  try {
                    (t as any).encoding = (THREE as any).sRGBEncoding;
                    t.flipY = false;
                    t.wrapS = t.wrapT = THREE.RepeatWrapping;
                    t.repeat.set(1, 1);
                    t.generateMipmaps = true;
                    t.minFilter =
                      (THREE as any).LinearMipmapLinearFilter ||
                      THREE.LinearMipmapLinearFilter;
                    t.magFilter = THREE.LinearFilter;
                    t.needsUpdate = true;
                    appliedTextures.push(t);
                    obj.traverse((child: any) => {
                      if (child.isMesh) applyTextureToMesh(child, t);
                    });
                  } catch (e) {
                    /* ignore */
                  }
                },
                undefined,
                () => {
                  /* ignore per-model texture load errors */
                }
              );
            } else if (globalTexture && m.id !== "arrow") {
              obj.traverse((child: any) => {
                if (child.isMesh) applyTextureToMesh(child, globalTexture);
              });
            }
          } catch (e) {
            /* ignore texture errors */
          }

          try {
            if (m.id === "arrow") {
              const baseX = obj.position.x || 0;
              const distance = (m as any).animationDistance || 1.6;
              const duration = (m as any).animationDuration || 1.4;
              const anim = createFadeInMoveRightAnimation(obj, {
                baseX,
                distance,
                duration,
              });
              const prev = customAnimations.get(m.id);
              try {
                prev?.dispose?.();
              } catch (e) {
                /* ignore */
              }
              customAnimations.set(m.id, anim);
            } else if (m.id === "car" || m.id === "ladle_car") {
              const anim = createLadleCarAnimation(obj, {
                start: [
                  (m as any).animationStartX ?? -2,
                  (m as any).animationStartY ?? 0.05,
                  (m as any).animationStartZ ?? 2,
                ],
                waypoint: [
                  (m as any).animationWaypointX ?? 4.5,
                  (m as any).animationWaypointY ?? 0.05,
                  (m as any).animationWaypointZ ?? 2,
                ],
                end: [
                  (m as any).animationEndX ?? 4.5,
                  (m as any).animationEndY ?? 0.05,
                  (m as any).animationEndZ ?? 6,
                ],
                startYawDeg: (m as any).animationStartYaw ?? 270,
                endYawDeg: (m as any).animationEndYaw ?? 180,
                forwardDuration: (m as any).animationForwardDuration ?? 6,
                cornerDuration: (m as any).animationCornerDuration ?? 4,
                dwellDuration: (m as any).animationDwellDuration ?? 2,
                returnDuration: (m as any).animationReturnDuration ?? 2,
              });
              const prev = customAnimations.get(m.id);
              try {
                prev?.dispose?.();
              } catch (e) {
                /* ignore */
              }
              customAnimations.set(m.id, anim);
            }
          } catch (e) {
            /* ignore animation errors */
          }
        };

        const extension = (m.src.split(".").pop() || "").toLowerCase();
        if (extension === "stl") {
          stlLoader.load(
            m.src,
            (geometry: THREE.BufferGeometry) => {
              try {
                geometry.computeVertexNormals();
              } catch (e) {
                /* ignore */
              }
              const material = new THREE.MeshStandardMaterial({
                color: 0xffffff,
              });
              material.needsUpdate = true;
              const mesh = new THREE.Mesh(geometry, material);
              mesh.name = m.id;
              clonedMaterials.push(material);
              const group = new THREE.Group();
              group.name = `${m.id}-root`;
              group.add(mesh);
              finalize(group, []);
            },
            undefined,
            (err: unknown) => {
              // eslint-disable-next-line no-console
              console.error("STL load error:", err);
            }
          );
          continue;
        }

        gltfLoader.load(
          m.src,
          (gltf: any) => {
            const obj = gltf.scene;
            obj.traverse((child: any) => {
              if (child.isMesh) {
                const geom: THREE.BufferGeometry | undefined = child.geometry;
                if (geom) {
                  const posAttr = geom.getAttribute("position");
                  if (posAttr && !geom.getAttribute("uv")) {
                    if (!geom.boundingBox) geom.computeBoundingBox();
                    const bbox = geom.boundingBox!;
                    const size = new THREE.Vector3();
                    bbox.getSize(size);
                    const count = posAttr.count;
                    const uvArray = new Float32Array(count * 2);
                    for (let i = 0; i < count; i++) {
                      const px = posAttr.getX(i);
                      const py = posAttr.getY(i);
                      const u = (px - bbox.min.x) / (size.x || 1);
                      const v = (py - bbox.min.y) / (size.y || 1);
                      uvArray[i * 2] = u;
                      uvArray[i * 2 + 1] = v;
                    }
                    geom.setAttribute(
                      "uv",
                      new THREE.BufferAttribute(uvArray, 2)
                    );
                  }
                }
              }
            });
            finalize(obj, gltf.animations || []);
          },
          undefined,
          (err: unknown) => {
            // eslint-disable-next-line no-console
            console.error("GLTF load error:", err);
          }
        );
      }
    };

    // initial load --- if `models` prop provided use it, else try to fetch configUrl then fallback to default grid
    (async () => {
      if (models && models.length > 0) {
        updateModels(getModelList());
        return;
      }
      try {
        const res = await fetch(configUrl, { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as ModelItem[];
          if (Array.isArray(json) && json.length > 0) {
            updateModels(json);
            return;
          }
        }
      } catch (e) {
        // ignore fetch errors and fallback
      }
      updateModels(getModelList());
    })();

    // --- Drone camera support ---
    const movement = {
      forward: false,
      back: false,
      left: false,
      right: false,
      up: false,
      down: false,
    };
    const movementRef = { current: movement } as { current: typeof movement };
    let pointerLocked = false;
    // structured look state for clearer controls
    let isRightMouseDown = false;
    let lastMouse = { x: 0, y: 0 };
    const look = { yaw: camera.rotation.y, pitch: camera.rotation.x };
    const lookSens = 0.004; // sensitivity for right-drag look

    // pointer lock change handling removed because drone mode is disabled

    const onMouseMove = (e: MouseEvent) => {
      const cam = cameraRef.current;
      if (!cam) return;
      // pointer lock mode: use movementX/movementY (continuous)
      if (pointerLocked) {
        const sens = 0.0025;
        look.pitch -= e.movementY * sens;
        look.yaw -= e.movementX * sens;
      } else if (isRightMouseDown) {
        // right-button drag look: use client coordinates and lastMouse
        const dx = e.clientX - lastMouse.x;
        const dy = e.clientY - lastMouse.y;
        look.yaw -= dx * lookSens;
        look.pitch -= dy * lookSens;
        lastMouse.x = e.clientX;
        lastMouse.y = e.clientY;
      } else {
        return;
      }
      // clamp pitch to avoid flip
      const piHalf = Math.PI / 2 - 0.01;
      look.pitch = Math.max(-piHalf, Math.min(piHalf, look.pitch));
      // apply rotation using YXZ order (yaw then pitch)
      cam.rotation.order = "YXZ" as any;
      cam.rotation.x = look.pitch;
      cam.rotation.y = look.yaw;
    };

    const onMouseDown = (e: MouseEvent) => {
      // right button (2) initiates drag-look
      if (e.button === 2) {
        isRightMouseDown = true;
        lastMouse.x = e.clientX;
        lastMouse.y = e.clientY;
        // disable orbit while dragging
        try {
          controlsRef.current.enabled = false;
        } catch (err) {
          /* ignore */
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        isRightMouseDown = false;
        // re-enable orbit if not in drone mode
        try {
          controlsRef.current.enabled = !droneModeRef.current;
        } catch (err) {
          /* ignore */
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // support both event.code and event.key for broader compatibility
      const code = e.code;
      const key = e.key;
      // drone mode disabled; keyboard movement keys will update movementRef only

      switch (code) {
        case "KeyW":
          movementRef.current.forward = true;
          break;
        case "KeyS":
          movementRef.current.back = true;
          break;
        case "KeyA":
          movementRef.current.left = true;
          break;
        case "KeyD":
          movementRef.current.right = true;
          break;
        case "Space":
          movementRef.current.up = true;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          movementRef.current.down = true;
          break;
        default:
          // fallback checks using key (some browsers use key instead of code)
          if (key === "Shift") {
            movementRef.current.down = true;
          }
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key;
      switch (code) {
        case "KeyW":
          movementRef.current.forward = false;
          break;
        case "KeyS":
          movementRef.current.back = false;
          break;
        case "KeyA":
          movementRef.current.left = false;
          break;
        case "KeyD":
          movementRef.current.right = false;
          break;
        case "Space":
          movementRef.current.up = false;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          movementRef.current.down = false;
          break;
        default:
          if (key === "Shift") movementRef.current.down = false;
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    // pointer lock change listener removed (drone mode disabled)
    document.addEventListener("mousemove", onMouseMove);
    // right-click drag handlers on the canvas
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    renderer.domElement.addEventListener("mouseup", onMouseUp);
    // prevent default context menu on right-click so drag feels natural
    const preventContext = (ev: Event) => ev.preventDefault();
    renderer.domElement.addEventListener("contextmenu", preventContext);

    // drone toggle and related custom events removed

    // watch for prop changes via a mutation observer on models array by polling in RAF tick.
    // Simpler approach: re-run update when `models` changes by using another effect below that
    // has `models` in its dependency array. To keep this effect self-contained, we set up a
    // small interval to detect changes to incoming models prop via the closure.
    // (We'll also rely on React to recreate this effect when dependencies change.)

    let raf = 0;
    let prevTime = performance.now();
    const startTime = performance.now();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min(0.1, (now - prevTime) / 1000);
      prevTime = now;
      const elapsed = (now - startTime) / 1000;

      // apply drone movement if enabled
      if (droneModeRef.current) {
        const cam = cameraRef.current;
        if (cam) {
          const speed = 3; // units per second
          const move = movementRef.current;
          // forward/back based on camera direction
          const dir = new THREE.Vector3();
          cam.getWorldDirection(dir);
          // ignore vertical component for forward/back movement
          const forward = new THREE.Vector3(dir.x, 0, dir.z).normalize();
          const right = new THREE.Vector3()
            .crossVectors(forward, new THREE.Vector3(0, 1, 0))
            .normalize();
          const deltaPos = new THREE.Vector3();
          if (move.forward) deltaPos.add(forward);
          if (move.back) deltaPos.sub(forward);
          if (move.right) deltaPos.add(right);
          if (move.left) deltaPos.sub(right);
          if (move.up) deltaPos.y += 1;
          if (move.down) deltaPos.y -= 1;
          if (deltaPos.lengthSq() > 0) {
            deltaPos.normalize().multiplyScalar(speed * dt);
            cam.position.add(deltaPos);
          }
        }
      }

      const delta = animationClock.getDelta();
      const lerpStep = Math.min(1, CAMERA_LERP_SPEED * delta);

      if (!droneModeRef.current && !isUserInteracting) {
        camera.position.lerp(targetCameraPosition, lerpStep);
        controls.target.lerp(targetOrbit, lerpStep);
        if (
          camera.position.distanceToSquared(targetCameraPosition) < 1e-4 &&
          controls.target.distanceToSquared(targetOrbit) < 1e-4
        ) {
          focusActive = false;
          targetCameraPosition.copy(camera.position);
          targetOrbit.copy(controls.target);
        }
      } else {
        focusActive = false;
        targetCameraPosition.copy(camera.position);
        targetOrbit.copy(controls.target);
      }

      controls.update();

      // advance any custom per-model animations
      try {
        for (const anim of customAnimations.values()) {
          try {
            anim.update(elapsed);
          } catch (e) {
            /* ignore per-animation errors */
          }
        }
      } catch (e) {
        /* ignore animation errors */
      }

      renderer.render(scene, camera);
    };
    const hoverRaycaster = new THREE.Raycaster();
    const hoverMouse = new THREE.Vector2();
    const hoverBox = new THREE.Box3();
    const hoverCenter = new THREE.Vector3();
    const hoverProjected = new THREE.Vector3();
    let lastHoverId: string | null = null;

    const machineCache = hoverMachineCacheRef.current;
    const fetchCache = hoverFetchRef.current;

    const resolveMachine = (modelId: string) => {
      if (machineCache.has(modelId) || fetchCache.get(modelId)) return;
      fetchCache.set(modelId, true);
      loadMachineById(modelId)
        .then((data) => {
          if (disposed) return;
          machineCache.set(modelId, data);
          setHoverInfo((current) => {
            if (!current || current.id !== modelId) return current;
            return { ...current, machine: data };
          });
        })
        .catch(() => {
          if (disposed) return;
          machineCache.set(modelId, null);
        })
        .finally(() => {
          fetchCache.delete(modelId);
        });
    };

    const clearHover = () => {
      if (lastHoverId === null) return;
      lastHoverId = null;
      if (!disposed) setHoverInfo(null);
    };

    const onCanvasPointerMove = (event: PointerEvent) => {
      if (disposed) return;
      if (pointerLocked || droneModeRef.current) {
        clearHover();
        return;
      }
      const cam = cameraRef.current;
      if (!cam) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const width = rect.width || 1;
      const height = rect.height || 1;
      hoverMouse.x = ((event.clientX - rect.left) / width) * 2 - 1;
      hoverMouse.y = -((event.clientY - rect.top) / height) * 2 + 1;
      hoverRaycaster.setFromCamera(hoverMouse, cam);

      const candidates = Array.from(objects.values()).filter(
        (obj) => obj.userData?.allowInteraction !== false
      );
      if (!candidates.length) {
        clearHover();
        return;
      }
      const intersections = hoverRaycaster.intersectObjects(candidates, true);
      if (!intersections.length) {
        clearHover();
        return;
      }

      let picked: THREE.Object3D | null = intersections[0].object;
      while (picked && !picked.userData?.modelId) {
        picked = picked.parent;
      }

      if (!picked) {
        clearHover();
        return;
      }

      if (picked.userData?.allowInteraction === false) {
        clearHover();
        return;
      }

      const rawId = picked.userData?.modelId;
      if (!rawId) {
        clearHover();
        return;
      }
      const modelId = String(rawId);

      if (lastHoverId !== modelId) {
        lastHoverId = modelId;
        resolveMachine(modelId);
      }

      hoverBox.setFromObject(picked);
      hoverCenter.set(
        (hoverBox.min.x + hoverBox.max.x) / 2,
        hoverBox.max.y,
        (hoverBox.min.z + hoverBox.max.z) / 2
      );
      hoverProjected.copy(hoverCenter).project(cam);
      const screenX = rect.left + ((hoverProjected.x + 1) / 2) * width;
      const screenY = rect.top + ((-hoverProjected.y + 1) / 2) * height;

      if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
        clearHover();
        return;
      }

      const machine = machineCache.get(modelId) ?? null;
      setHoverInfo((previous) => {
        if (disposed) return previous;
        if (
          previous &&
          previous.id === modelId &&
          Math.abs(previous.screenX - screenX) < 0.5 &&
          Math.abs(previous.screenY - screenY) < 0.5 &&
          previous.machine === machine
        ) {
          return previous;
        }
        return {
          id: modelId,
          screenX,
          screenY,
          machine,
        };
      });
    };

    const onCanvasPointerLeave = () => {
      clearHover();
    };

    renderer.domElement.addEventListener("pointermove", onCanvasPointerMove);
    renderer.domElement.addEventListener("pointerleave", onCanvasPointerLeave);
    renderer.domElement.addEventListener("pointerdown", clearHover);

    animate();

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight || 300;
      setContainerSize({ width: w, height: h });
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };
    window.addEventListener("resize", onResize);
    // selection is handled by ViewerControls (it was moved out of the viewer)

    // create overlay element with instructions and toggle button
    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.top = "12px";
    overlay.style.left = "12px";
    overlay.style.padding = "8px 10px";
    overlay.style.background = "rgba(0,0,0,0.5)";
    overlay.style.color = "#fff";
    overlay.style.fontSize = "13px";
    overlay.style.borderRadius = "6px";
    overlay.style.zIndex = "999";

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      // pointer listener cleaned up by ViewerControls
      try {
        controlsApi.dispose();
      } catch (e) {}
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      // pointerlock listener removed previously
      document.removeEventListener("mousemove", onMouseMove);
      // drone-related event listeners removed
      window.removeEventListener(
        "__openModelModal",
        handleExternalOpen as EventListener
      );
      try {
        renderer.domElement.removeEventListener(
          "pointermove",
          onCanvasPointerMove
        );
        renderer.domElement.removeEventListener(
          "pointerleave",
          onCanvasPointerLeave
        );
        renderer.domElement.removeEventListener("pointerdown", clearHover);
      } catch (e) {
        /* ignore */
      }
      clearHover();
      try {
        if (overlay && overlay.parentElement)
          overlay.parentElement.removeChild(overlay);
      } catch (e) {
        /* ignore */
      }
      try {
        (controls as any).removeEventListener("start", onControlsStart);
        (controls as any).removeEventListener("end", onControlsEnd);
      } catch (e) {
        /* ignore */
      }
      controls.dispose();
      // remove and dispose all loaded objects
      for (const obj of objects.values()) {
        try {
          scene.remove(obj);
        } catch (e) {
          /* ignore */
        }
      }
      objects.clear();
      // dispose cloned materials and textures
      try {
        clonedMaterials.forEach((m) => {
          try {
            m.dispose();
          } catch (e) {
            // ignore
          }
        });
        appliedTextures.forEach((t) => {
          try {
            t.dispose();
          } catch (e) {
            // ignore
          }
        });
        // remove and cleanup any outline overlay meshes we created for special
        // models (we don't dispose geometry because it's shared with original meshes)
        try {
          outlineMeshes.forEach((om) => {
            try {
              if (om.parent) om.parent.remove(om);
            } catch (e) {
              /* ignore */
            }
          });
          outlineMeshes.length = 0;
        } catch (e) {
          /* ignore */
        }
        for (const anim of customAnimations.values()) {
          try {
            anim.dispose?.();
          } catch (e) {
            /* ignore */
          }
        }
        customAnimations.clear();
      } catch (e) {
        // ignore
      }
      statusRings.forEach((ring) => {
        scene.remove(ring);
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      });
      statusRings.length = 0;
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, JSON.stringify(models || [])]);

  return (
    <>
      <div
        ref={containerRef}
        className={className}
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          ...(style || {}),
        }}
      />
      <ModelHoverTooltip info={hoverInfo} />
      <MachineStreamTooltips
        camera={cameraExternalRef.current}
        machineObjects={objectsMapRef.current}
        containerWidth={containerSize.width}
        containerHeight={containerSize.height}
        containerEl={containerRef.current}
      />
    </>
  );
}
