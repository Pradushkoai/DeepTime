// ============================================================================
// DeepTime 3D — Simulation Engine (ported from Python v0.36b)
// ============================================================================

const SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'];

const ARCHETYPES = {
  FOREST:       { hunt: 0.40, gather: 0.40, fish: 0.20, skills: { hunt:[20,45], gather:[25,50], fish:[15,30], build:[15,30] } },
  STEPPE:       { hunt: 0.70, gather: 0.20, fish: 0.10, skills: { hunt:[40,65], gather:[15,30], fish:[10,20], build:[10,25] } },
  RIVER_VALLEY: { hunt: 0.25, gather: 0.30, fish: 0.45, skills: { hunt:[15,30], gather:[25,45], fish:[40,65], build:[15,30] } },
  COASTAL:      { hunt: 0.20, gather: 0.20, fish: 0.60, skills: { hunt:[15,30], gather:[15,30], fish:[50,70], build:[15,30] } },
  MOUNTAIN:     { hunt: 0.60, gather: 0.30, fish: 0.10, skills: { hunt:[35,60], gather:[20,35], fish:[10,20], build:[20,35] } },
  DESERT:       { hunt: 0.30, gather: 0.50, fish: 0.20, skills: { hunt:[25,45], gather:[30,50], fish:[15,25], build:[15,30] } },
  TROPICAL:     { hunt: 0.20, gather: 0.60, fish: 0.20, skills: { hunt:[15,30], gather:[40,65], fish:[25,45], build:[15,30] } },
  ARCTIC:       { hunt: 0.80, gather: 0.05, fish: 0.15, skills: { hunt:[45,70], gather:[10,20], fish:[25,45], build:[15,30] } },
};

const NAMES_M = ['Борис','Карл','Олаф','Сигурд','Эрик','Хрольв','Гуннар','Торстен','Свен','Рагнар','Ивар','Бьорн','Ульф','Кнуд','Хакон'];
const NAMES_F = ['Анна','Хельга','Фрейя','Сигрид','Тора','Ингрид','Астрид','Рагнхильд','Гудрун','Сольвейг','Брунхильда','Торгунна','Эльза','Карин'];

// Simple seeded RNG
class RNG {
  constructor(seed) { this.s = seed || 1; }
  next() { this.s = (this.s * 9301 + 49297) % 233280; return this.s / 233280; }
  randint(a, b) { return Math.floor(this.next() * (b - a + 1)) + a; }
  choice(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  random() { return this.next(); }
}

// ============================================================================
// WORLD STATE
// ============================================================================

let WORLD = null;

function initWorld(archetype='FOREST', population=50, seed=42) {
  const rng = new RNG(seed);
  const arch = ARCHETYPES[archetype];

  const world = {
    turn: 0, year: -10000, season: 'SUMMER', seed: seed, rng: rng,
    archetype: archetype,
    citizens: [],
    factions: [],
    chief: null,
    settlement: { name: 'Стойбище у Реки', meat: 50, berries: 60, fish: 30, wood: 40, stone: 20, huts: 5 },
    pendingEvents: [], resolvedEvents: [], chronicle: [],
    values: { safety:60, warlike:40, knowledge:30, nature:70, collective:70 },
    priorities: { food:40, stockpile:30, build:10, tech:10, army:5, trade:5 },
    techs: new Set([0,1,2]),
    metrics: { totalEvents:0, totalDecisions:0, wintersSurvived:0, maxPressure:0, turnsPlayed:0 },
    nextEventId: 1,
  };

  // Chief
  const chiefName = rng.choice(NAMES_M);
  const chiefSkills = genSkills(rng, arch);
  world.chief = {
    name: chiefName, age: rng.randint(25,35), era: 'YOUNG',
    health: 100, legitimacy: 80, pressure: 0, heirId: -1, reforms: [],
    huntSkill: Math.min(100, chiefSkills.hunt + 20),
  };

  // Citizens
  world.citizens.push({
    id: 0, name: chiefName, gender:'M', age: world.chief.age,
    huntSkill: world.chief.huntSkill, gatherSkill: chiefSkills.gather,
    fishSkill: chiefSkills.fish, buildSkill: chiefSkills.build,
    hunger:0, fatigue:0, loyalty:90, alive:true, action:'IDLE',
    actionReason:'', x: 0.5, z: 0.5, // position in settlement
  });

  for (let i = 1; i < population; i++) {
    const gender = rng.random() < 0.5 ? 'M' : 'F';
    const age = rng.randint(0, 70);
    const sk = genSkills(rng, arch);
    world.citizens.push({
      id: i, name: gender==='M' ? rng.choice(NAMES_M) : rng.choice(NAMES_F),
      gender, age, huntSkill: sk.hunt, gatherSkill: sk.gather,
      fishSkill: sk.fish, buildSkill: sk.build,
      hunger:0, fatigue:0, loyalty: rng.randint(50,80), alive:true, action:'IDLE',
      actionReason:'', x: rng.random()*0.8+0.1, z: rng.random()*0.8+0.1,
    });
  }

  // Factions
  world.factions = [
    { type:'HUNTERS', name:'Охотники', power:40, grievance:0, grievanceReason:'' },
    { type:'PRIESTS', name:'Жречество', power:25, grievance:0, grievanceReason:'' },
    { type:'ELDERS', name:'Старейшины', power:35, grievance:0, grievanceReason:'' },
  ];

  return world;
}

function genSkills(rng, arch) {
  const s = arch.skills;
  return {
    hunt: rng.randint(s.hunt[0], s.hunt[1]),
    gather: rng.randint(s.gather[0], s.gather[1]),
    fish: rng.randint(s.fish[0], s.fish[1]),
    build: rng.randint(s.build[0], s.build[1]),
  };
}

// ============================================================================
// SYSTEMS
// ============================================================================

function aliveCitizens(w) { return w.citizens.filter(c => c.alive); }

function sysNeeds(w) {
  for (const c of w.citizens) {
    if (!c.alive) continue;
    c.hunger = Math.min(100, c.hunger + 15);
    if (['HUNT','BUILD','MIGRATE'].includes(c.action)) c.fatigue = Math.min(100, c.fatigue + 20);
    else if (c.action === 'REST') c.fatigue = Math.max(0, c.fatigue - 30);
    else c.fatigue = Math.min(100, c.fatigue + 5);
  }
}

function sysActions(w) {
  const arch = ARCHETYPES[w.archetype];
  const shares = arch;
  const fp = w.priorities.food, sp = w.priorities.stockpile;
  const hungryCount = aliveCitizens(w).filter(c => c.hunger > 50).length;
  const foodCrisis = hungryCount > 10;

  for (const c of w.citizens) {
    if (!c.alive) continue;
    if (c.age < 12) { c.action = c.hunger > 30 ? 'GATHER' : 'REST'; continue; }
    let sm = c.age >= 60 ? 0.5 : 1.0;

    const utils = {};
    utils.HUNT = (c.hunger>30 ? c.hunger*0.6 : 0) + (foodCrisis?30:0) + fp*0.5*shares.hunt + sp*0.4*shares.hunt + c.huntSkill*0.3;
    utils.GATHER = (c.hunger>30 ? c.hunger*0.5 : 0) + (foodCrisis?25:0) + fp*0.5*shares.gather + c.gatherSkill*0.3;
    utils.FISH = shares.fish>0.1 ? ((c.hunger>30 ? c.hunger*0.5 : 0) + (foodCrisis?25:0) + fp*0.5*shares.fish + c.fishSkill*0.3) : 0;
    utils.BUILD = foodCrisis ? 0 : (w.priorities.build>15 ? w.priorities.build*0.3 : 0) + (w.settlement.huts < aliveCitizens(w).length/8 ? 15 : 0) + c.buildSkill*0.2;
    utils.REST = c.fatigue > 70 ? c.fatigue * 0.8 : 0;
    utils.RITUAL = (w.season === 'WINTER' && w.factions[1]) ? 15 : 0;

    let best = 'IDLE', bestU = -1;
    for (const [a, u] of Object.entries(utils)) { if (u > bestU) { bestU = u; best = a; } }
    c.action = best;
    // Assign random position based on action
    if (best === 'HUNT') { c.x = 0.1 + w.rng.random()*0.3; c.z = 0.1 + w.rng.random()*0.3; }
    else if (best === 'GATHER') { c.x = 0.6 + w.rng.random()*0.3; c.z = 0.1 + w.rng.random()*0.3; }
    else if (best === 'FISH') { c.x = 0.1 + w.rng.random()*0.3; c.z = 0.6 + w.rng.random()*0.3; }
    else if (best === 'BUILD') { c.x = 0.4 + w.rng.random()*0.2; c.z = 0.4 + w.rng.random()*0.2; }
    else { c.x = 0.3 + w.rng.random()*0.4; c.z = 0.3 + w.rng.random()*0.4; }
  }
}

function sysProduction(w) {
  const arch = ARCHETYPES[w.archetype];
  const s = w.settlement;
  const sm = { SPRING:1.2, SUMMER:1.5, AUTUMN:1.2, WINTER:0.4 }[w.season];

  let meat=0, berries=0, fish=0, wood=0;
  for (const c of w.citizens) {
    if (!c.alive || c.age < 12) continue;
    let mult = c.age >= 60 ? 0.5 : 1.0;
    if (c.action === 'HUNT') {
      const succ = Math.min(1, c.huntSkill/60+0.4)*mult*sm;
      meat += succ > 0.3 ? Math.max(1, Math.round(succ*3*arch.hunt*2.5)) : 0;
    } else if (c.action === 'GATHER') {
      const succ = Math.min(1, c.gatherSkill/60+0.5)*mult*sm;
      berries += succ > 0.3 ? Math.max(1, Math.round(succ*4*arch.gather*4)) : 0;
    } else if (c.action === 'FISH') {
      const succ = Math.min(1, c.fishSkill/60+0.5)*mult*sm;
      fish += succ > 0.3 ? Math.max(1, Math.round(succ*3*arch.fish*3)) : 0;
    } else if (c.action === 'BUILD') { wood += 1; }
  }
  s.meat += meat; s.berries += berries; s.fish += fish; s.wood += wood;
}

function sysConsumption(w) {
  const s = w.settlement;
  const isWinter = w.season === 'WINTER';
  const fastDay = (w.turn % 5 === 0);
  const foodBase = isWinter ? 1 : (fastDay ? 0 : 1);

  for (const c of w.citizens) {
    if (!c.alive) continue;
    const isChild = c.age < 16;
    let need = isChild ? Math.floor(foodBase/2) : foodBase;
    if (need === 0) { c.hunger = Math.min(100, c.hunger+5); continue; }

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

    if (fed) c.hunger = Math.max(0, c.hunger - 40);
    else {
      c.hunger = Math.min(100, c.hunger + 15);
      if (c.hunger >= 100) {
        const dc = isChild ? 0.15 : 0.08;
        if (w.rng.random() < dc) { c.alive = false; c.deathCause = 'голод'; }
      }
    }
  }
}

function sysFactions(w) {
  const ac = aliveCitizens(w);
  if (ac.length === 0) return;
  const hunters = ac.filter(c => c.action === 'HUNT').length;
  const ritual = ac.filter(c => c.action === 'RITUAL').length;
  const elders = ac.filter(c => c.age >= 50).length;
  w.factions[0].power = Math.min(100, Math.floor(hunters/ac.length*100)+20);
  w.factions[1].power = Math.min(100, Math.floor(ritual/ac.length*100)+15);
  w.factions[2].power = Math.min(100, Math.floor(elders/ac.length*100)+25);
  if (w.chief.pressure > 80) {
    for (const f of w.factions) {
      if (f.grievance < 80) { f.grievance = Math.min(100, f.grievance+3); if (!f.grievanceReason) f.grievanceReason = 'давление вождя высокое'; }
    }
  }
}

function sysChief(w) {
  const c = w.chief;
  const hungry = aliveCitizens(w).filter(c => c.hunger > 60).length;
  if (hungry > 0) c.pressure = Math.min(100, c.pressure + Math.min(5, Math.floor(hungry/4)));
  if (w.season === 'WINTER') c.pressure = Math.min(100, c.pressure + 2);
  const rd = w.chronicle.slice(-5).filter(e => /погиб|умер|Болезнь|Жёсткая/.test(e.entry)).length;
  if (rd > 0) c.pressure = Math.min(100, c.pressure + rd);
  if (hungry === 0 && rd === 0) c.pressure = Math.max(0, c.pressure - 2);
  w.metrics.maxPressure = Math.max(w.metrics.maxPressure, c.pressure);
  if (c.age >= 80 || c.pressure >= 100) fireEvent(w, 'CHIEF_DEATH', 'CRITICAL');
}

function sysAging(w) {
  if (w.season !== 'SPRING') return;
  for (const c of w.citizens) {
    if (!c.alive) continue;
    c.age++;
    if (c.age >= 60) {
      const dc = (c.age - 60) * 0.01;
      if (w.rng.random() < dc) { c.alive = false; c.deathCause = 'старость'; }
    }
  }
  // Births
  const ac = aliveCitizens(w);
  const bc = ac.length < 80 ? 0.3 : ac.length < 120 ? 0.15 : 0.05;
  const fertile = ac.filter(c => c.gender === 'F' && c.age >= 18 && c.age <= 35);
  for (const f of fertile) {
    if (w.rng.random() < bc) {
      w.citizens.push({
        id: w.citizens.length, name: w.rng.random()<0.5 ? w.rng.choice(NAMES_M) : w.rng.choice(NAMES_F),
        gender: w.rng.random()<0.5 ? 'M' : 'F', age: 0,
        huntSkill: 5, gatherSkill: 5, fishSkill: 5, buildSkill: 5,
        hunger: 0, fatigue: 0, loyalty: 70, alive: true, action: 'IDLE',
        x: 0.3 + w.rng.random()*0.4, z: 0.3 + w.rng.random()*0.4,
      });
    }
  }
}

function sysCrises(w) {
  if (w.season === 'WINTER' && w.rng.random() < 0.15) {
    const loss = Math.floor(aliveCitizens(w).length / 2);
    w.settlement.meat = Math.max(0, w.settlement.meat - Math.floor(loss/2));
    w.settlement.berries = Math.max(0, w.settlement.berries - Math.floor(loss/2));
    w.chronicle.push({ year: w.year, season: w.season, entry: `Жёсткая зима: потеряно ~${loss} единиц еды` });
  }
  if (w.season === 'SUMMER' && w.rng.random() < 0.1) {
    const loss = Math.floor(w.settlement.berries / 3);
    w.settlement.berries -= loss;
    w.chronicle.push({ year: w.year, season: w.season, entry: `Неурожай ягод: потеряно ${loss} единиц` });
  }
  if (w.rng.random() < 0.03) {
    const ac = aliveCitizens(w);
    if (ac.length > 0) {
      const v = w.rng.choice(ac);
      if (v.age >= 60 || v.age < 5) { v.alive = false; v.deathCause = 'болезнь'; w.chronicle.push({ year: w.year, season: w.season, entry: `Болезнь унесла ${v.name}` }); }
    }
  }
}

// ============================================================================
// EVENTS
// ============================================================================

function fireEvent(w, type, priority) {
  const ev = { id: w.nextEventId++, type, priority, turn: w.turn };
  buildEvent(w, ev);
  w.pendingEvents.push(ev);
}

function buildEvent(w, ev) {
  const chief = w.chief;
  const s = w.settlement;
  const ac = aliveCitizens(w);

  if (ev.type === 'CHIEF_DEATH') {
    ev.title = `Смерть вождя ${chief.name}`;
    ev.text = `${chief.name} умер. Давление: ${chief.pressure}, возраст: ${chief.age}. Наследник: ${chief.heirId !== -1 ? 'есть' : 'НЕТ'}.`;
    ev.choices = [
      { label: 'Долг отцов', desc: 'Давление наследуется, гасится 5/год', cons: { pressure:'inherit', leg:-5, griev:10 } },
      { label: 'Новая метла', desc: 'Давление обнуляется, ценой легитимности', cons: { pressure:0, leg:-30, griev:20 } },
    ];
  } else if (ev.type === 'WINTER_COMING') {
    ev.title = '❄️ Зима идёт!';
    ev.text = `Холодный ветер с севера. До зимы ~90 дней. Запасы: мясо ${s.meat}, ягоды ${s.berries}, рыба ${s.fish}. Население: ${ac.length}.`;
    ev.choices = [
      { label: 'Удвоить запасы', desc: '+приоритет запасам, −приоритет еде', cons: { priorityShift: { stockpile:20, food:-10 } } },
      { label: 'Продолжать как есть', desc: 'Без изменений', cons: {} },
      { label: 'Кочёвка на юг', desc: 'Потеря 5 чел, +20 запасов', cons: { migrate: true } },
    ];
  } else if (ev.type === 'HUNGER') {
    const h = ac.filter(c => c.hunger > 70).length;
    ev.title = `🍗 Голод! ${h} человек голодают`;
    ev.text = `Запасы истощаются. ${h} граждан голодают. Что делать?`;
    ev.choices = [
      { label: 'Общественные работы', desc: 'Все на добычу, +усталость', cons: { allToFood: true, fatigue: 20 } },
      { label: 'Рацион', desc: 'Сократить потребление, +голод', cons: { ration: true } },
      { label: 'Молиться', desc: 'Ритуал, +давление, шанс удачи', cons: { ritual: true, pressure: 10 } },
    ];
  } else if (ev.type === 'FACTION_GRIEVANCE') {
    const f = ev.faction || w.factions[0];
    ev.title = `${f.name} в ярости (обида ${f.grievance})`;
    ev.text = `${f.name} требует реформ. Причина: ${f.grievanceReason || 'не указана'}.`;
    ev.choices = [
      { label: 'Уступить', desc: '−легитимность, −обида', cons: { leg:-10, facGriev:-30, facType:f.type } },
      { label: 'Подавить', desc: '+обида, риск мятежа', cons: { facGriev:10, facType:f.type } },
      { label: 'Отложить', desc: 'Без изменений', cons: {} },
    ];
  } else if (ev.type === 'CHAMPION_PROPOSES') {
    const champ = w.rng.choice(ac.filter(c => c.age >= 25));
    if (!champ) { ev.title = 'Чемпион'; ev.text = 'Нет кандидата'; ev.choices = [{label:'OK',desc:'',cons:{}}]; return; }
    ev.title = `Чемпион ${champ.name} предлагает реформу`;
    ev.text = `${champ.name}, ${champ.age} лет, предлагает провести реформу «Обновление элит».`;
    ev.choices = [
      { label: 'Поддержать', desc: 'Реформа стартует, +обида конкурентов', cons: { reform: true, griev:15 } },
      { label: 'Отклонить', desc: '+легитимность', cons: { leg:5 } },
    ];
  } else if (ev.type === 'RITUAL_OF_YEAR') {
    ev.title = '🔥 Ритуал года: праздник огня';
    ev.text = 'Жречество приглашает на ритуал. Это укрепляет мораль.';
    ev.choices = [
      { label: 'Великий пир', desc: '+мораль, −запасы', cons: { morale:true, meat:-10, berries:-5 } },
      { label: 'Скромная церемония', desc: '−мораль, +запасы', cons: {} },
      { label: 'Отказаться', desc: '−обида жречества', cons: { facGriev:20, facType:'PRIESTS' } },
    ];
  } else if (ev.type === 'WEDDING') {
    const cands = ac.filter(c => c.age >= 18 && c.age <= 35);
    if (cands.length === 0) { ev.title='Свадьба'; ev.text='Нет кандидатов'; ev.choices=[{label:'OK',desc:'',cons:{}}]; return; }
    const c = w.rng.choice(cands);
    ev.title = `💍 Свадьба: ${c.name}`;
    ev.text = `${c.name}, заметный член племени, берёт пару.`;
    ev.choices = [
      { label: 'Пир за счёт казны', desc: '+мораль, −запасы', cons: { morale:true, meat:-5 } },
      { label: 'Скромная церемония', desc: 'Без затрат', cons: {} },
    ];
  } else if (ev.type === 'BIRTH_NOTABLE') {
    ev.title = '👶 Родился первый ребёнок нового рода';
    ev.text = 'В семье заметного гражданина родился ребёнок. Племя растёт.';
    ev.choices = [
      { label: 'Праздник', desc: '+мораль, −запасы', cons: { morale:true, meat:-3 } },
      { label: 'Записать в хронику', desc: '+культурная память', cons: { chronicle: 'Родился ребёнок нового рода' } },
    ];
  } else if (ev.type === 'DEATH_ELDER') {
    const elders = ac.filter(c => c.age >= 50);
    if (elders.length === 0) { ev.title='Смерть'; ev.text='Нет старейшин'; ev.choices=[{label:'OK',desc:'',cons:{}}]; return; }
    const c = w.rng.choice(elders);
    ev.title = `⚱️ Смерть старейшины ${c.name}`;
    ev.text = `${c.name}, ${c.age} лет, умер. Племя скорбит.`;
    ev.choices = [
      { label: 'Похоронить с почестями', desc: '+давление, +хроника', cons: { pressure:5, chronicle:`Похороны ${c.name}` } },
      { label: 'Скромные похороны', desc: 'Без затрат', cons: {} },
    ];
    c.alive = false; c.deathCause = 'старость';
  } else if (ev.type === 'GOOD_HARVEST') {
    ev.title = '🍓 Богатый урожай ягод!';
    ev.text = 'В этом сезоне ягод вдоволь. Запасы пополнились.';
    ev.choices = [
      { label: 'Запасти', desc: '+запасы ягод', cons: { berries:20 } },
      { label: 'Пир', desc: '+мораль, часть в запасы', cons: { morale:true, berries:10 } },
    ];
  } else if (ev.type === 'FIRST_POT') {
    ev.title = '🎉 Первый горшок обожжён!';
    ev.text = 'Гончар обожёг первый глиняный горшок. Племя празднует.';
    ev.choices = [
      { label: 'Пир', desc: '+мораль, −запасы', cons: { morale:true, meat:-5 } },
      { label: 'Записать в хронику', desc: '+культурная память', cons: { chronicle:'Первый горшок обожжён' } },
    ];
  }
}

function checkEvents(w) {
  if (w.season === 'AUTUMN' && w.rng.random() < 0.5 && !w.pendingEvents.find(e => e.type === 'WINTER_COMING'))
    fireEvent(w, 'WINTER_COMING', 'HIGH');
  const hungry = aliveCitizens(w).filter(c => c.hunger > 70).length;
  if (hungry >= 5 && !w.pendingEvents.find(e => e.type === 'HUNGER'))
    fireEvent(w, 'HUNGER', 'CRITICAL');
  for (const f of w.factions) {
    if (f.grievance > 90 && !w.pendingEvents.find(e => e.type === 'FACTION_GRIEVANCE' && e.faction === f)) {
      const ev = { id: w.nextEventId++, type: 'FACTION_GRIEVANCE', priority: 'HIGH', turn: w.turn, faction: f };
      buildEvent(w, ev); w.pendingEvents.push(ev);
    }
  }
  if (w.rng.random() < 0.10) fireEvent(w, 'CHAMPION_PROPOSES', 'NORMAL');
  if (w.season === 'WINTER' && w.rng.random() < 0.7 && !w.pendingEvents.find(e => e.type === 'RITUAL_OF_YEAR'))
    fireEvent(w, 'RITUAL_OF_YEAR', 'NORMAL');
  if (w.rng.random() < 0.10) fireEvent(w, 'WEDDING', 'LOW');
  if (w.rng.random() < 0.15) fireEvent(w, 'BIRTH_NOTABLE', 'LOW');
  if (w.season === 'SUMMER' && w.rng.random() < 0.20) fireEvent(w, 'GOOD_HARVEST', 'LOW');
  if (w.rng.random() < 0.05 && w.techs.has(10)) fireEvent(w, 'FIRST_POT', 'NORMAL');
}

function resolveEvent(w, ev, choiceIdx) {
  if (choiceIdx >= ev.choices.length) return;
  const ch = ev.choices[choiceIdx];
  const c = ch.cons;

  if (ev.type === 'CHIEF_DEATH') {
    handleChiefDeath(w, ch.label);
  } else {
    if (c.pressure !== undefined) {
      if (c.pressure === 'inherit') { /* keep pressure */ }
      else w.chief.pressure = c.pressure;
    }
    if (c.leg !== undefined) w.chief.legitimacy = Math.max(0, Math.min(100, w.chief.legitimacy + c.leg));
    if (c.griev !== undefined) for (const f of w.factions) f.grievance = Math.max(0, Math.min(100, f.grievance + c.griev));
    if (c.facGriev !== undefined) { const f = w.factions.find(f => f.type === c.facType); if (f) f.grievance = Math.max(0, Math.min(100, f.grievance + c.facGriev)); }
    if (c.meat !== undefined) w.settlement.meat = Math.max(0, w.settlement.meat + c.meat);
    if (c.berries !== undefined) w.settlement.berries = Math.max(0, w.settlement.berries + c.berries);
    if (c.allToFood) for (const ci of w.citizens) { if (ci.alive && ci.age >= 16) ci.action = ci.huntSkill > ci.gatherSkill ? 'HUNT' : 'GATHER'; }
    if (c.fatigue !== undefined) for (const ci of w.citizens) { if (ci.alive) ci.fatigue = Math.min(100, ci.fatigue + c.fatigue); }
    if (c.ration) for (const ci of w.citizens) { if (ci.alive) ci.hunger = Math.min(100, ci.hunger + 10); }
    if (c.morale) for (const ci of w.citizens) { if (ci.alive) ci.loyalty = Math.min(100, ci.loyalty + 10); }
    if (c.reform) { w.chief.reforms.push('refresh_elites'); w.chief.pressure = Math.max(0, w.chief.pressure - 20); }
    if (c.priorityShift) for (const [k,v] of Object.entries(c.priorityShift)) w.priorities[k] = Math.max(0, Math.min(100, (w.priorities[k]||0) + v));
    if (c.chronicle) w.chronicle.push({ year: w.year, season: w.season, entry: c.chronicle });
  }

  w.resolvedEvents.push({ turn: w.turn, year: w.year, season: w.season, type: ev.type, title: ev.title, choice: ch.label });
  w.metrics.totalEvents++;
}

function handleChiefDeath(w, label) {
  const oldP = w.chief.pressure;
  const ac = aliveCitizens(w);
  if (ac.length === 0) return;
  const heir = w.rng.choice(ac.filter(c => c.age >= 18 && c.age <= 40)) || w.rng.choice(ac);
  w.chief = {
    name: heir.name, age: heir.age, era: heir.age < 30 ? 'YOUNG' : 'MATURE',
    health: 80, legitimacy: Math.max(50, w.chief.legitimacy - 10),
    pressure: label === 'Долг отцов' ? oldP : 0, heirId: -1, reforms: [],
  };
  heir.alive = false; // old chief is gone (or heir takes role)
  w.chronicle.push({ year: w.year, season: w.season, entry: `${heir.name} стал новым вождём (давление ${w.chief.pressure})` });
}

// ============================================================================
// GAME LOOP
// ============================================================================

function advanceSeason(w) {
  const idx = SEASONS.indexOf(w.season);
  w.season = SEASONS[(idx + 1) % 4];
  if (w.season === 'SPRING') w.year++;
  if (w.season === 'WINTER') w.metrics.wintersSurvived++;
}

function simulateTurn(w) {
  w.turn++; w.metrics.turnsPlayed++;
  checkEvents(w);
  sysNeeds(w);
  sysActions(w);
  sysProduction(w);
  sysConsumption(w);
  sysFactions(w);
  sysChief(w);
  sysAging(w);
  sysCrises(w);
  advanceSeason(w);
  // Resolve pending events automatically (smart-ish)
  while (w.pendingEvents.length > 0) {
    const ev = w.pendingEvents.shift();
    // Smart choice: prefer options that reduce pressure/grievance
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
    resolveEvent(w, ev, bestIdx);
    w.metrics.totalDecisions++;
  }
  return w;
}

// Get state for UI
function getState(w) {
  const ac = aliveCitizens(w);
  const actions = {};
  for (const c of ac) actions[c.action] = (actions[c.action] || 0) + 1;
  return {
    turn: w.turn, year: w.year, season: w.season, archetype: w.archetype,
    alive: ac.length, hungry: ac.filter(c => c.hunger > 60).length,
    chief: { name: w.chief.name, age: w.chief.age, era: w.chief.era, pressure: w.chief.pressure, legitimacy: w.chief.legitimacy, reforms: w.chief.reforms.length },
    settlement: { name: w.settlement.name, meat: w.settlement.meat, berries: w.settlement.berries, fish: w.settlement.fish, wood: w.settlement.wood, huts: w.settlement.huts },
    factions: w.factions.map(f => ({ name: f.name, power: f.power, grievance: f.grievance, reason: f.grievanceReason })),
    actions: actions,
    chronicle: w.chronicle.slice(-10).reverse(),
    resolved: w.resolvedEvents.slice(-5).reverse(),
    metrics: w.metrics,
    citizens: ac.slice(0, 60).map(c => ({ x: c.x, z: c.z, action: c.action, hunger: c.hunger, age: c.age })),
    gameOver: ac.length === 0,
  };
}
