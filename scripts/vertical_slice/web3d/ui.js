// ============================================================================
// DeepTime 3D — UI Controller
// ============================================================================

let config = { archetype: 'FOREST', seed: 42, population: 50, strategy: 'smart' };

function start() {
  WORLD = initWorld(config.archetype, config.population, config.seed);
  initThree();
  updateUI();
}

function nextTurn() {
  simulateTurn(WORLD);
  updateUI();
}

function autoPlay(n) {
  for (let i = 0; i < n; i++) {
    simulateTurn(WORLD);
    if (aliveCitizens(WORLD).length === 0) break;
  }
  updateUI();
}

function resetGame() {
  config.archetype = document.getElementById('selArch').value;
  config.seed = parseInt(document.getElementById('inpSeed').value) || 42;
  config.population = parseInt(document.getElementById('inpPop').value) || 50;
  WORLD = initWorld(config.archetype, config.population, config.seed);
  updateUI();
}

function updateUI() {
  const s = getState(WORLD);

  // Season
  const seasonIcons = { SPRING: '🌱 ВЕСНА', SUMMER: '☀️ ЛЕТО', AUTUMN: '🍂 ОСЕНЬ', WINTER: '❄️ ЗИМА' };
  document.getElementById('seasonLabel').textContent = seasonIcons[s.season] || s.season;
  document.getElementById('yearLabel').textContent = `${s.year} до н.э.`;
  document.getElementById('turnLabel').textContent = `Ход ${s.turn}`;
  document.getElementById('popLabel').textContent = `👥 ${s.alive}`;
  if (s.hungry > 0) {
    document.getElementById('hungryLabel').textContent = `🍗 голод: ${s.hungry}`;
    document.getElementById('hungryLabel').style.display = 'inline';
  } else {
    document.getElementById('hungryLabel').style.display = 'none';
  }

  // Chief
  const chief = s.chief;
  document.getElementById('chiefName').textContent = chief.name;
  document.getElementById('chiefAge').textContent = `${chief.age} / ${chief.era}`;
  document.getElementById('chiefLegit').textContent = `${chief.legitimacy}/100`;
  const pEl = document.getElementById('chiefPress');
  pEl.textContent = `${chief.pressure}/100`;
  pEl.className = `val ${chief.pressure > 80 ? 'bad' : chief.pressure > 50 ? 'warn' : 'good'}`;
  document.getElementById('pressBar').style.width = chief.pressure + '%';
  document.getElementById('chiefReforms').textContent = chief.reforms;

  // Resources
  document.getElementById('resMeat').textContent = s.settlement.meat;
  document.getElementById('resBerries').textContent = s.settlement.berries;
  document.getElementById('resFish').textContent = s.settlement.fish;
  document.getElementById('resWood').textContent = s.settlement.wood;

  // Actions
  let actHtml = '';
  const actColors = { HUNT:'#f04848', GATHER:'#4ec9b0', FISH:'#569cd6', BUILD:'#dcdcaa', REST:'#888', RITUAL:'#c586c0', IDLE:'#666' };
  for (const [a, c] of Object.entries(s.actions)) {
    actHtml += `<span class="actTag" style="background:${actColors[a]||'#444'}22;color:${actColors[a]||'#aaa'};border:1px solid ${actColors[a]||'#555'}">${a}: ${c}</span>`;
  }
  document.getElementById('actTags').innerHTML = actHtml;

  // Factions
  let facHtml = '';
  for (const f of s.factions) {
    const emoji = f.grievance < 60 ? '✅' : f.grievance < 90 ? '⚠️' : '🔥';
    facHtml += `<div class="fac"><span class="facN">${emoji} ${f.name}</span> <span class="facP">(сила ${f.power})</span>`;
    facHtml += `<div class="facG">Обида: ${f.grievance}/100</div>`;
    facHtml += `<div class="bar"><div class="barFill griev" style="width:${f.grievance}%"></div></div></div>`;
  }
  document.getElementById('factions').innerHTML = facHtml;

  // Chronicle
  let chHtml = '';
  for (const e of s.chronicle) {
    chHtml += `<div class="chEntry"><span class="chY">[${e.year} ${e.season}]</span> ${e.entry}</div>`;
  }
  document.getElementById('chronicle').innerHTML = chHtml || '<div class="chEntry" style="color:#555">Хроника пуста</div>';

  // Recent decisions
  let rHtml = '';
  for (const e of s.resolved) {
    rHtml += `<div class="chEntry"><span class="chY">[${e.turn}]</span> ${e.title} → <b style="color:#4ec9b0">${e.choice}</b></div>`;
  }
  document.getElementById('recentDec').innerHTML = rHtml || '<div class="chEntry" style="color:#555">Пока нет решений</div>';

  // Metrics
  document.getElementById('mEvents').textContent = s.metrics.totalEvents;
  document.getElementById('mDecisions').textContent = s.metrics.totalDecisions;
  document.getElementById('mWinters').textContent = s.metrics.wintersSurvived;
  document.getElementById('mPressure').textContent = s.metrics.maxPressure;

  // 3D update
  if (scene) {
    updateSeason(s.season);
    updateCitizens(s.citizens);
    createHuts(s.settlement.huts);
  }

  // Game over
  if (s.gameOver) {
    document.getElementById('gameOver').style.display = 'block';
    document.getElementById('goWinters').textContent = s.metrics.wintersSurvived;
    document.getElementById('goYear').textContent = s.year;
  } else {
    document.getElementById('gameOver').style.display = 'none';
  }
}
