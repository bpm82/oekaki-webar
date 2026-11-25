import { slot, currentWork, asset } from './slot.js';
const status = document.getElementById('status');
function tell(text) {
  if (status.textContent !== text) status.textContent = text;
}
function script(src) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script');
    element.onload = resolve;
    element.onerror = reject;
    element.src = src;
    document.head.append(element);
  });
}
function element(name, attributes) {
  const node = document.createElement(name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}
async function start() {
  if (!slot) {
    tell('番号付きのカードのQRから開いてください。');
    return;
  }
  document.getElementById('back').href = './?id=' + slot;
  const work = await currentWork();
  if (work?.state !== 'ready') {
    tell('「作品に戻る」で立体化の進み具合を確認できます。');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    tell('カメラを使えるブラウザで、このカードのURLを開いてください。');
    return;
  }
  await script('../vendor/aframe.js');
  await script('../vendor/aframe-ar.js');
  const THREE = window.AFRAME.THREE;
  const scene = element('a-scene', {
    embedded: '',
    'vr-mode-ui': 'enabled: false',
    'device-orientation-permission-ui': 'enabled: false',
    renderer: 'antialias: true; alpha: true; colorManagement: true',
    arjs: 'sourceType: webcam; detectionMode: mono; patternRatio: 0.5; debugUIEnabled: false; cameraParametersUrl: ../vendor/camera_para.dat',
  });
  const marker = element('a-marker', {
    type: 'pattern',
    url: asset('pattern.patt'),
    emitevents: 'true',
    smooth: 'true',
  });
  const model = element('a-entity', {
    'gltf-model': new URL(asset(slot + '.glb', work.source), location.href).href,
  });
  let found = false;
  let loaded = false;
  let failed = false;
  const projected = new THREE.Vector3();
  function hint() {
    if (failed) return;
    if (!loaded) tell('作品を読み込んでいます…');
    else if (!found) tell(slot + '番のカードの黒い枠を、カメラに全部入れてね。');
    else if (scene.camera) {
      // A perfectly head-on, flat square can produce a pose outside the camera frustum.
      marker.object3D.getWorldPosition(projected).project(scene.camera);
      const onScreen = [projected.x, projected.y, projected.z].every((value) => Math.abs(value) <= 1);
      tell(
        onScreen ? slot + '番の作品を表示しています。' : 'カードを少し傾けて、黒い枠全体を映してね。',
      );
    }
  }
  window.addEventListener('camera-error', () => {
    failed = true;
    tell('カメラを開けませんでした。ブラウザのカメラ利用を許可して、開き直してください。');
  });
  window.addEventListener('camera-init', hint);
  marker.addEventListener('markerFound', () => {
    found = true;
    hint();
  });
  marker.addEventListener('markerLost', () => {
    found = false;
    hint();
  });
  model.addEventListener('model-loaded', (event) => {
    const mesh = event.detail.model;
    const bounds = new THREE.Box3().setFromObject(mesh.clone());
    const center = bounds.getCenter(new THREE.Vector3()),
      size = bounds.getSize(new THREE.Vector3());
    const scale = 1.25 / Math.max(size.x, size.y, size.z, 0.001);
    model.object3D.scale.setScalar(scale);
    model.object3D.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    mesh.traverse((part) => {
      if (!part.isMesh) return;
      const materials = Array.isArray(part.material) ? part.material : [part.material];
      for (const material of materials) {
        if (material) {
          material.metalness = 0;
          material.roughness = 0.7;
        }
      }
    });
    loaded = true;
    hint();
  });
  model.addEventListener('model-error', () => {
    failed = true;
    tell('立体の読み込みに失敗しました。「作品に戻る」からもう一度開いてください。');
  });
  marker.append(model);
  scene.append(marker);
  scene.append(element('a-light', { type: 'ambient', color: '#ffffff', intensity: '1' }));
  scene.append(element('a-light', { type: 'directional', intensity: '0.65', position: '1 3 2' }));
  scene.append(element('a-entity', { camera: '' }));
  document.body.append(scene);
  window.setInterval(() => {
    if (found && loaded && !document.hidden) hint();
  }, 500);
}
start().catch(() =>
  tell('ARを読み込めませんでした。接続を確認して「作品に戻る」から開き直してください。'),
);
