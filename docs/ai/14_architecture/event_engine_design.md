---
статус: ACTIVE
дата_обновления: 2026-10-26
спецификация_id: T-005
версия: 1.0
стадия: 3 (Техническая архитектура)
вопросы: [EventSystem, генератор событий, приоритеты, очередь]
зависимости: [../_meta/ai_working_principles.md, ../12_events/event_system_design.md, ../05_player/chief_design.md, ../09_reforms/factions_design.md, ../10_diplomacy/ai_neighbors_design.md, engine_architecture_design.md, data_structures_design.md, lod_simulation_design.md]
---

# T-005: Система событий (движок) — Спецификация

> 📋 **Спецификация T-005** — реализация D-016 Система событий. Как движок событий работает под капотом: 3 слоя генерации, очередь, приоритеты, пауза для выбора.
>
> **Принцип**: 1 событие с решением / 5-10 минут (D-016). Событие = один вопрос за раз с лицом и текстом, не строка в логе.

---

## 🎯 Обзор

D-016 описывает **дизайн** системы событий (типы, форматы, частоты). Эта спека описывает **реализацию**:
1. EventSystem как ECS-система
2. 3 слоя генерации (Trigger/Calendar/Narrative)
3. Очередь событий с приоритетами
4. Пауза симуляции для выбора игрока
5. Применение последствий (consequences)
6. Связь с EventBus (для UI)
7. Локализация

---

## 🏗 Архитектура EventSystem

### 3 подсистемы

```
EventSystem (1/ход)
├── TriggerGenerator      // проверяет условия, создаёт TriggerEvents
├── CalendarGenerator     // по частоте эпохи, создаёт CalendarEvents
├── NarrativeGenerator    // по аркам/состоянию, создаёт NarrativeEvents
├── EventQueue            // очередь с приоритетами
├── EventResolver         // применяет выборы игрока
└── EventBus              // уведомляет UI
```

### Поток данных

```
1. EventSystem.Update() (1/ход):
   a. TriggerGenerator — проверяет все триггеры, создаёт TriggerEvents
   b. CalendarGenerator — по частоте эпохи, создаёт CalendarEvents
   c. NarrativeGenerator — по аркам соседей, создаёт NarrativeEvents
   d. EventQueue.Enqueue(events) — добавляет в очередь с приоритетами

2. EventQueue — сортирует по приоритету:
   - CRITICAL (мятеж, осада, смерть вождя)
   - HIGH (культурный шок, милстоун)
   - NORMAL (свадьба, смерть гражданина, ритуал)
   - LOW (мелкие позитивные)

3. UI показывает верхнее событие:
   - Диалог: портрет + текст + 2-4 выбора
   - Симуляция ПАУЗИРОВАНА (1/ход системы ждут)
   - 1/сек системы продолжаются (мир живёт)

4. Игрок выбирает → EventResolver.Apply(choice):
   - Применяет consequence (изменения в ECS)
   - Записывает в хронику (D-001)
   - EventBus.Publish(eventResolved)
   - EventQueue.Dequeue()

5. Если в очереди ещё события — показываем следующее
6. Когда очередь пуста — 1/ход системы продолжают
```

---

## 📋 Каталог триггеров

> Триггеры — это **условия**, при которых создаётся TriggerEvent. Каждый триггер — это функция `bool Check(WorldState)`.

### Триггеры вождя (D-001)

| Trigger ID | Условие | Событие |
|---|---|---|
| `TRIGGER_CHIEF_DEATH` | ChiefComponent.health == 0 OR ChiefComponent.pressure >= 100 | E-CHIEF-SUCCESSION (выбор «Долг отцов» / «Новая метла» — R9) |
| `TRIGGER_HEIR_ADULT` | ChiefHeir.heirCitizenId != -1 AND heir.Age >= 16 | E-HEIR_COMES_OF_AGE (назначить или отстранить — D-001) |
| `TRIGGER_PRESSURE_HIGH` | ChiefComponent.pressure > 80 | E-PRESSURE_WARNING (предложение реформы) |
| `TRIGGER_ERA_DECLINING` | ChiefComponent.age >= 65 AND ChiefComponent.era != DECLINING | E-ERA_TRANSITION (переход в DECLINING) |

### Триггеры фракций (D-004)

| Trigger ID | Условие | Событие |
|---|---|---|
| `TRIGGER_FACTION_GRIEVANCE_HIGH` | FactionGrievance.value > 80 | E-GRIEVANCE_WARNING (требование реформы) |
| `TRIGGER_REBEL_WINDOW` | FactionGrievance > 80 AND (голод OR поражение OR давление вождя > 90) | E-REBEL_THREAT (мятеж × max, не произведение — R9) |
| `TRIGGER_FACTION_CHAMPION` | FactionPower > 70 AND FactionGrievance < 30 | E-CHAMPION_PROPOSES (чемпион реформ — GDD §14) |

### Триггеры соседей (D-005, Д2)

| Trigger ID | Условие | Событие |
|---|---|---|
| `TRIGGER_CULTURE_SHOCK` | AICivMacroState.techCount > player.techCount × 1.5 (при контакте) | E-CULTURE_SHOCK (4 реакции — glossary) |
| `TRIGGER_RISING_NEIGHBOR` | AICivArc.type == Rising AND arcStartTurn + 100 < currentTurn | E-RISING_NEIGHBOR (Д2 арка) |
| `TRIGGER_DECAYING_EMPIRE` | AICivArc.type == Decaying AND stage >= 2 (D-017) | E-DECAYING_NEIGHBOR (Д2 арка) |
| `TRIGGER_NOMADIC_WAVE` | AICivArc.type == NomadicWave AND AICivEntity.hexId near player | E-NOMADIC_WAVE (Д2 арка) |

### Триггеры вырождения (D-017)

| Trigger ID | Условие | Событие |
|---|---|---|
| `TRIGGER_DEGRADATION_STAGE_UP` | DegradationCauses.demographic > 70 AND stage == 0 | E-DEGRADATION_STAGNATION (стадия 1) |
| `TRIGGER_DEGRADATION_COLLAPSE` | DegradationState.stage == 3 AND首都 threatened | E-DEGRADATION_COLLAPSE (стадия 4) |
| `TRIGGER_DARK_AGE` | DegradationState.stage == 4 AND утрачена письменность | E-DARK_AGE (стадия 5) |
| `TRIGGER_RENAISSANCE` | DegradationState.stage == 5 AND молодой лидер | E-RENAISSANCE (стадия 6) |

### Триггеры войны (D-014)

| Trigger ID | Условие | Событие |
|---|---|---|
| `TRIGGER_ARMY_SPOTTED` | ArmyEntity в Observed гексе (D-013) | E-ARMY_SPOTTED (мобилизация/переговоры/ожидание) |
| `TRIGGER_SIEGE_BROKEN` | ArmySupply.daysOfSupply < 10 (осаждённый) | E-SIEGE_BROKEN (капитуляция/прорыв) |

### Триггеры милстоунов (Д8)

| Trigger ID | Условие | Событие |
|---|---|---|
| `TRIGGER_MILESTONE_HORDE` | archetype == Steppe AND army.unitCount >= 100 | E-MILESTONE_HORDE (Д8 милстоун 1) |
| `TRIGGER_MILESTONE_CANAL` | archetype == RiverValley AND построен канал | E-MILESTONE_CANAL (Д8 милстоун 2) |
| ... | (по 8 архетипам × 3 милстоуна) | ... |

### Триггеры позитивные (R6)

| Trigger ID | Условие | Событие |
|---|---|---|
| `TRIGGER_FIRST_POT` | production.firstItemTypeId == POT (впервые) | E-FIRST_POT (R6 — Хроника дня) |
| `TRIGGER_MASTER` | citizen.Skills.max >= 90 | E-MASTER (R6) |
| `TRIGGER_CARAVAN_RETURN` | CaravanEntity.travel.progress >= 1.0 AND type == RETURN | E-CARAVAN_RETURN (R6) |
| `TRIGGER_BIRTH_NOTABLE` | FamilySize.children == 1 AND family is notable | E-BIRTH (R6) |

---

## 📅 Календарные события (по частоте эпохи)

> CalendarGenerator создаёт события по расписанию, независимо от триггеров.

| Эпоха | Частота | Что |
|---|---|---|
| Палеолит | 1/сезон | Ритуал года, сезонная миграция стад, зима |
| Неолит | 1/год | Праздник урожая, свадьбы заметных граждан |
| Бронза | 1/год | Торговые праздники, поминальные ритуалы |
| Железо | 1/год | Летописец записывает год (D-001 хроника) |
| Античность+ | 1/5лет | Государственные ритуалы, триумфы |

### Реализация CalendarGenerator

```csharp
public class CalendarGenerator {
    public void Update(int currentTurn, Epoch epoch) {
        // Для каждой эпохи — свой список календарных событий
        var events = calendarCatalog[epoch];
        foreach (var ev in events) {
            if (currentTurn % ev.frequencyYears == 0) {
                // Создаём CalendarEvent
                eventSystem.CreateEvent(ev);
            }
        }
    }
}
```

---

## 🎭 Нарративные события (по аркам)

> NarrativeGenerator создаёт события на основе долгосрочных арок (D-016).

| Арка | Тип события | Когда |
|---|---|---|
| Восходящий сосед (Д2) | E-RISING_NEIGHBOR_PROGRESS | Каждые 50 лет, пока арка активна |
| Загнивающая империя (Д2) | E-DECAYING_NEIGHBOR_PROGRESS | Каждые 30 лет |
| Кочевая волна (Д2) | E-NOMADIC_WAVE_PHASE | Каждые 10 лет (4 фазы: разведчики → дань → осада → захват) |
| Милстоун (Д8) | E-MILESTONE_PROGRESS | При достижении 50% условий |

---

## 🎯 Очередь событий (EventQueue)

> Несколько событий могут сработать одновременно. Нужно показывать по одному, в порядке приоритета.

### Приоритеты

```csharp
public enum EventPriority : byte {
    CRITICAL = 0,    // смерть вождя, мятеж, осада
    HIGH = 1,        // культурный шок, милстоун, коллапс
    NORMAL = 2,      // свадьба, смерть гражданина, ритуал
    LOW = 3,         // мелкие позитивные
    BACKGROUND = 4   // для лога, без диалога
}
```

### Правила очереди

1. **CRITICAL** — показывается немедленно, прерывает любые другие
2. **HIGH** — показывается после CRITICAL, до NORMAL
3. **NORMAL** — показывается в порядке FIFO
4. **LOW** — показывается, если нет NORMAL/HIGH/CRITICAL
5. **BACKGROUND** — не показывается, пишется в хронологию (D-001)

### Лимит очереди

- **Максимум 5 событий** в очереди на показ (остальное — в BACKGROUND)
- Если одновременно 5+ CRITICAL — показывается 3 самых критичных, остальные становятся HIGH
- Это не даёт игроку «завалить» событиями

### Связанные события

Некоторые события — последовательности:
- E-CHIEF_DEATH → E-CHIEF_SUCCESSION → E-HEIR_CONFIRMATION → E-CORONATION

Реализация: поле `nextEventId` в EventEntity. После resolve — автоматически создаётся следующее.

---

## ⏸️ Пауза для выбора

> Когда показывается событие с выбором — симуляция **паузируется** (1/ход системы), но 1/сек системы продолжаются.

### Состояния паузы

```csharp
public enum SimulationPauseState : byte {
    Running,        // нормальный ход
    PausedForEvent, // ждём выбора в событии
    PausedByPlayer, // игрок нажал паузу вручную
    PausedForUI     // открыто меню (технологии, реформы)
}
```

### Что останавливается при PausedForEvent

- `EventSystem` (1/ход) — ждёт resolve
- `TechSystem` (1/ход) — ждёт
- `DegradationSystem` (1/ход) — ждёт
- `ChiefSystem` (1/ход) — ждёт

### Что продолжается при PausedForEvent

- `CitizenNeedSystem` (1/сек) — голод растёт
- `CitizenActionSystem` (1/сек) — граждане действуют
- `CitizenMovementSystem` (1/сек) — двигаются
- `VisibilitySystem` (1/сек) — туман войны обновляется
- `ProductionSystem` (1/мин) — производство идёт
- `MigrationSystem` (1/мин) — миграция идёт

### Автопауза 1/сек

> Если игрок думает > 30 секунд — 1/сек системы тоже паузируются. Мир замирает полностью. Это не даёт ситуации «пока игрок думал, голод убил всех».

```csharp
if (pauseTimer > 30.0f) {
    pauseState = SimulationPauseState.PausedByEvent;
    // Останавливаем даже 1/сек системы
}
```

---

## ✅ EventResolver — применение выбора

> После выбора игрока — применяем consequence.

### Структура consequence

```csharp
public struct EventConsequence {
    public ConsequenceType type;
    public int targetEntityId;
    public int valueChange;
    public FixedString128 reason;     // для хроники (D-001)
    public int nextEventId;           // -1 если нет продолжения
}

public enum ConsequenceType : byte {
    ChiefPressureChange,
    ChiefLegitimacyChange,
    FactionGrievanceChange,
    FactionPowerChange,
    SettlementStockpileChange,
    CitizenLoyaltyChange,
    AICivRelationChange,
    TechProgressChange,
    DegradationStageChange,
    CreateArmy,
    CreateCaravan,
    StartReform,
    // ... расширяемо
}
```

### Пример: E-CHIEF_SUCCESSION

```
EVENT_ID: E-CHIEF-SUCCESSION
ВЫБОРЫ:
  [A] «Долг отцов»:
    consequences:
      - ChiefPressureChange(target=heir, value=+0)  // наследуется полностью
      - ChiefPressureChange(target=heir, value=-5/year)  // гасится 5/год
      - FactionGrievanceChange(target=father_clan, value=+10)
      - ChronicleWrite("Наследник принял долг отцов")
    nextEventId: E-CORONATION
  
  [B] «Новая метла»:
    consequences:
      - ChiefPressureChange(target=heir, value=-100)  // обнулить
      - ChiefLegitimacyChange(target=heir, value=-30)
      - FactionGrievanceChange(target=father_clan, value=+20)
      - TechProgressChange(target=current_reform, value=+20%)  // шанс реформ +20%
      - ChronicleWrite("Новая метла сметает прошлое")
    nextEventId: E-CORONATION
```

---

## 📡 EventBus — уведомление UI

> UI не опрашивает EventSystem. Вместо этого EventSystem публикует события, UI подписывается.

### События EventBus

```csharp
// EventBus events
public struct EventFired { public int eventId; public EventPriority priority; }
public struct EventResolved { public int eventId; public int choiceId; }
public struct EventQueueChanged { public int queueLength; }
```

### Подписки UI

```csharp
public class EventDialogUI : MonoBehaviour {
    void OnEnable() {
        EventBus.Subscribe<EventFired>(OnEventFired);
        EventBus.Subscribe<EventResolved>(OnEventResolved);
    }
    
    void OnEventFired(EventFired e) {
        // Показать диалог
        var event = eventSystem.GetEvent(e.eventId);
        ShowDialog(event);
    }
    
    void OnEventResolved(EventResolved e) {
        // Закрыть диалог
        HideDialog();
    }
}
```

---

## 🌐 Локализация

> Все тексты событий — в каталоге локализации, не в коде.

### Структура

```
Assets/_Data/Localization/
├── ru.json      # русский
├── en.json      # английский
├── uk.json      # украинский
└── ...
```

### Формат

```json
{
  "E_CHIEF_SUCCESSION_TITLE": "[Имя наследника] вступает на престол",
  "E_CHIEF_SUCCESSION_TEXT": "[Имя] принял власть. Давление от отца: [value]. Как поступить?",
  "E_CHIEF_SUCCESSION_CHOICE_A": "Долг отцов",
  "E_CHIEF_SUCCESSION_CHOICE_A_DESC": "Давление наследуется полностью (100%), но гасится годами (по 5/год)",
  "E_CHIEF_SUCCESSION_CHOICE_B": "Новая метла",
  "E_CHIEF_SUCCESSION_CHOICE_B_DESC": "Давление обнуляется (0%), но ценой легитимности/обиды"
}
```

### Подстановки

- `[Имя наследника]` → `Identity.name` наследника
- `[value]` → `ChiefComponent.pressure`
- `[Фракция]` → `FactionEntity.type` локализованное
- `[Сосед]` → `AICivEntity.archetypeId` локализованное

---

## 📊 Профиль нагрузки

| Операция | Частота | Нагрузка |
|---|---|---|
| TriggerGenerator (1/ход) | проверка ~50 триггеров | ~1 ms |
| CalendarGenerator (1/ход) | проверка ~20 событий | ~0.5 ms |
| NarrativeGenerator (1/ход) | проверка ~10 арок | ~0.5 ms |
| EventQueue (per event) | insert + sort | ~0.1 ms |
| EventResolver (per choice) | apply consequences | ~0.5 ms |
| EventBus publish | ~5-20 events/ход | ~1 ms |

**ИТОГО**: ~3-5 ms/ход — пренебрежимо мало.

---

## ✅ Чек-лист готовности спеки

- [x] 3 подсистемы (Trigger/Calendar/Narrative)
- [x] Каталог триггеров (~50)
- [x] Календарные события по эпохам
- [x] Нарративные события по аркам
- [x] Очередь с приоритетами (5 уровней)
- [x] Лимит очереди (5 событий на показ)
- [x] Связанные события (nextEventId)
- [x] Пауза для выбора (1/ход пауза, 1/сек продолжается)
- [x] Автопауза 1/сек при > 30 сек
- [x] EventResolver (применение consequences)
- [x] EventBus (уведомление UI)
- [x] Локализация (JSON, подстановки)
- [x] Профиль нагрузки (~3-5 ms/ход)

---

## 📚 Источники

- D-016 Система событий (дизайн — все типы, форматы, частоты)
- D-001 Вождь (E-CHIEF-SUCCESSION, хроника)
- D-004 Фракции (мятеж, обида, чемпион)
- D-005 AI соседей (культурный шок, арки Д2)
- D-013 Туман войны (E-ARMY_SPOTTED)
- D-014 Военное дело (E-SIEGE_BROKEN)
- D-017 Вырождение (4 стадии → события)
- D-015 Контракт сессии (пауза для выбора)
- Аудит Модели B (R6 — Хроника дня, R9 — предохранители, Д2 — арки, Д8 — милстоуны)

---

## Связанные файлы

- [`README.md`](README.md) — обзор Стадии 3
- [`engine_architecture_design.md`](engine_architecture_design.md) — T-001 Архитектура движка (EventBus)
- [`data_structures_design.md`](data_structures_design.md) — T-002 Структура данных (EventEntity, EventPayload, EventChoice)
- [`../12_events/event_system_design.md`](../12_events/event_system_design.md) — D-016 Система событий (дизайн)
- [`../05_player/chief_design.md`](../05_player/chief_design.md) — D-001 Вождь (E-CHIEF_SUCCESSION)
