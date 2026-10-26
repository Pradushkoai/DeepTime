// ============================================================================
// DeepTime 3D — UI Controller v2.0 (Real-Time)
// ============================================================================

let config = { archetype:'FOREST', seed:42, population:50, strategy:'smart' };

function start() {
  WORLD = initWorld(config.archetype, config.population, config.seed);
  initThree();
  updateUI();
}

function togglePause() {
  WORLD.paused = !WORLD.paused;
  updateUI();
}

function setSpeed(s) {
  WORLD.speed = s;
  updateUI();
}

function setPriority(name, val) {
  WORLD.priorities[name] = parseInt(val);
}

function resolveEventUI(evId, choiceIdx) {
  const ev = WORLD.pendingEvents.find(e => e.id === evId);
  if (!ev) return;
  resolveEvent(WORLD, ev, choiceIdx);
  WORLD.pendingEvents = WORLD.pendingEvents.filter(e => e.id !== evId);
  WORLD.metrics.totalDecisions++;
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
  if (!WORLD) return;
  const s = getState(WORLD);

  const sIcons = { SPRING:'🌱 ВЕСНА', SUMMER:'☀️ ЛЕТО', AUTUMN:'🍂 ОСЕНЬ', WINTER:'❄️ ЗИМА' };
  document.getElementById('seasonLabel').textContent = sIcons[s.season] || s.season;
  document.getElementById('yearLabel').textContent = `${s.year} до н.э.`;
  document.getElementById('turnLabel').textContent = `Ход ${s.turn}`;
  document.getElementById('popLabel').textContent = `👥 ${s.alive}`;
  document.getElementById('hungryLabel').style.display = s.hungry > 0 ? 'inline' : 'none';
  document.getElementById('hungryLabel').textContent = `🍗 ${s.hungry}`;

  // Season progress bar
  document.getElementById('seasonBar').style.width = (s.seasonProgress * 100) + '%';

  // Pause/speed buttons
  document.getElementById('btnPause').textContent = s.paused ? '▶ Пуск' : '⏸ Пауза';
  document.getElementById('btn1x').style.opacity = s.speed === 1 ? '1' : '0.5';
  document.getElementById('btn2x').style.opacity = s.speed === 2 ? '1' : '0.5';
  document.getElementById('btn3x').style.opacity = s.speed === 3 ? '1' : '0.5';

  // Chief
  const ch = s.chief;
  document.getElementById('chiefName').textContent = ch.name;
  document.getElementById('chiefAge').textContent = `${ch.age} / ${ch.era}`;
  document.getElementById('chiefLegit').textContent = `${ch.legitimacy}/100`;
  const pEl = document.getElementById('chiefPress');
  pEl.textContent = `${ch.pressure}/100`;
  pEl.className = `val ${ch.pressure > 80 ? 'bad' : ch.pressure > 50 ? 'warn' : 'good'}`;
  document.getElementById('pressBar').style.width = ch.pressure + '%';
  document.getElementById('chiefReforms').textContent = ch.reforms;

  // Resources
  document.getElementById('resMeat').textContent = s.settlement.meat;
  document.getElementById('resBerries').textContent = s.settlement.berries;
  document.getElementById('resFish').textContent = s.settlement.fish;
  document.getElementById('resWood').textContent = s.settlement.wood;

  // Actions
  let actHtml = '';
  const aColors = { HUNT:'#f04848',GATHER:'#4ec9b0',FISH:'#569cd6',BUILD:'#dcdcaa',REST:'#888',RITUAL:'#c586c0',IDLE:'#666',EAT:'#ffaa00',CARRY:'#ff8800' };
  for (const [a,c] of Object.entries(s.actions)) {
    actHtml += `<span class="actTag" style="background:${aColors[a]||'#444'}22;color:${aColors[a]||'#aaa'};border:1px solid ${aColors[a]||'#555'}">${a}: ${c}</span>`;
  }
  document.getElementById('actTags').innerHTML = actHtml;

  // Factions
  let fHtml = '';
  for (const f of s.factions) {
    const emoji = f.grievance < 60 ? '✅' : f.grievance < 90 ? '⚠️' : '🔥';
    fHtml += `<div class="fac"><span class="facN">${emoji} ${f.name}</span> <span class="facP">(сила ${f.power})</span>`;
    fHtml += `<div class="facG">Обида: ${f.grievance}/100</div>`;
    fHtml += `<div class="bar"><div class="barFill griev" style="width:${f.grievance}%"></div></div></div>`;
  }
  document.getElementById('factions').innerHTML = fHtml;

  // Chronicle
  let cHtml = '';
  for (const e of s.chronicle) cHtml += `<div class="chEntry"><span class="chY">[${e.year} ${e.season}]</span> ${e.entry}</div>`;
  document.getElementById('chronicle').innerHTML = cHtml || '<div class="chEntry" style="color:#555">Хроника пуста</div>';

  // Recent
  let rHtml = '';
  for (const e of s.resolved) rHtml += `<div class="chEntry"><span class="chY">[${e.turn}]</span> ${e.title} → <b style="color:#4ec9b0">${e.choice}</b></div>`;
  document.getElementById('recentDec').innerHTML = rHtml || '<div class="chEntry" style="color:#555">Пока нет решений</div>';

  // Metrics
  document.getElementById('mEvents').textContent = s.metrics.totalEvents;
  document.getElementById('mDecisions').textContent = s.metrics.totalDecisions;
  document.getElementById('mWinters').textContent = s.metrics.wintersSurvived;
  document.getElementById('mPressure').textContent = s.metrics.maxPressure;

  // Priorities (sliders)
  if (!document.getElementById('priFood').dataset.init) {
    document.getElementById('priFood').value = s.priorities.food;
    document.getElementById('priStock').value = s.priorities.stockpile;
    document.getElementById('priBuild').value = s.priorities.build;
    document.getElementById('priFood').dataset.init = '1';
  }

  // Events popup
  if (s.pendingEvents.length > 0) {
    const ev = s.pendingEvents[0];
    const popup = document.getElementById('eventPopup');
    // Only rebuild if event changed (avoid killing clicks)
    if (popup.dataset.evId !== String(ev.id)) {
      popup.style.display = 'block';
      popup.className = `eventPopup ${ev.priority.toLowerCase()}`;
      let html = `<div class="evTitle">${ev.title}</div>`;
      html += `<div class="evText">${ev.text}</div>`;
      html += `<div class="evTimer" id="evTimer">Авто-решение через ${Math.ceil(ev.timer)}с</div>`;
      html += '<div class="evChoices">';
      ev.choices.forEach((ch, i) => {
        html += `<button class="evChoice" onclick="resolveEventUI(${ev.id}, ${i})"><b>${ch.label}</b><br><small>${ch.desc}</small></button>`;
      });
      html += '</div>';
      popup.innerHTML = html;
      popup.dataset.evId = ev.id;
      // Auto-pause when new event appears
      if (!WORLD.paused) {
        WORLD.paused = true;
        WORLD._wasPausedByEvent = true;
      }
    } else {
      // Just update timer
      const timerEl = document.getElementById('evTimer');
      if (timerEl) timerEl.textContent = `Авто-решение через ${Math.ceil(ev.timer)}с`;
    }
  } else {
    const popup = document.getElementById('eventPopup');
    popup.style.display = 'none';
    popup.dataset.evId = '';
    // Auto-unpause if was paused by event
    if (WORLD._wasPausedByEvent) {
      WORLD.paused = false;
      WORLD._wasPausedByEvent = false;
    }
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
