// ============================================================================
// DeepTime 3D — Three.js Renderer
// ============================================================================

let scene, camera, renderer, controls;
let ground, fire, fireLight;
let citizenMeshes = [];
let hutMeshes = [];
let treeMeshes = [];

const SEASON_COLORS = {
  SPRING: { ground: 0x4a7a3a, sky: 0x6a9a5a, fog: 0x8aba6a },
  SUMMER: { ground: 0x5a8a2a, sky: 0x4a8aca, fog: 0x9aca7a },
  AUTUMN: { ground: 0x7a5a2a, sky: 0xca8a4a, fog: 0xba9a5a },
  WINTER: { ground: 0x9a9aaa, sky: 0x6a7a9a, fog: 0xaaaaBB },
};

const ACTION_COLORS = {
  HUNT: 0xf04848, GATHER: 0x4ec9b0, FISH: 0x569cd6,
  BUILD: 0xdcdcaa, REST: 0x888888, RITUAL: 0xc586c0, IDLE: 0x666666,
};

function initThree() {
  scene = new THREE.Scene();
  const colors = SEASON_COLORS.SUMMER;
  scene.background = new THREE.Color(colors.sky);
  scene.fog = new THREE.Fog(colors.fog, 30, 120);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(25, 18, 25);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('canvas3d') });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // OrbitControls
  if (typeof THREE.OrbitControls !== 'undefined') {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 10;
    controls.maxDistance = 60;
    controls.maxPolarAngle = Math.PI / 2.1;
  }

  // Lights
  const ambient = new THREE.AmbientLight(0x666666, 0.6);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 1024;
  sun.shadow.mapSize.height = 1024;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  scene.add(sun);

  // Fire light
  fireLight = new THREE.PointLight(0xff6600, 1.5, 20);
  fireLight.position.set(0, 1.5, 0);
  scene.add(fireLight);

  // Ground
  const groundGeo = new THREE.PlaneGeometry(40, 40);
  const groundMat = new THREE.MeshLambertMaterial({ color: colors.ground });
  ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Fire pit
  const pitGeo = new THREE.CircleGeometry(1.2, 16);
  const pitMat = new THREE.MeshLambertMaterial({ color: 0x2a1a0a });
  const pit = new THREE.Mesh(pitGeo, pitMat);
  pit.rotation.x = -Math.PI / 2;
  pit.position.y = 0.02;
  scene.add(pit);

  // Fire flames
  const fireGeo = new THREE.ConeGeometry(0.6, 1.5, 6);
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9 });
  fire = new THREE.Mesh(fireGeo, fireMat);
  fire.position.set(0, 0.75, 0);
  scene.add(fire);

  // Fire glow
  const glowGeo = new THREE.ConeGeometry(0.9, 2.2, 6);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.3 });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(0, 1.0, 0);
  scene.add(glow);
  fire.userData.glow = glow;

  // Trees
  createTrees();

  // Huts
  createHuts(5);

  window.addEventListener('resize', onResize);
  animate();
}

function createTrees() {
  for (const t of treeMeshes) scene.remove(t);
  treeMeshes = [];
  const rng = new RNG(42);
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2;
    const dist = 12 + rng.random() * 5;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 1.5, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3d2b1f });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 0.75, z);
    trunk.castShadow = true;
    scene.add(trunk);
    treeMeshes.push(trunk);

    // Foliage
    const folGeo = new THREE.ConeGeometry(1.2, 2.5, 6);
    const folMat = new THREE.MeshLambertMaterial({ color: 0x2a5a2a });
    const fol = new THREE.Mesh(folGeo, folMat);
    fol.position.set(x, 2.5, z);
    fol.castShadow = true;
    scene.add(fol);
    treeMeshes.push(fol);
  }
}

function createHuts(count) {
  for (const h of hutMeshes) scene.remove(h);
  hutMeshes = [];
  const rng = new RNG(100);
  for (let i = 0; i < Math.min(count, 8); i++) {
    const angle = (i / 8) * Math.PI * 2 + rng.random() * 0.3;
    const dist = 4 + rng.random() * 3;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    // Hut base
    const baseGeo = new THREE.CylinderGeometry(1, 1.2, 1, 6);
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(x, 0.5, z);
    base.castShadow = true;
    scene.add(base);
    hutMeshes.push(base);

    // Roof
    const roofGeo = new THREE.ConeGeometry(1.3, 1.2, 6);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(x, 1.6, z);
    roof.castShadow = true;
    scene.add(roof);
    hutMeshes.push(roof);
  }
}

function updateCitizens(citizens) {
  // Remove old
  for (const m of citizenMeshes) scene.remove(m);
  citizenMeshes = [];

  for (const c of citizens) {
    const x = (c.x - 0.5) * 16;
    const z = (c.z - 0.5) * 16;
    const color = ACTION_COLORS[c.action] || 0xaaaaaa;

    // Body
    const bodyGeo = new THREE.SphereGeometry(0.3, 8, 6);
    const bodyMat = new THREE.MeshLambertMaterial({ color: color, emissive: color, emissiveIntensity: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(x, 0.4, z);
    body.castShadow = true;
    scene.add(body);
    citizenMeshes.push(body);

    // Hunger indicator
    if (c.hunger > 60) {
      const ringGeo = new THREE.TorusGeometry(0.5, 0.05, 4, 12);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xf85149, transparent: true, opacity: 0.6 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(x, 0.4, z);
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
      citizenMeshes.push(ring);
    }
  }
}

function updateSeason(season) {
  const colors = SEASON_COLORS[season] || SEASON_COLORS.SUMMER;
  scene.background = new THREE.Color(colors.sky);
  scene.fog.color = new THREE.Color(colors.fog);
  ground.material.color = new THREE.Color(colors.ground);

  // Update tree colors
  for (let i = 1; i < treeMeshes.length; i += 2) {
    if (treeMeshes[i] && treeMeshes[i].material) {
      treeMeshes[i].material.color = new THREE.Color(season === 'WINTER' ? 0x3a4a3a : season === 'AUTUMN' ? 0x7a5a2a : 0x2a5a2a);
    }
  }

  // Fire intensity
  if (season === 'WINTER') {
    fire.scale.set(1.3, 1.3, 1.3);
    fireLight.intensity = 2.0;
  } else {
    fire.scale.set(1, 1, 1);
    fireLight.intensity = 1.5;
  }
}

let animTime = 0;
function animate() {
  requestAnimationFrame(animate);
  animTime += 0.05;

  // Animate fire
  if (fire) {
    fire.scale.y = 1 + Math.sin(animTime * 3) * 0.2;
    fire.rotation.y = animTime;
    if (fire.userData.glow) {
      fire.userData.glow.scale.y = 1 + Math.sin(animTime * 2) * 0.15;
      fire.userData.glow.rotation.y = -animTime * 0.7;
    }
    fireLight.intensity = 1.5 + Math.sin(animTime * 4) * 0.3;
  }

  // Animate citizens (bobbing)
  for (let i = 0; i < citizenMeshes.length; i++) {
    const m = citizenMeshes[i];
    if (m && m.geometry && m.geometry.type === 'SphereGeometry') {
      m.position.y = 0.4 + Math.sin(animTime * 2 + i) * 0.1;
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
