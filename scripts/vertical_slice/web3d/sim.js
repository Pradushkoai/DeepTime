// ============================================================================
// DeepTime 3D — Real-Time Simulation Engine v2.0
// ============================================================================

const SEASONS = ['SPRING','SUMMER','AUTUMN','WINTER'];

const ARCHETYPES = {
  FOREST:       { hunt:0.40, gather:0.40, fish:0.20, skills:{hunt:[20,45],gather:[25,50],fish:[15,30],build:[15,30]} },
  STEPPE:       { hunt:0.70, gather:0.20, fish:0.10, skills:{hunt:[40,65],gather:[15,30],fish:[10,20],build:[10,25]} },
  RIVER_VALLEY: { hunt:0.25, gather:0.30, fish:0.45, skills:{hunt:[15,30],gather:[25,45],fish:[40,65],build:[15,30]} },
  COASTAL:      { hunt:0.20, gather:0.20, fish:0.60, skills:{hunt:[15,30],gather:[15,30],fish:[50,70],build:[15,30]} },
  MOUNTAIN:     { hunt:0.60, gather:0.30, fish:0.10, skills:{hunt:[35,60],gather:[20,35],fish:[10,20],build:[20,35]} },
  DESERT:       { hunt:0.30, gather:0.50, fish:0.20, skills:{hunt:[25,45],gather:[30,50],fish:[15,25],build:[15,30]} },
  TROPICAL:     { hunt:0.20, gather:0.60, fish:0.20, skills:{hunt:[15,30],gather:[40,65],fish:[25,45],build:[15,30]} },
  ARCTIC:       { hunt:0.80, gather:0.05, fish:0.15, skills:{hunt:[45,70],gather:[10,20],fish:[25,45],build:[15,30]} },
};

const NAMES_M = ['Борис','Карл','Олаф','Сигурд','Эрик','Хрольв','Гуннар','Торстен','Свен','Рагнар','Ивар','Бьорн','Ульф','Кнуд','Хакон'];
const NAMES_F = ['Анна','Хельга','Фрейя','Сигрид','Тора','Ингрид','Астрид','Рагнхильд','Гудрун','Сольвейг','Брунхильда','Торгунна','Эльза','Карин'];

// Technology catalog — STRICTLY from tech_tree.md (T-001..T-030)
// Start: T-001, T-002, T-004, T-005 (палеолит, стартовые)
// Researchable: T-007, T-010, T-015, T-020, T-030
const TECH_CATALOG = {
  1:  { name:'T-001 Контроль огня',         desc:'Огонь готовит еду и греет',              start:true,  cost:0,   cat:'start' },
  2:  { name:'T-002 Приготовление пищи',     desc:'Варка на огне, +питательность',          start:true,  cost:0,   cat:'start' },
  4:  { name:'T-004 Оббивка камня',          desc:'Кремнёвые орудия — ножи, скребки',      start:true,  cost:0,   cat:'start' },
  5:  { name:'T-005 Изготовление лука',      desc:'Лук и стрелы — ×2 эффективность охоты', start:true,  cost:0,   cat:'start' },
  7:  { name:'T-007 Приручение собаки',      desc:'Собака — охота, охрана, тягло',          start:false, cost:60,  cat:'hunt',   req:[5] },
  10: { name:'T-010 Керамика',               desc:'Гончарное дело — хранение, варка',       start:false, cost:120, cat:'build',  req:[1,2] },
  15: { name:'T-015 Земледелие',             desc:'Посев злаков — переход к осёдлости',     start:false, cost:200, cat:'build',  req:[2,4] },
  20: { name:'T-020 Деревообработка',        desc:'Пила, рубанок — доски, мебель',          start:false, cost:150, cat:'build',  req:[4,6] },
  30: { name:'T-030 Скотоводство',           desc:'Домашние животные — молоко, мясо',       start:false, cost:180, cat:'hunt',   req:[7] },
};
// T-006 (составные орудия) is auto-unlocked after T-005 (prerequisite for T-020)
// So T-006 is not a separate research target but a gate

// Points of interest in settlement (x, z coordinates in world space)
const POI = {
  fire:     { x: 0,    z: 0,    type: 'fire',    label: '🔥 Костёр' },
  forest:   { x: -10,  z: -8,   type: 'forest',  label: '🌲 Лес' },
  river:    { x: 10,   z: -6,   type: 'river',   label: '🏞️ Река' },
  gather:   { x: -8,   z: 8,    type: 'gather',  label: '🍓 Ягоды' },
  build:    { x: 4,    z: 6,    type: 'build',   label: '🏗️ Стройка' },
  huts:     { x: 6,    z: -4,   type: 'huts',    label: '🏠 Хижины' },
  storage:  { x: -4,   z: 4,    type: 'storage', label: '📦 Склад' },
};

class RNG {
  constructor(seed) { this.s = seed || 1; }
  next() { this.s = (this.s * 9301 + 49297) % 233280; return this.s / 233280; }
  randint(a,b) { return Math.floor(this.next()*(b-a+1))+a; }
  choice(arr) { return arr[Math.floor(this.next()*arr.length)]; }
  random() { return this.next(); }
}

let WORLD = null;

function initWorld(archetype='FOREST', population=50, seed=42) {
  const rng = new RNG(seed);
  const arch = ARCHETYPES[archetype];

  const world = {
    turn: 0, year: -10000, season: 'SUMMER', seed, rng, archetype,
    citizens: [], factions: [], chief: null,
    settlement: { name:'Стойбище у Реки', meat:50, berries:60, fish:30, wood:40, stone:20, huts:5 },
    pendingEvents: [], resolvedEvents: [], chronicle: [],
    priorities: { food:40, stockpile:30, build:10, army:5, trade:5 },
    techs: new Set([1,2,4,5]), // T-001, T-002, T-004, T-005 (стартовые из tech_tree.md)
    techProgress: { 6:0, 7:0, 10:0, 15:0, 20:0, 30:0 }, // T-006, T-007, T-010, T-015, T-020, T-030
    techUnlocked: { 6:false }, // T-006 auto-unlocks when T-005 is known (gate for T-020)
    techNotifications: [], // [{id, name, desc}] for UI popup
    metrics: { totalEvents:0, totalDecisions:0, wintersSurvived:0, maxPressure:0, turnsPlayed:0, techsUnlocked:0 },
    nextEventId: 1,
    // Real-time state
    seasonProgress: 0, // 0..1, fills up, when 1 → season change
    seasonDuration: 20.0, // seconds per season (real-time)
    paused: false,
    speed: 1, // 1x, 2x, 3x
    simTime: 0, // accumulated real time
  };

  const chiefName = rng.choice(NAMES_M);
  const chiefSkills = genSkills(rng, arch);
  world.chief = { name:chiefName, age:rng.randint(25,35), era:'YOUNG', health:100, legitimacy:80, pressure:0, heirId:-1, reforms:[] };

  world.citizens.push(createCitizen(0, chiefName, 'M', world.chief.age, rng, arch, true));
  for (let i = 1; i < population; i++) {
    const gender = rng.random() < 0.5 ? 'M' : 'F';
    const age = rng.randint(0, 70);
    const name = gender === 'M' ? rng.choice(NAMES_M) : rng.choice(NAMES_F);
    world.citizens.push(createCitizen(i, name, gender, age, rng, arch, false));
  }

  world.factions = [
    { type:'HUNTERS', name:'Охотники', power:40, grievance:0, grievanceReason:'' },
    { type:'PRIESTS', name:'Жречество', power:25, grievance:0, grievanceReason:'' },
    { type:'ELDERS', name:'Старейшины', power:35, grievance:0, grievanceReason:'' },
  ];

  // Animals (deer) that wander around the map
  world.animals = [];
  for (let i = 0; i < 8; i++) {
    world.animals.push({
      id: i, type: 'deer', alive: true,
      x: -8 + rng.random() * 16,
      z: -8 + rng.random() * 16,
      vx: (rng.random() - 0.5) * 0.5,
      vz: (rng.random() - 0.5) * 0.5,
      wanderTimer: rng.random() * 3,
    });
  }

  return world;
}

function createCitizen(id, name, gender, age, rng, arch, isChief) {
  const sk = genSkills(rng, arch);
  // Start position near fire
  const angle = rng.random() * Math.PI * 2;
  const dist = 1 + rng.random() * 3;
  return {
    id, name, gender, age, alive: true,
    huntSkill: isChief ? Math.min(100, sk.hunt + 20) : sk.hunt,
    gatherSkill: sk.gather, fishSkill: sk.fish, buildSkill: sk.build,
    hunger: 0, fatigue: 0, loyalty: 70 + rng.randint(0, 20),
    action: 'IDLE', actionReason: '',
    // Position and movement
    x: POI.fire.x + Math.cos(angle) * dist,
    z: POI.fire.z + Math.sin(angle) * dist,
    targetX: POI.fire.x, targetZ: POI.fire.z,
    speed: 2.0 + rng.random() * 1.0, // units per second
    workTimer: 0, // seconds at current task
    carrying: null, // {type:'meat', amount:1} when carrying resources
    deathCause: '',
  };
}

function genSkills(rng, arch) {
  const s = arch.skills;
  return { hunt:rng.randint(s.hunt[0],s.hunt[1]), gather:rng.randint(s.gather[0],s.gather[1]),
           fish:rng.randint(s.fish[0],s.fish[1]), build:rng.randint(s.build[0],s.build[1]) };
}

function addTechProgress(w, techId, amount) {
  if (w.techUnlocked[techId]) return; // already unlocked
  if (!w.techProgress[techId]) w.techProgress[techId] = 0;

  // Check prerequisites (from tech_tree.md)
  const tech = TECH_CATALOG[techId];
  if (tech && tech.req) {
    for (const reqId of tech.req) {
      if (!w.techs.has(reqId) && !w.techUnlocked[reqId]) return; // prerequisites not met
    }
  }

  w.techProgress[techId] += amount;
  if (w.techProgress[techId] >= tech.cost) {
    w.techUnlocked[techId] = true;
    w.techs.add(techId); // add to known techs (for prerequisite checks)
    w.metrics.techsUnlocked++;
    w.techNotifications.push({ id: techId, name: tech.name, desc: tech.desc });
    w.chronicle.push({ year: w.year, season: w.season, entry: `🔓 Открыто: ${tech.name} — ${tech.desc}` });

    // Auto-unlock T-006 (составные орудия) when T-005 is known (per tech_tree.md)
    if (techId === 5 && !w.techUnlocked[6]) {
      w.techUnlocked[6] = true;
      w.techs.add(6);
      w.techProgress[6] = 100;
    }
  }
}

// Get technology bonus multiplier (from tech_tree.md)
function getTechBonus(w, category) {
  let mult = 1;
  if (category === 'hunt') {
    // T-005 Лук: ×2 (start), T-007 Собака: +50% (при unlocked)
    if (w.techUnlocked[7]) mult *= 1.5; // собака помогает на охоте
  }
  if (category === 'fish') {
    // (no early tech for fishing bonus in tech_tree — fishing nets are later)
  }
  if (category === 'gather') {
    // T-010 Керамика: +50% хранение (косвенно)
  }
  if (category === 'build') {
    // T-020 Деревообработка: ×2 к строительству
    if (w.techUnlocked[20]) mult *= 2;
  }
  return mult;
}

function dismissTechNotification(techId) {
  WORLD.techNotifications = WORLD.techNotifications.filter(t => t.id !== techId);
}

function aliveCitizens(w) { return w.citizens.filter(c => c.alive); }

// ============================================================================
// REAL-TIME UPDATE (called every frame from render.js)
// ============================================================================

function updateRealTime(w, dt) {
  // Event timers always tick (even when paused, at reduced speed)
  for (let i = w.pendingEvents.length - 1; i >= 0; i--) {
    const ev = w.pendingEvents[i];
    const timerDt = w.paused ? dt * 0.3 : dt;
    ev.timer = (ev.timer || 30) - timerDt;
    if (ev.timer <= 0) {
      const idx = smartChoice(w, ev);
      resolveEvent(w, ev, idx);
      w.pendingEvents.splice(i, 1);
      w.metrics.totalDecisions++;
    }
  }

  if (w.paused) return; // Stop simulation when paused
  dt *= w.speed;

  w.simTime += dt;
  w.seasonProgress += dt / w.seasonDuration;

  // Season change
  if (w.seasonProgress >= 1.0) {
    w.seasonProgress = 0;
    advanceSeason(w);
    runSeasonTick(w); // heavy simulation once per season
  }

  // Per-citizen real-time update
  for (const c of w.citizens) {
    if (!c.alive) continue;
    updateCitizenRT(w, c, dt);
  }

  // Update animals (wander around)
  for (const a of w.animals) {
    if (!a.alive) continue;
    a.wanderTimer -= dt;
    if (a.wanderTimer <= 0) {
      // Change direction
      a.vx = (Math.random() - 0.5) * 1.5;
      a.vz = (Math.random() - 0.5) * 1.5;
      a.wanderTimer = 2 + Math.random() * 3;
    }
    a.x += a.vx * dt;
    a.z += a.vz * dt;
    // Keep within bounds
    a.x = Math.max(-14, Math.min(14, a.x));
    a.z = Math.max(-14, Math.min(14, a.z));
  }
}

function updateCitizenRT(w, c, dt) {
  // Needs grow over time
  c.hunger = Math.min(100, c.hunger + dt * 2.0);
  if (['HUNT','FISH','BUILD','GATHER'].includes(c.action))
    c.fatigue = Math.min(100, c.fatigue + dt * 3.0);
  else if (c.action === 'REST')
    c.fatigue = Math.max(0, c.fatigue - dt * 8.0);

  // Check if needs new action (every few seconds or when arrived)
  const dx = c.targetX - c.x;
  const dz = c.targetZ - c.z;
  const dist = Math.sqrt(dx*dx + dz*dz);

  if (dist < 0.5) {
    // Arrived at target — work
    c.workTimer += dt;

    // Produce resources while working
    if (c.action === 'HUNT' && c.workTimer > 2.0) {
      c.workTimer = 0;
      if (c.huntTarget && c.huntTarget.alive) {
        c.huntTarget.alive = false;
        setTimeout(() => { if (c.huntTarget) { c.huntTarget.alive = true; c.huntTarget.x = -10 + Math.random()*20; c.huntTarget.z = -10 + Math.random()*20; } }, 10000);
      }
      const arch = ARCHETYPES[w.archetype];
      const huntBonus = getTechBonus(w, 'hunt');
      const succ = Math.min(1, c.huntSkill/60 + 0.4);
      const meat = Math.max(2, Math.round(succ * 5 * arch.hunt * 2.5 * huntBonus));
      w.settlement.meat += meat;
      c.carrying = { type: 'meat', amount: meat };
      c.huntTarget = null;
      addTechProgress(w, 7, 2);   // T-007 Приручение собаки (охотничий опыт)
      c.targetX = POI.storage.x + (Math.random()-0.5)*2;
      c.targetZ = POI.storage.z + (Math.random()-0.5)*2;
      c.action = 'CARRY';
    } else if (c.action === 'GATHER' && c.workTimer > 2.5) {
      c.workTimer = 0;
      const arch = ARCHETYPES[w.archetype];
      const succ = Math.min(1, c.gatherSkill/60 + 0.5);
      const berries = Math.max(1, Math.round(succ * 4 * arch.gather * 4));
      w.settlement.berries += berries;
      c.carrying = { type: 'berries', amount: berries };
      addTechProgress(w, 15, 1);  // T-015 Земледелие (наблюдение за растениями)
      c.targetX = POI.storage.x + (Math.random()-0.5)*2;
      c.targetZ = POI.storage.z + (Math.random()-0.5)*2;
      c.action = 'CARRY';
    } else if (c.action === 'FISH' && c.workTimer > 3.0) {
      c.workTimer = 0;
      const arch = ARCHETYPES[w.archetype];
      const succ = Math.min(1, c.fishSkill/60 + 0.5);
      const fish = Math.max(1, Math.round(succ * 3 * arch.fish * 3));
      w.settlement.fish += fish;
      c.carrying = { type: 'fish', amount: fish };
      // No early fishing tech in tech_tree.md — fishing research comes later
      c.targetX = POI.storage.x + (Math.random()-0.5)*2;
      c.targetZ = POI.storage.z + (Math.random()-0.5)*2;
      c.action = 'CARRY';
    } else if (c.action === 'BUILD' && c.workTimer > 5.0) {
      c.workTimer = 0;
      w.settlement.wood = Math.max(0, w.settlement.wood - 1);
      const buildBonus = getTechBonus(w, 'build');
      addTechProgress(w, 10, 3);  // T-010 Керамика (стройка → обжиг)
      addTechProgress(w, 15, 1);  // T-015 Земледелие (медленнее)
      addTechProgress(w, 20, 2);  // T-020 Деревообработка
      c.targetX = POI.storage.x + (Math.random()-0.5)*2;
      c.targetZ = POI.storage.z + (Math.random()-0.5)*2;
      c.action = 'CARRY';
    } else if (c.action === 'CARRY' && c.workTimer > 0.5) {
      c.workTimer = 0;
      c.carrying = null;
      // Choose next action
      chooseActionRT(w, c);
    } else if (c.action === 'REST' && c.fatigue < 20) {
      c.workTimer = 0;
      chooseActionRT(w, c);
    } else if (c.action === 'EAT' && c.workTimer > 1.5) {
      c.workTimer = 0;
      c.hunger = Math.max(0, c.hunger - 50);
      chooseActionRT(w, c);
    } else if (c.action === 'RITUAL' && c.workTimer > 4.0) {
      c.workTimer = 0;
      chooseActionRT(w, c);
    } else if (c.action === 'IDLE' && c.workTimer > 1.0) {
      // IDLE → choose new action after 1 second
      c.workTimer = 0;
      chooseActionRT(w, c);
    }
  } else {
    // Move toward target
    const moveDist = c.speed * dt;
    if (dist > 0) {
      c.x += (dx / dist) * Math.min(moveDist, dist);
      c.z += (dz / dist) * Math.min(moveDist, dist);
    }
  }

  // Eat if very hungry and at fire
  if (c.hunger > 70 && c.action !== 'EAT' && dist < 3) {
    const s = w.settlement;
    if (s.meat > 0 || s.fish > 0 || s.berries > 0) {
      c.action = 'EAT';
      c.targetX = POI.fire.x + (Math.random()-0.5)*2;
      c.targetZ = POI.fire.z + (Math.random()-0.5)*2;
      c.workTimer = 0;
    }
  }

  // Rest if very tired
  if (c.fatigue > 80 && c.action !== 'REST') {
    c.action = 'REST';
    c.targetX = POI.huts.x + (Math.random()-0.5)*3;
    c.targetZ = POI.huts.z + (Math.random()-0.5)*3;
    c.workTimer = 0;
  }

  // Death from hunger
  if (c.hunger >= 100 && w.rng.random() < dt * 0.05) {
    c.alive = false;
    c.deathCause = 'голод';
    w.chronicle.push({ year: w.year, season: w.season, entry: `${c.name} умер от голода` });
  }
}

function chooseActionRT(w, c) {
  if (c.age < 12) {
    c.action = c.hunger > 50 ? 'GATHER' : 'IDLE';
    c.targetX = POI.gather.x + (Math.random()-0.5)*3;
    c.targetZ = POI.gather.z + (Math.random()-0.5)*3;
    return;
  }

  const arch = ARCHETYPES[w.archetype];
  const shares = arch;
  const fp = w.priorities.food, sp = w.priorities.stockpile;
  const hungryCount = aliveCitizens(w).filter(ci => ci.hunger > 50).length;
  const foodCrisis = hungryCount > 10;

  const utils = {};
  utils.HUNT = (c.hunger>30 ? c.hunger*0.6 : 0) + (foodCrisis?30:0) + fp*0.5*shares.hunt + sp*0.4*shares.hunt + c.huntSkill*0.3;
  utils.GATHER = (c.hunger>30 ? c.hunger*0.5 : 0) + (foodCrisis?25:0) + fp*0.5*shares.gather + c.gatherSkill*0.3;
  utils.FISH = shares.fish>0.1 ? ((c.hunger>30 ? c.hunger*0.5 : 0) + (foodCrisis?25:0) + fp*0.5*shares.fish + c.fishSkill*0.3) : 0;
  utils.BUILD = foodCrisis ? 0 : (w.priorities.build>15 ? w.priorities.build*0.3 : 0) + c.buildSkill*0.2;
  utils.REST = c.fatigue > 70 ? c.fatigue * 0.8 : 0;
  utils.RITUAL = (w.season === 'WINTER' && w.rng.random() < 0.3) ? 15 : 0;

  let best = 'IDLE', bestU = -1;
  for (const [a, u] of Object.entries(utils)) { if (u > bestU) { bestU = u; best = a; } }

  c.action = best;
  c.workTimer = 0;

  // Set target based on action
  if (best === 'HUNT') {
    // Find nearest alive animal
    const animals = w.animals.filter(a => a.alive);
    if (animals.length > 0) {
      let nearest = animals[0], minDist = 999;
      for (const a of animals) {
        const d = Math.sqrt((a.x - c.x)**2 + (a.z - c.z)**2);
        if (d < minDist) { minDist = d; nearest = a; }
      }
      c.targetX = nearest.x;
      c.targetZ = nearest.z;
      c.huntTarget = nearest; // remember which animal
    } else {
      c.targetX = POI.forest.x + (Math.random()-0.5)*4;
      c.targetZ = POI.forest.z + (Math.random()-0.5)*4;
    }
  }
  else if (best === 'GATHER') { c.targetX = POI.gather.x + (Math.random()-0.5)*4; c.targetZ = POI.gather.z + (Math.random()-0.5)*4; }
  else if (best === 'FISH') { c.targetX = POI.river.x + (Math.random()-0.5)*4; c.targetZ = POI.river.z + (Math.random()-0.5)*4; }
  else if (best === 'BUILD') { c.targetX = POI.build.x + (Math.random()-0.5)*3; c.targetZ = POI.build.z + (Math.random()-0.5)*3; }
  else if (best === 'REST') { c.targetX = POI.huts.x + (Math.random()-0.5)*3; c.targetZ = POI.huts.z + (Math.random()-0.5)*3; }
  else if (best === 'RITUAL') { c.targetX = POI.fire.x + (Math.random()-0.5)*2; c.targetZ = POI.fire.z + (Math.random()-0.5)*2; }
  else { c.targetX = POI.fire.x + (Math.random()-0.5)*4; c.targetZ = POI.fire.z + (Math.random()-0.5)*4; }
}

// ============================================================================
// SEASON TICK (heavy simulation once per season)
// ============================================================================

function advanceSeason(w) {
  const idx = SEASONS.indexOf(w.season);
  w.season = SEASONS[(idx+1) % 4];
  if (w.season === 'SPRING') w.year++;
  if (w.season === 'WINTER') w.metrics.wintersSurvived++;
  w.turn++;
  w.metrics.turnsPlayed++;
}

function runSeasonTick(w) {
  // Consumption (eat from stockpiles)
  const s = w.settlement;
  const isWinter = w.season === 'WINTER';
  const ac = aliveCitizens(w);

  for (const c of ac) {
    const need = isWinter ? 2 : 1;
    let fed = false;
    if (s.meat >= need) { s.meat -= need; fed = true; }
    else if (s.fish >= need) { s.fish -= need; fed = true; }
    else if (s.berries >= need) { s.berries -= need; fed = true; }
    else if (s.meat + s.fish + s.berries >= need) {
      let n = need;
      const tm = Math.min(s.meat, n); s.meat -= tm; n -= tm;
      const tf = Math.min(s.fish, n); s.fish -= tf; n -= tf;
      s.berries -= n; fed = true;
    }
    if (fed) c.hunger = Math.max(0, c.hunger - 30);
    else c.hunger = Math.min(100, c.hunger + 20);
  }

  // Chief pressure
  const hungry = ac.filter(c => c.hunger > 60).length;
  if (hungry > 0) w.chief.pressure = Math.min(100, w.chief.pressure + Math.min(5, Math.floor(hungry/4)));
  if (isWinter) w.chief.pressure = Math.min(100, w.chief.pressure + 2);
  if (hungry === 0) w.chief.pressure = Math.max(0, w.chief.pressure - 3);
  w.metrics.maxPressure = Math.max(w.metrics.maxPressure, w.chief.pressure);

  // Factions
  const hunters = ac.filter(c => c.action === 'HUNT').length;
  const elders = ac.filter(c => c.age >= 50).length;
  w.factions[0].power = Math.min(100, Math.floor(hunters/Math.max(1,ac.length)*100)+20);
  w.factions[2].power = Math.min(100, Math.floor(elders/Math.max(1,ac.length)*100)+25);
  if (w.chief.pressure > 80) {
    for (const f of w.factions) { if (f.grievance < 80) { f.grievance = Math.min(100, f.grievance+3); if (!f.grievanceReason) f.grievanceReason = 'давление вождя'; } }
  }

  // Aging (once per year = spring)
  if (w.season === 'SPRING') {
    for (const c of w.citizens) {
      if (!c.alive) continue;
      c.age++;
      if (c.age >= 60) { const dc = (c.age-60)*0.01; if (w.rng.random() < dc) { c.alive = false; c.deathCause = 'старость'; } }
    }
    // Births
    const bc = ac.length < 80 ? 0.3 : ac.length < 120 ? 0.15 : 0.05;
    const fertile = ac.filter(c => c.gender === 'F' && c.age >= 18 && c.age <= 35);
    for (const f of fertile) {
      if (w.rng.random() < bc) {
        const id = w.citizens.length;
        const gender = w.rng.random() < 0.5 ? 'M' : 'F';
        const name = gender === 'M' ? w.rng.choice(NAMES_M) : w.rng.choice(NAMES_F);
        const nc = createCitizen(id, name, gender, 0, w.rng, ARCHETYPES[w.archetype], false);
        w.citizens.push(nc);
      }
    }
  }

  // Crises
  if (isWinter && w.rng.random() < 0.15) {
    const loss = Math.floor(ac.length / 2);
    s.meat = Math.max(0, s.meat - Math.floor(loss/2));
    s.berries = Math.max(0, s.berries - Math.floor(loss/2));
    w.chronicle.push({ year:w.year, season:w.season, entry:`Жёсткая зима: потеряно ~${loss} ед. еды` });
  }

  // Check events
  checkEvents(w);

  // Chief death
  if (w.chief.age >= 80 || w.chief.pressure >= 100) {
    fireEvent(w, 'CHIEF_DEATH', 'CRITICAL');
  }
}

// ============================================================================
// EVENTS
// ============================================================================

function fireEvent(w, type, priority) {
  if (w.pendingEvents.find(e => e.type === type)) return; // no duplicates
  const ev = { id: w.nextEventId++, type, priority, turn: w.turn, timer: 30 };
  buildEvent(w, ev);
  w.pendingEvents.push(ev);
}

function buildEvent(w, ev) {
  const chief = w.chief, s = w.settlement, ac = aliveCitizens(w);

  if (ev.type === 'CHIEF_DEATH') {
    ev.title = `💀 Смерть вождя ${chief.name}`;
    ev.text = `${chief.name} умер. Давление: ${chief.pressure}, возраст: ${chief.age}.`;
    ev.choices = [
      { label:'Долг отцов', desc:'Давление наследуется', cons:{pressure:'inherit',leg:-5,griev:10} },
      { label:'Новая метла', desc:'Давление обнуляется', cons:{pressure:0,leg:-30,griev:20} },
    ];
  } else if (ev.type === 'WINTER_COMING') {
    ev.title = '❄️ Зима идёт!';
    ev.text = `До зимы ~90 дней. Запасы: 🥩${s.meat} 🍓${s.berries} 🐟${s.fish}. Население: ${ac.length}.`;
    ev.choices = [
      { label:'Удвоить запасы', desc:'+приоритет запасам', cons:{priorityShift:{stockpile:20,food:-10}} },
      { label:'Продолжать как есть', desc:'Без изменений', cons:{} },
    ];
  } else if (ev.type === 'HUNGER') {
    const h = ac.filter(c => c.hunger > 70).length;
    ev.title = `🍗 Голод! ${h} человек`;
    ev.text = `Запасы истощаются. ${h} граждан голодают.`;
    ev.choices = [
      { label:'Общественные работы', desc:'Все на добычу', cons:{allToFood:true} },
      { label:'Рацион', desc:'Сократить потребление', cons:{ration:true} },
      { label:'Молиться', desc:'Ритуал, шанс удачи', cons:{ritual:true,pressure:10} },
    ];
  } else if (ev.type === 'FACTION_GRIEVANCE') {
    const f = ev.faction;
    ev.title = `${f.name} в ярости`;
    ev.text = `${f.name} требует реформ. Обида: ${f.grievance}.`;
    ev.choices = [
      { label:'Уступить', desc:'−легитимность, −обида', cons:{leg:-10,facGriev:-30,facType:f.type} },
      { label:'Подавить', desc:'+обида', cons:{facGriev:10,facType:f.type} },
      { label:'Отложить', desc:'Без изменений', cons:{} },
    ];
  } else if (ev.type === 'CHAMPION_PROPOSES') {
    const champ = w.rng.choice(ac.filter(c => c.age >= 25));
    if (!champ) return;
    ev.title = `⭐ Чемпион ${champ.name}`;
    ev.text = `${champ.name} предлагает реформу «Обновление элит».`;
    ev.choices = [
      { label:'Поддержать', desc:'Реформа стартует', cons:{reform:true,griev:15} },
      { label:'Отклонить', desc:'+легитимность', cons:{leg:5} },
    ];
  } else if (ev.type === 'RITUAL_OF_YEAR') {
    ev.title = '🔥 Ритуал года';
    ev.text = 'Жречество приглашает на ритуал.';
    ev.choices = [
      { label:'Великий пир', desc:'+мораль, −запасы', cons:{morale:true,meat:-10,berries:-5} },
      { label:'Скромно', desc:'Без затрат', cons:{} },
    ];
  } else if (ev.type === 'WEDDING') {
    const cands = ac.filter(c => c.age >= 18 && c.age <= 35);
    if (cands.length === 0) return;
    const c = w.rng.choice(cands);
    ev.title = `💍 Свадьба: ${c.name}`;
    ev.text = `${c.name} берёт пару.`;
    ev.choices = [
      { label:'Пир', desc:'+мораль, −запасы', cons:{morale:true,meat:-5} },
      { label:'Скромно', desc:'Без затрат', cons:{} },
    ];
  } else if (ev.type === 'GOOD_HARVEST') {
    ev.title = '🍓 Богатый урожай!';
    ev.text = 'Ягод вдоволь.';
    ev.choices = [
      { label:'Запасти', desc:'+ягоды', cons:{berries:20} },
      { label:'Пир', desc:'+мораль', cons:{morale:true,berries:10} },
    ];
  } else if (ev.type === 'FIRST_POT') {
    ev.title = '🎉 Первый горшок!';
    ev.text = 'Гончар обожёг первый горшок.';
    ev.choices = [
      { label:'Пир', desc:'+мораль', cons:{morale:true,meat:-5} },
      { label:'В хронику', desc:'+память', cons:{chronicle:'Первый горшок'} },
    ];
  }
}

function checkEvents(w) {
  if (w.season === 'AUTUMN' && w.rng.random() < 0.5) fireEvent(w, 'WINTER_COMING', 'HIGH');
  const hungry = aliveCitizens(w).filter(c => c.hunger > 70).length;
  if (hungry >= 5) fireEvent(w, 'HUNGER', 'CRITICAL');
  for (const f of w.factions) {
    if (f.grievance > 90) { const ev = {id:w.nextEventId++,type:'FACTION_GRIEVANCE',priority:'HIGH',turn:w.turn,timer:30,faction:f}; buildEvent(w,ev); w.pendingEvents.push(ev); }
  }
  if (w.rng.random() < 0.10) fireEvent(w, 'CHAMPION_PROPOSES', 'NORMAL');
  if (w.season === 'WINTER' && w.rng.random() < 0.5) fireEvent(w, 'RITUAL_OF_YEAR', 'NORMAL');
  if (w.rng.random() < 0.08) fireEvent(w, 'WEDDING', 'LOW');
  if (w.season === 'SUMMER' && w.rng.random() < 0.15) fireEvent(w, 'GOOD_HARVEST', 'LOW');
}

function smartChoice(w, ev) {
  let bestIdx = 0, bestScore = -999;
  ev.choices.forEach((ch, i) => {
    const c = ch.cons; let s = 0;
    if (c.pressure === 0) s += 30;
    if (c.leg > 0) s += c.leg;
    if (c.griev < 0) s += 20;
    if (c.allToFood) s += 15;
    if (c.morale) s += 10;
    if (c.reform) s += 15;
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  });
  return bestIdx;
}

function resolveEvent(w, ev, choiceIdx) {
  if (choiceIdx >= ev.choices.length) return;
  const ch = ev.choices[choiceIdx];
  const c = ch.cons;

  if (ev.type === 'CHIEF_DEATH') {
    handleChiefDeath(w, ch.label);
  } else {
    if (c.pressure !== undefined) { if (c.pressure !== 'inherit') w.chief.pressure = c.pressure; }
    if (c.leg !== undefined) w.chief.legitimacy = Math.max(0, Math.min(100, w.chief.legitimacy + c.leg));
    if (c.griev !== undefined) for (const f of w.factions) f.grievance = Math.max(0, Math.min(100, f.grievance + c.griev));
    if (c.facGriev !== undefined) { const f = w.factions.find(f => f.type === c.facType); if (f) f.grievance = Math.max(0, Math.min(100, f.grievance + c.facGriev)); }
    if (c.meat !== undefined) w.settlement.meat = Math.max(0, w.settlement.meat + c.meat);
    if (c.berries !== undefined) w.settlement.berries = Math.max(0, w.settlement.berries + c.berries);
    if (c.allToFood) for (const ci of w.citizens) { if (ci.alive && ci.age >= 16) { ci.action = 'IDLE'; ci.workTimer = 0; } }
    if (c.ration) for (const ci of w.citizens) { if (ci.alive) ci.hunger = Math.min(100, ci.hunger + 10); }
    if (c.morale) for (const ci of w.citizens) { if (ci.alive) ci.loyalty = Math.min(100, ci.loyalty + 10); }
    if (c.reform) { w.chief.reforms.push('refresh_elites'); w.chief.pressure = Math.max(0, w.chief.pressure - 20); }
    if (c.priorityShift) for (const [k,v] of Object.entries(c.priorityShift)) w.priorities[k] = Math.max(0, Math.min(100, (w.priorities[k]||0) + v));
    if (c.chronicle) w.chronicle.push({ year:w.year, season:w.season, entry:c.chronicle });
  }

  w.resolvedEvents.push({ turn:w.turn, year:w.year, season:w.season, type:ev.type, title:ev.title, choice:ch.label });
  w.metrics.totalEvents++;
}

function handleChiefDeath(w, label) {
  const oldP = w.chief.pressure;
  const ac = aliveCitizens(w);
  if (ac.length === 0) return;
  const oldChief = w.citizens.find(c => c.name === w.chief.name && c.alive);
  if (oldChief) { oldChief.alive = false; oldChief.deathCause = 'вождь'; }
  const heir = w.rng.choice(ac.filter(c => c.age >= 18 && c.age <= 40)) || w.rng.choice(ac);
  w.chief = { name:heir.name, age:heir.age, era:heir.age<30?'YOUNG':'MATURE', health:80,
    legitimacy:Math.max(50, w.chief.legitimacy-10), pressure:label==='Долг отцов'?oldP:0, heirId:-1, reforms:[] };
  w.chronicle.push({ year:w.year, season:w.season, entry:`${heir.name} стал вождём` });
}

// ============================================================================
// STATE FOR UI
// ============================================================================

function getState(w) {
  const ac = aliveCitizens(w);
  const actions = {};
  for (const c of ac) actions[c.action] = (actions[c.action] || 0) + 1;
  return {
    turn: w.turn, year: w.year, season: w.season, archetype: w.archetype,
    alive: ac.length, hungry: ac.filter(c => c.hunger > 60).length,
    chief: { name:w.chief.name, age:w.chief.age, era:w.chief.era, pressure:w.chief.pressure, legitimacy:w.chief.legitimacy, reforms:w.chief.reforms.length },
    settlement: { name:w.settlement.name, meat:w.settlement.meat, berries:w.settlement.berries, fish:w.settlement.fish, wood:w.settlement.wood, huts:w.settlement.huts },
    factions: w.factions.map(f => ({ name:f.name, power:f.power, grievance:f.grievance, reason:f.grievanceReason })),
    actions: actions,
    chronicle: w.chronicle.slice(-8).reverse(),
    resolved: w.resolvedEvents.slice(-5).reverse(),
    pendingEvents: w.pendingEvents.map(e => ({ id:e.id, title:e.title, text:e.text, priority:e.priority, choices:e.choices, timer:e.timer||30 })),
    metrics: w.metrics,
    citizens: ac.slice(0, 60).map(c => ({ x:c.x, z:c.z, action:c.action, hunger:c.hunger, age:c.age, carrying:!!c.carrying })),
    animals: w.animals.filter(a => a.alive).map(a => ({ x:a.x, z:a.z })),
    techs: Object.keys(TECH_CATALOG).map(id => {
      const tid = parseInt(id);
      const t = TECH_CATALOG[tid];
      const unlocked = t.start || w.techUnlocked[tid];
      const progress = w.techProgress[tid] || 0;
      const reqMet = !t.req || t.req.every(r => w.techs.has(r) || w.techUnlocked[r]);
      return { id: tid, name: t.name, desc: t.desc, unlocked, progress, cost: t.cost, reqMet, req: t.req || [], cat: t.cat };
    }),
    techNotifications: w.techNotifications,
    gameOver: ac.length === 0,
    seasonProgress: w.seasonProgress,
    paused: w.paused,
    speed: w.speed,
    priorities: w.priorities,
  };
}
