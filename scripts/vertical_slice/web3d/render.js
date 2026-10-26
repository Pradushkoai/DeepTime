// ============================================================================
// DeepTime 3D — Three.js Real-Time Renderer v2.0
// ============================================================================

let scene, camera, renderer, controls;
let ground, fire, fireLight, fireGlow;
let citizenMeshes = [];
let animalMeshes = [];
let hutGroup, treeGroup;
let poiLabels = [];
let particleSystems = [];
let lastTime = performance.now();

const SEASON_COLORS = {
  SPRING: { ground:0x4a7a3a, sky:0x6a9a5a, fog:0x8aba6a, tree:0x2a6a2a },
  SUMMER: { ground:0x5a8a2a, sky:0x4a8aca, fog:0x9aca7a, tree:0x2a5a1a },
  AUTUMN: { ground:0x7a5a2a, sky:0xca8a4a, fog:0xba9a5a, tree:0x8a5a2a },
  WINTER: { ground:0x9a9aaa, sky:0x6a7a9a, fog:0xaaaaBB, tree:0x3a4a3a },
};

const ACTION_COLORS = {
  HUNT:0xf04848, GATHER:0x4ec9b0, FISH:0x569cd6,
  BUILD:0xdcdcaa, REST:0x888888, RITUAL:0xc586c0, IDLE:0x666666,
  EAT:0xffaa00, CARRY:0xff8800,
};

const POI_DATA = [
  { x:0, z:0, type:'fire', label:'🔥', color:0xff6600 },
  { x:-10, z:-8, type:'forest', label:'🌲', color:0x2a5a2a },
  { x:10, z:-6, type:'river', label:'🏞️', color:0x4488cc },
  { x:-8, z:8, type:'gather', label:'🍓', color:0x88aa44 },
  { x:4, z:6, type:'build', label:'🏗️', color:0x886644 },
  { x:6, z:-4, type:'huts', label:'🏠', color:0x664433 },
  { x:-4, z:4, type:'storage', label:'📦', color:0x665544 },
];

function initThree() {
  scene = new THREE.Scene();
  const c = SEASON_COLORS.SUMMER;
  scene.background = new THREE.Color(c.sky);
  scene.fog = new THREE.Fog(c.fog, 25, 100);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 200);
  camera.position.set(18, 14, 18);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias:true, canvas:document.getElementById('canvas3d') });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  if (typeof THREE.OrbitControls !== 'undefined') {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 8;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.target.set(0, 0, 0);
  }

  // Lights
  scene.add(new THREE.AmbientLight(0x666677, 0.5));
  const sun = new THREE.DirectionalLight(0xffeedd, 0.8);
  sun.position.set(15, 25, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);

  fireLight = new THREE.PointLight(0xff6600, 2, 18);
  fireLight.position.set(0, 1.5, 0);
  scene.add(fireLight);

  // Ground
  const gGeo = new THREE.PlaneGeometry(40, 40, 20, 20);
  const gMat = new THREE.MeshLambertMaterial({ color:c.ground });
  ground = new THREE.Mesh(gGeo, gMat);
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Fire pit
  const pitGeo = new THREE.CircleGeometry(1.2, 16);
  const pitMat = new THREE.MeshLambertMaterial({ color:0x2a1a0a });
  const pit = new THREE.Mesh(pitGeo, pitMat);
  pit.rotation.x = -Math.PI/2;
  pit.position.y = 0.02;
  scene.add(pit);

  // Fire
  const fGeo = new THREE.ConeGeometry(0.5, 1.5, 6);
  const fMat = new THREE.MeshBasicMaterial({ color:0xff6600, transparent:true, opacity:0.9 });
  fire = new THREE.Mesh(fGeo, fMat);
  fire.position.set(0, 0.75, 0);
  scene.add(fire);

  const fgGeo = new THREE.ConeGeometry(0.8, 2.2, 6);
  const fgMat = new THREE.MeshBasicMaterial({ color:0xffaa00, transparent:true, opacity:0.25 });
  fireGlow = new THREE.Mesh(fgGeo, fgMat);
  fireGlow.position.set(0, 1.0, 0);
  scene.add(fireGlow);

  // Create POI markers
  createPOIMarkers();

  // Trees & huts
  treeGroup = new THREE.Group();
  scene.add(treeGroup);
  createTrees();

  hutGroup = new THREE.Group();
  scene.add(hutGroup);
  createHuts(5);

  window.addEventListener('resize', onResize);
  animate();
}

function createPOIMarkers() {
  for (const poi of POI_DATA) {
    if (poi.type === 'fire') continue; // fire is already there

    // Marker: small colored circle on ground
    const mGeo = new THREE.RingGeometry(1.0, 1.3, 16);
    const mMat = new THREE.MeshBasicMaterial({ color:poi.color, transparent:true, opacity:0.4, side:THREE.DoubleSide });
    const marker = new THREE.Mesh(mGeo, mMat);
    marker.rotation.x = -Math.PI/2;
    marker.position.set(poi.x, 0.05, poi.z);
    scene.add(marker);

    // Label sprite
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '40px serif';
    ctx.textAlign = 'center';
    ctx.fillText(poi.label, 64, 45);
    const tex = new THREE.CanvasTexture(canvas);
    const sprMat = new THREE.SpriteMaterial({ map:tex, transparent:true });
    const spr = new THREE.Sprite(sprMat);
    spr.position.set(poi.x, 3, poi.z);
    spr.scale.set(2, 1, 1);
    scene.add(spr);
    poiLabels.push(spr);
  }
}

function createTrees() {
  while (treeGroup.children.length > 0) treeGroup.remove(treeGroup.children[0]);
  const rng = new RNG(42);
  for (let i = 0; i < 20; i++) {
    const angle = (i/20) * Math.PI * 2;
    const dist = 13 + rng.random() * 5;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    const tGeo = new THREE.CylinderGeometry(0.2, 0.3, 1.5, 6);
    const tMat = new THREE.MeshLambertMaterial({ color:0x3d2b1f });
    const trunk = new THREE.Mesh(tGeo, tMat);
    trunk.position.set(x, 0.75, z);
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const fGeo = new THREE.ConeGeometry(1.2, 2.5, 6);
    const fMat = new THREE.MeshLambertMaterial({ color:0x2a5a2a });
    const fol = new THREE.Mesh(fGeo, fMat);
    fol.position.set(x, 2.5, z);
    fol.castShadow = true;
    treeGroup.add(fol);
  }
}

function createHuts(count) {
  while (hutGroup.children.length > 0) hutGroup.remove(hutGroup.children[0]);
  const rng = new RNG(100);
  for (let i = 0; i < Math.min(count, 8); i++) {
    const angle = (i/8) * Math.PI * 2 + rng.random() * 0.3;
    const dist = 4 + rng.random() * 3;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    const bGeo = new THREE.CylinderGeometry(1, 1.2, 1, 6);
    const bMat = new THREE.MeshLambertMaterial({ color:0x5a4a3a });
    const base = new THREE.Mesh(bGeo, bMat);
    base.position.set(x, 0.5, z);
    base.castShadow = true;
    hutGroup.add(base);

    const rGeo = new THREE.ConeGeometry(1.3, 1.2, 6);
    const rMat = new THREE.MeshLambertMaterial({ color:0x4a3a2a });
    const roof = new THREE.Mesh(rGeo, rMat);
    roof.position.set(x, 1.6, z);
    roof.castShadow = true;
    hutGroup.add(roof);
  }
}

function updateCitizens(citizens, animals) {
  // Remove old citizens
  for (const m of citizenMeshes) scene.remove(m);
  citizenMeshes = [];

  for (const c of citizens) {
    const color = ACTION_COLORS[c.action] || 0xaaaaaa;

    // Body
    const bGeo = new THREE.SphereGeometry(0.25, 8, 6);
    const bMat = new THREE.MeshLambertMaterial({ color, emissive:color, emissiveIntensity:0.3 });
    const body = new THREE.Mesh(bGeo, bMat);
    body.position.set(c.x, 0.35, c.z);
    body.castShadow = true;
    scene.add(body);
    citizenMeshes.push(body);

    // Carrying indicator
    if (c.carrying) {
      const carGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      const carMat = new THREE.MeshBasicMaterial({ color:0xffaa00 });
      const car = new THREE.Mesh(carGeo, carMat);
      car.position.set(c.x, 0.7, c.z);
      scene.add(car);
      citizenMeshes.push(car);
    }

    // Hunger ring
    if (c.hunger > 60) {
      const rGeo = new THREE.TorusGeometry(0.45, 0.04, 4, 12);
      const rMat = new THREE.MeshBasicMaterial({ color:0xf85149, transparent:true, opacity:0.5 });
      const ring = new THREE.Mesh(rGeo, rMat);
      ring.position.set(c.x, 0.35, c.z);
      ring.rotation.x = Math.PI/2;
      scene.add(ring);
      citizenMeshes.push(ring);
    }
  }

  // Remove old animals
  for (const m of animalMeshes) scene.remove(m);
  animalMeshes = [];

  if (animals) {
    for (const a of animals) {
      // Deer body (elongated sphere)
      const dGeo = new THREE.SphereGeometry(0.35, 6, 5);
      dGeo.scale(1.4, 0.8, 0.8);
      const dMat = new THREE.MeshLambertMaterial({ color: 0x8a5a3a });
      const deer = new THREE.Mesh(dGeo, dMat);
      deer.position.set(a.x, 0.4, a.z);
      deer.castShadow = true;
      scene.add(deer);
      animalMeshes.push(deer);

      // Deer head (small sphere)
      const hGeo = new THREE.SphereGeometry(0.2, 6, 5);
      const hMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
      const head = new THREE.Mesh(hGeo, hMat);
      head.position.set(a.x + 0.4, 0.55, a.z);
      scene.add(head);
      animalMeshes.push(head);

      // Antlers (small cones)
      const aGeo = new THREE.ConeGeometry(0.08, 0.4, 4);
      const aMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
      const ant1 = new THREE.Mesh(aGeo, aMat);
      ant1.position.set(a.x + 0.4, 0.8, a.z + 0.12);
      scene.add(ant1);
      animalMeshes.push(ant1);
      const ant2 = new THREE.Mesh(aGeo, aMat);
      ant2.position.set(a.x + 0.4, 0.8, a.z - 0.12);
      scene.add(ant2);
      animalMeshes.push(ant2);
    }
  }
}

function updateSeason(season) {
  const c = SEASON_COLORS[season] || SEASON_COLORS.SUMMER;
  scene.background = new THREE.Color(c.sky);
  scene.fog.color = new THREE.Color(c.fog);
  ground.material.color = new THREE.Color(c.ground);

  for (const child of treeGroup.children) {
    if (child.geometry && child.geometry.type === 'ConeGeometry') {
      child.material.color = new THREE.Color(c.tree);
    }
  }

  if (season === 'WINTER') {
    fire.scale.set(1.3, 1.3, 1.3);
    fireLight.intensity = 2.5;
  } else {
    fire.scale.set(1, 1, 1);
    fireLight.intensity = 2.0;
  }
}

let animTime = 0;
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // Update simulation
  if (WORLD) {
    updateRealTime(WORLD, dt);
    // Update UI every ~200ms
    if (Math.floor(animTime * 5) !== Math.floor((animTime + dt) * 5)) {
      updateUI();
    }
    // Update 3D positions every frame
    const s = getState(WORLD);
    updateSeason(s.season);
    updateCitizens(s.citizens, s.animals);
  }

  animTime += dt;

  // Animate fire
  if (fire) {
    fire.scale.y = 1 + Math.sin(animTime * 4) * 0.2;
    fire.rotation.y = animTime * 2;
    fireGlow.scale.y = 1 + Math.sin(animTime * 3) * 0.15;
    fireGlow.rotation.y = -animTime * 1.5;
    fireLight.intensity = 2.0 + Math.sin(animTime * 5) * 0.4;
  }

  // Bobbing citizens
  for (let i = 0; i < citizenMeshes.length; i++) {
    const m = citizenMeshes[i];
    if (m && m.geometry && m.geometry.type === 'SphereGeometry') {
      m.position.y = 0.35 + Math.sin(animTime * 3 + i * 0.5) * 0.08;
    }
  }

  if (controls) controls.update();
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
