// ============================================================================
// DeepTime 3D — Global Map (2D Canvas, 360×180 hexes per T-004)
// ============================================================================

let viewMode = 'settlement'; // 'global' | 'local' | 'settlement'
let globalCanvas, globalCtx;
let localCanvas, localCtx;

// World map data — simplified biomes per hex (q, r)
// In real game: generated from SRTM/SoilGrids (T-004). Here: procedural.
let worldMap = null;

// Player position on global map
let playerHex = { q: 180, r: 90 }; // center of map (equator, prime meridian)

// AI civilizations on global map
let aiCivs = [];

function initGlobalMap(seed) {
  const rng = new RNG(seed || 42);

  // Generate biome map — simplified
  // 360×180 = 64800 hexes. We generate lazily by formula, not store all.
  // Biome determined by latitude (r) + noise
  worldMap = {
    seed: seed || 42,
    getBiome: function(q, r) {
      const lat = 90 - r; // -90..90
      const absLat = Math.abs(lat);

      // Ocean (30% of surface)
      const noise = (Math.sin(q * 0.1 + seed) * Math.cos(r * 0.15) + 1) / 2;
      if (noise < 0.25) return 'ocean';
      if (noise < 0.30 && absLat < 60) return 'coast';

      // By latitude
      if (absLat > 75) return 'tundra';
      if (absLat > 65) return 'taiga';
      if (absLat > 50) return noise > 0.6 ? 'forest' : 'grassland';
      if (absLat > 30) return noise > 0.55 ? 'forest' : (noise < 0.35 ? 'desert' : 'grassland');
      if (absLat > 15) return noise > 0.5 ? 'jungle' : 'savanna';
      return 'jungle';
    },
    getColor: function(biome) {
      const colors = {
        ocean: '#1a3a5a',
        coast: '#3a5a7a',
        tundra: '#9a9aaa',
        taiga: '#3a5a3a',
        forest: '#2a6a2a',
        grassland: '#7a8a3a',
        savanna: '#9a8a3a',
        desert: '#caaa5a',
        jungle: '#1a5a1a',
      };
      return colors[biome] || '#444';
    },
  };

  // Generate AI civs (5-10 neighbors)
  aiCivs = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const dist = 5 + rng.random() * 15;
    aiCivs.push({
      q: Math.round(playerHex.q + Math.cos(angle) * dist),
      r: Math.round(playerHex.r + Math.sin(angle) * dist),
      name: ['Аскал','Торгейм','Вестмарк','Скайгард','Острхольм','Норрвиг','Сандвик','Фростхольм'][i],
      population: rng.randint(30, 100),
      relation: rng.randint(-20, 30),
    });
  }
}

function drawGlobalMap() {
  if (!globalCanvas) return;
  const ctx = globalCtx;
  const w = globalCanvas.width;
  const h = globalCanvas.height;

  // Background (ocean)
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, w, h);

  // Hex size — fit 360 columns
  const hexW = w / 360;
  const hexH = hexW * 0.866; // flat-top hex ratio
  const offsetY = hexH * 0.5;

  // Draw hexes — only visible ones (viewport culling)
  for (let r = 0; r < 180; r++) {
    for (let q = 0; q < 360; q++) {
      const x = q * hexW;
      const y = r * hexH + (q % 2) * offsetY;

      // Viewport cull
      if (x < -hexW || x > w + hexW || y < -hexH || y > h + hexH) continue;

      const biome = worldMap.getBiome(q, r);
      ctx.fillStyle = worldMap.getColor(biome);
      ctx.fillRect(x, y, hexW, hexH);
    }
  }

  // Draw player settlement marker
  const px = playerHex.q * hexW;
  const py = playerHex.r * hexH + (playerHex.q % 2) * offsetY;
  ctx.fillStyle = '#f5a623';
  ctx.beginPath();
  ctx.arc(px + hexW/2, py + hexH/2, Math.max(3, hexW * 1.5), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw AI civs
  for (const civ of aiCivs) {
    if (civ.q < 0 || civ.q >= 360 || civ.r < 0 || civ.r >= 180) continue;
    const cx = civ.q * hexW;
    const cy = civ.r * hexH + (civ.q % 2) * offsetY;
    const color = civ.relation > 0 ? '#4ec9b0' : '#f85149';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx + hexW/2, cy + hexH/2, Math.max(2, hexW), 0, Math.PI * 2);
    ctx.fill();

    // Name label (if hex big enough)
    if (hexW > 4) {
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(6, hexW * 0.8)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(civ.name, cx + hexW/2, cy + hexH/2 + hexW * 2);
    }
  }

  // UI overlay
  ctx.fillStyle = 'rgba(13,17,23,0.8)';
  ctx.fillRect(0, 0, w, 30);
  ctx.fillStyle = '#f5a623';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🌍 Глобальная карта — 10 000 до н.э.', 10, 20);
  ctx.textAlign = 'right';
  ctx.fillText(`Ваше племя: гекс (${playerHex.q}, ${playerHex.r}) — кликните для зума`, w - 10, 20);
}

function drawLocalMap() {
  if (!localCanvas) return;
  const ctx = localCtx;
  const w = localCanvas.width;
  const h = localCanvas.height;

  // 25×25 grid
  const cellW = w / 25;
  const cellH = h / 25;

  // Background
  ctx.fillStyle = '#1a2a1a';
  ctx.fillRect(0, 0, w, h);

  // Draw terrain (simplified from global biome)
  const biome = worldMap.getBiome(playerHex.q, playerHex.r);

  // Draw grid cells with terrain features
  const rng = new RNG(playerHex.q * 1000 + playerHex.r);
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 25; x++) {
      const noise = rng.random();
      let color = worldMap.getColor(biome);

      // Add variation
      if (noise < 0.05) color = '#3a5a7a'; // water
      else if (noise < 0.10) color = '#5a4a2a'; // rock
      else if (noise > 0.95) color = '#4a6a3a'; // dense forest

      ctx.fillStyle = color;
      ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.strokeRect(x * cellW, y * cellH, cellW, cellH);
    }
  }

  // Draw settlement (center)
  const sx = 12 * cellW;
  const sy = 12 * cellH;
  ctx.fillStyle = '#f5a623';
  ctx.beginPath();
  ctx.arc(sx + cellW/2, sy + cellH/2, cellW * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Label
  ctx.fillStyle = '#fff';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏠 Стойбище', sx + cellW/2, sy - 5);

  // POI markers
  const pois = [
    { x: 4, y: 4, label: '🌲 Лес' },
    { x: 20, y: 5, label: '🏞️ Река' },
    { x: 3, y: 20, label: '🍓 Ягоды' },
    { x: 21, y: 18, label: '⛏️ Камень' },
  ];
  for (const poi of pois) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(poi.x * cellW + cellW/2, poi.y * cellH + cellH/2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ccc';
    ctx.font = '9px sans-serif';
    ctx.fillText(poi.label, poi.x * cellW + cellW/2, poi.y * cellH - 2);
  }

  // UI overlay
  ctx.fillStyle = 'rgba(13,17,23,0.8)';
  ctx.fillRect(0, 0, w, 30);
  ctx.fillStyle = '#f5a623';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`📍 Локальная карта — гекс (${playerHex.q}, ${playerHex.r}) — биом: ${biome}`, 10, 20);
  ctx.textAlign = 'right';
  ctx.fillText('Кликните на поселение для 3D вида', w - 10, 20);
}

function switchView(mode) {
  viewMode = mode;

  // Hide/show canvases
  const canvas3d = document.getElementById('canvas3d');
  const globalDiv = document.getElementById('globalMapDiv');
  const localDiv = document.getElementById('localMapDiv');

  if (mode === 'global') {
    canvas3d.style.display = 'none';
    globalDiv.style.display = 'block';
    localDiv.style.display = 'none';
    document.querySelectorAll('.overlay').forEach(el => el.style.display = 'none');
    document.getElementById('globalControls').style.display = 'flex';
    drawGlobalMap();
  } else if (mode === 'local') {
    canvas3d.style.display = 'none';
    globalDiv.style.display = 'none';
    localDiv.style.display = 'block';
    document.querySelectorAll('.overlay').forEach(el => el.style.display = 'none');
    document.getElementById('globalControls').style.display = 'flex';
    drawLocalMap();
  } else { // settlement
    canvas3d.style.display = 'block';
    globalDiv.style.display = 'none';
    localDiv.style.display = 'none';
    document.querySelectorAll('.overlay').forEach(el => el.style.display = '');
    document.getElementById('globalControls').style.display = 'none';
    onResize(); // recalculate 3D canvas size
  }
}

function initMapCanvases() {
  // Global map canvas
  globalCanvas = document.getElementById('globalMapCanvas');
  globalCtx = globalCanvas.getContext('2d');
  globalCanvas.width = window.innerWidth;
  globalCanvas.height = window.innerHeight;

  globalCanvas.addEventListener('click', function(e) {
    const rect = globalCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hexW = globalCanvas.width / 360;
    const hexH = hexW * 0.866;
    const q = Math.floor(x / hexW);
    const r = Math.floor(y / hexH);
    if (q >= 0 && q < 360 && r >= 0 && r < 180) {
      playerHex = { q, r };
      // Check if clicked on player's hex → go to local
      const isPlayer = (q === 180 && r === 90);
      if (isPlayer) {
        switchView('local');
      } else {
        // Click on other hex → show info
        const biome = worldMap.getBiome(q, r);
        // Check if AI civ
        const civ = aiCivs.find(c => c.q === q && c.r === r);
        if (civ) {
          alert(`${civ.name}\nНаселение: ${civ.population}\nОтношение: ${civ.relation}\nБиом: ${biome}`);
        } else {
          alert(`Гекс (${q}, ${r})\nБиом: ${biome}\nПустая территория`);
        }
      }
    }
  });

  // Local map canvas
  localCanvas = document.getElementById('localMapCanvas');
  localCtx = localCanvas.getContext('2d');
  localCanvas.width = window.innerWidth;
  localCanvas.height = window.innerHeight;

  localCanvas.addEventListener('click', function(e) {
    const rect = localCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cellW = localCanvas.width / 25;
    const cellH = localCanvas.height / 25;
    const cx = Math.floor(x / cellW);
    const cy = Math.floor(y / cellH);
    // Click on center (settlement) → go to 3D
    if (cx === 12 && cy === 12) {
      switchView('settlement');
    }
  });

  // Init world map
  initGlobalMap(42);

  // Resize handler
  window.addEventListener('resize', function() {
    if (globalCanvas) {
      globalCanvas.width = window.innerWidth;
      globalCanvas.height = window.innerHeight;
      if (viewMode === 'global') drawGlobalMap();
    }
    if (localCanvas) {
      localCanvas.width = window.innerWidth;
      localCanvas.height = window.innerHeight;
      if (viewMode === 'local') drawLocalMap();
    }
  });
}
