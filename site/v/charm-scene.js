import { asset } from './slot.js?v=2';

// Recover the pose of a unit square from its four QR corners. The diagonals
// intersect at its physical centre, so their image ratios give relative depths.
function squarePose(THREE, corners, width, height, focalLength) {
  const { topLeft: a, topRight: b, bottomRight: c, bottomLeft: d } = corners;
  const acX = c.x - a.x, acY = c.y - a.y;
  const bdX = d.x - b.x, bdY = d.y - b.y;
  const det = acX * bdY - acY * bdX;
  if (Math.abs(det) < 1) return null;
  const abX = b.x - a.x, abY = b.y - a.y;
  const alongAC = (abX * bdY - abY * bdX) / det;
  const alongBD = (abX * acY - abY * acX) / det;
  if (!(alongAC > 0 && alongAC < 1 && alongBD > 0 && alongBD < 1)) return null;

  function point(corner, depth) {
    return new THREE.Vector3(
      (corner.x - width / 2) / focalLength,
      (height / 2 - corner.y) / focalLength,
      -1,
    ).multiplyScalar(depth);
  }
  const tl = point(a, 1 - alongAC), br = point(c, alongAC);
  const right = point(b, 1 - alongBD).sub(tl), up = tl.clone().sub(point(d, alongBD));
  const scale = 2 / (right.length() + up.length());
  const position = tl.add(br).multiplyScalar(scale / 2);
  const normal = new THREE.Vector3().crossVectors(right, up).normalize();
  right.normalize();
  up.crossVectors(normal, right);
  const basis = new THREE.Matrix4().makeBasis(right, up, normal);
  return { position, rotation: new THREE.Quaternion().setFromRotationMatrix(basis) };
}

function prepareModel(THREE, mesh) {
  const model = new THREE.Group();
  model.add(mesh);
  // The illustrated front is -Z in TripoSR. Here +Z faces the reader.
  model.rotation.y = Math.PI;
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  // The printed black frame is 82 modules across, with a 33-module QR inside.
  const scale = (1.25 * 82 / 33) / Math.max(size.x, size.y, size.z, 0.001);
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale, -bounds.min.z * scale);
  mesh.traverse((part) => {
    if (!part.isMesh) return;
    for (const material of [].concat(part.material)) {
      if (!material) continue;
      material.metalness = 0;
      material.roughness = 0.7;
    }
  });
  return model;
}

function disposeModel(model) {
  const resources = new Set();
  model?.traverse((part) => {
    if (!part.isMesh) return;
    resources.add(part.geometry);
    for (const material of [].concat(part.material)) {
      if (!material) continue;
      resources.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) resources.add(value);
      }
    }
  });
  for (const resource of resources) resource.dispose();
}

export function charmScene(THREE, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
  scene.add(new THREE.AmbientLight(0xffffff, 1));
  const light = new THREE.DirectionalLight(0xffffff, 0.65);
  light.position.set(1, 2, 3);
  scene.add(light);
  const loader = new THREE.GLTFLoader();
  const works = new Map();
  let renderWidth = 0, renderHeight = 0;

  function removeWork(id, work) {
    for (const anchor of work.anchors) scene.remove(anchor);
    disposeModel(work.model);
    works.delete(id);
  }

  function loadModel(id, work) {
    work.state = 'loading';
    loader.load(work.url, ({ scene: mesh }) => {
      if (works.get(id) !== work) {
        disposeModel(mesh);
        return;
      }
      work.model = prepareModel(THREE, mesh);
      for (const anchor of work.anchors) anchor.add(work.model.clone());
      work.state = 'ready';
    }, undefined, () => {
      work.state = 'error';
      work.retryAt = performance.now() + 15000;
    });
  }

  function update(cards, catalog, width, height) {
    const now = performance.now();
    if (canvas.clientWidth !== renderWidth || canvas.clientHeight !== renderHeight) {
      renderWidth = canvas.clientWidth;
      renderHeight = canvas.clientHeight;
      renderer.setSize(renderWidth, renderHeight, false);
      camera.aspect = renderWidth / renderHeight;
      camera.updateProjectionMatrix();
    }
    const focal = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const copies = new Map();
    // Prune replaced/withdrawn models too, including an in-flight older GLB.
    for (const [id, work] of works) {
      const entry = catalog[id];
      if (entry?.state !== 'ready' || (entry.modelVersion || entry.source) !== work.version) {
        removeWork(id, work);
      }
    }
    for (const { id, position } of cards) {
      const entry = catalog[id];
      if (entry?.state !== 'ready') continue;
      const pose = squarePose(THREE, position, width, height, focal);
      if (!pose) continue;

      let work = works.get(id);
      if (!work) {
        const version = entry.modelVersion || entry.source;
        work = { version, url: asset(id + '.glb', version, id), anchors: [] };
        works.set(id, work);
        loadModel(id, work);
      } else if (work.state === 'error' && now >= work.retryAt) {
        loadModel(id, work);
      }
      work.lastSeen = now;
      const index = copies.get(id) || 0;
      copies.set(id, index + 1);
      let anchor = work.anchors[index];
      if (!anchor) {
        anchor = new THREE.Group();
        anchor.visible = false;
        work.anchors.push(anchor);
        scene.add(anchor);
        if (work.model) anchor.add(work.model.clone());
      }
      if (anchor.visible && now - anchor.userData.lastSeen < 200) {
        anchor.position.lerp(pose.position, 0.75);
        anchor.quaternion.slerp(pose.rotation, 0.55);
      } else {
        anchor.position.copy(pose.position);
        anchor.quaternion.copy(pose.rotation);
      }
      anchor.userData.lastSeen = now;
      anchor.visible = true;
    }
    const result = { ready: [], loading: [], error: [] };
    for (const [id, work] of works) {
      // Check expiry after this frame's sightings so returning from a suspended
      // tab or a slow frame does not discard a model that is still in view.
      if (now - work.lastSeen > 20000) {
        removeWork(id, work);
        continue;
      }
      for (const anchor of work.anchors) {
        anchor.visible = now - anchor.userData.lastSeen < 200;
        if (anchor.visible) result[work.state].push(id);
      }
    }
    renderer.render(scene, camera);
    return result;
  }

  return {
    update,
    dispose() {
      for (const [id, work] of works) removeWork(id, work);
      renderer.dispose();
    },
  };
}
