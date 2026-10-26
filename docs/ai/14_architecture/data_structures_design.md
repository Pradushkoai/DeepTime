---
статус: ACTIVE
дата_обновления: 2026-10-26
спецификация_id: T-002
версия: 1.0
стадия: 3 (Техническая архитектура)
вопросы: [ECS-компоненты, archetypes, системы]
зависимости: [../_meta/ai_working_principles.md, ../05_player/chief_design.md, ../04_settlements/zoning_design.md, ../04_settlements/migration_design.md, ../09_reforms/factions_design.md, ../09_reforms/stages_design.md, ../10_diplomacy/ai_neighbors_design.md, ../11_warfare/warfare_design.md, ../12_events/event_system_design.md, ../12_civilization_dynamics/degradation_design.md, engine_architecture_design.md]
---

# T-002: Структура данных (ECS) — Спецификация

> 📋 **Спецификация T-002** — ECS-компоненты, archetypes, системы. Как данные симуляции устроены в памяти.
>
> **Принцип**: POD-компоненты в contiguous массивах, системы как pure functions, queries для доступа.

---

## 🎯 Обзор

ECS (Entity Component System) — модель данных, где:
- **Entity** — ID (без данных)
- **Component** — POD struct (только данные, в contiguous массивах)
- **System** — логика (обрабатывает entity с определёнными компонентами)

**Archetype** — набор компонентов, описывающих тип сущности. Все entity одного archetype'а хранятся вместе (для кеш-локальности).

Эта спека описывает:
1. Все компоненты (POD struct'ы)
2. Все archetypes (типы сущностей)
3. Все системы (логика)
4. Связь с дизайн-спеками D-001..D-017

---

## 📦 Компоненты (POD struct'ы)

> Все компоненты — **POD (Plain Old Data)**: только поля, без методов, без ссылок на Entity (только ID). Это даёт кеш-локальность и сериализуемость.

### Идентичность и личность

#### `Identity`
```csharp
public struct Identity : IComponentData {
    public FixedString64 name;        // "Анна", "Борис"
    public int generation;            // поколение в династии
    public Gender gender;             // Male/Female/Other
    public int birthYear;             // год рождения
    public int deathYear;             // -1 если жив
}
```

#### `Traits`
```csharp
public struct Traits : IComponentData {
    public int trait1;                // ID черты (из каталога)
    public int trait2;
    public int trait3;
    public int trait4;                // -1 если нет
    public int trait5;                // -1 если нет
}
```

> Черты — врождённые, не меняются. 3-5 на вождя/гражданина. Каталог черт — ScriptableObject.

### Возраст и здоровье

#### `Age`
```csharp
public struct Age : IComponentData {
    public int years;                 // текущий возраст
    public int ageOfDeath;            // -1 если не умер, иначе год смерти
}
```

#### `Health`
```csharp
public struct Health : IComponentData {
    public int value;                 // 0-100
    public int injuryTimer;           // дни до выздоровления (0 = здоров)
    public DiseaseFlags diseases;     // bitfield: flu, infection, chronic, ...
}
```

### Навыки (D-003, GDD §7)

#### `Skills`
```csharp
public struct Skills : IComponentData {
    public byte hunt;                 // 0-100
    public byte gather;
    public byte fish;
    public byte farm;
    public byte herd;
    public byte smith;
    public byte build;
    public byte trade;
    public byte military;
    public byte religion;
    public byte research;
    public byte craft;
}
```

> 12 навыков (GDD §7). Хранить как byte (0-100) — 12 байт на гражданина.

### Потребности (GDD §7)

#### `Needs`
```csharp
public struct Needs : IComponentData {
    public byte hunger;               // 0-100 (100 = голодный)
    public byte fatigue;
    public byte safety;
    public byte social;
    public byte spiritual;
}
```

### Семья и собственность

#### `FamilyMembership`
```csharp
public struct FamilyMembership : IComponentData {
    public int familyId;              // ID семьи
    public FamilyRole role;           // Head/Spouse/Child/Elder
}
```

#### `Wallet`
```csharp
public struct Wallet : IComponentData {
    public long grainEquivalent;      // в эквиваленте зерна (универсальная единица)
    public long metalEquivalent;      // в эквиваленте меди/железа
    public long coins;                // после T-100 (монеты)
}
```

> Три валюты по стадиям экономики (D-006, money_stages.md). До T-100 — только grainEquivalent.

### Лояльность и религия

#### `Loyalty`
```csharp
public struct Loyalty : IComponentData {
    public byte toChief;              // 0-100
    public byte toFaction;            // ID фракции (если есть)
    public byte toFamily;             // 0-100
}
```

#### `Religion`
```csharp
public struct Religion : IComponentData {
    public int cultId;                // ID культа (из каталога)
    public byte devotion;             // 0-100
}
```

### Позиция (в мире)

#### `WorldPosition`
```csharp
public struct WorldPosition : IComponentData {
    public int hexId;                 // ID гекса (для глобальной карты)
    public float2 localPosition;      // позиция внутри локальной карты гекса (0..1)
    public byte isTraveling;          // 0 = в поселении, 1 = в пути
}
```

#### `TravelState`
```csharp
public struct TravelState : IComponentData {
    public int fromHexId;
    public int toHexId;
    public float progress;            // 0..1
    public TravelType type;           // Walk/Caravan/Expedition/Army/Migration
    public int arrivalTurn;           // ожидаемый ход прибытия
}
```

### Текущее действие (D-003, R7 explainability)

#### `CurrentAction`
```csharp
public struct CurrentAction : IComponentData {
    public ActionType type;           // Hunt/Gather/Fish/Farm/Smith/Build/Trade/Rest/...
    public int targetId;              // ID цели (здание/ресурс/гекс)
    public int startedTurn;
    public int expectedDuration;      // в ходах
}

public enum ActionType : byte {
    Idle, Hunt, Gather, Fish, Farm, Herd, Smith, Build, Trade,
    Rest, Worship, Travel, Migrate, Fight, Flee, Research
}
```

#### `ActionReason` (R7 — explainability)
```csharp
public struct ActionReason : IComponentData {
    public FixedString128 reason;     // "голод 70, навык охоты 80, приоритет племени = запасы"
    public FixedString128 alternative; // "Кузнечное дело — utility ниже (нет заказа)"
    public float utilityScore;        // числовое значение utility
}
```

> Этот компонент — основа R7 explainability. UI читает его для инспектора гражданина.

### Archetype: Citizen

Citizen = Identity + Traits + Age + Health + Skills + Needs + FamilyMembership + Wallet + Loyalty + Religion + WorldPosition + CurrentAction + ActionReason

**Размер**: ~200 байт (оценка)
**30 000 граждан**: ~6 МБ — подъёмно

---

## 🏛 Компоненты семьи (D-003)

#### `FamilyEntity`
```csharp
public struct FamilyEntity : IComponentData {
    public int familyId;
    public int headCitizenId;         // глава семьи
    public int settlementId;          // где живёт
    public FixedString64 surname;     // родовое имя
}
```

#### `FamilyProperty`
```csharp
public struct FamilyProperty : IComponentData {
    public long grainReserves;
    public long toolReserves;         // инструменты
    public int buildingId;            // дом семьи (-1 если бездомная)
    public byte inheritanceShares;    // для наследования (D-006)
}
```

#### `FamilySize`
```csharp
public struct FamilySize : IComponentData {
    public byte adults;
    public byte children;
    public byte elders;
    public byte total;
}
```

### Archetype: Family

Family = FamilyEntity + FamilyProperty + FamilySize

**Размер**: ~80 байт
**5 000-10 000 семей**: ~500 КБ — подъёмно

---

## 🏘️ Компоненты поселения (D-002, D-011)

#### `SettlementEntity`
```csharp
public struct SettlementEntity : IComponentData {
    public int settlementId;
    public int hexId;                 // где находится
    public SettlementType type;       // Camp/Village/Town/City/Capital
    public int population;            // текущее население
    public int foundedYear;
}

public enum SettlementType : byte {
    Camp,        // 5-50 чел. (палеолит)
    Village,     // 50-500
    Town,        // 500-5000
    City,        // 5000-50000
    Capital      // столица
}
```

#### `SettlementStockpile`
```csharp
public struct SettlementStockpile : IComponentData {
    public long grain;
    public long meat;
    public long wood;
    public long stone;
    public long metal;                // медь/бронза/железо
    public long tools;
    public long weapons;
    public long wealth;               // деньги (после T-100)
}
```

#### `SettlementVisibility` (D-007)
```csharp
public struct SettlementVisibility : IComponentData {
    public byte foodPressure;         // 0-100
    public byte housingPressure;
    public byte safetyPressure;
    public byte unemploymentRate;     // %
    public byte migrationFlow;        // +прибыло/-убыло
    public FixedString128 lastAlertReason; // "Голод −25: три неурожайных лета"
}
```

#### `SettlementBuildings`
```csharp
public struct SettlementBuildings : IComponentData {
    public int buildingCount;
    public int firstBuildingId;        // ID первого здания (linked list)
    // для больших поселений — separate BuildingSystem
}
```

### Archetype: Settlement

Settlement = SettlementEntity + SettlementStockpile + SettlementVisibility + SettlementBuildings

**Размер**: ~150 байт
**~50-500 поселений**: ~75 КБ

---

## 🏠 Компоненты зданий (D-002)

#### `BuildingEntity`
```csharp
public struct BuildingEntity : IComponentData {
    public int buildingId;
    public int typeId;                // ID типа здания (из каталога items/03_buildings.md)
    public int hexId;
    public int settlementId;
    public float2 localPosition;      // позиция в локальной карте гекса
    public byte condition;            // 0-100 (износ)
    public int builtYear;
}
```

#### `BuildingWorkers`
```csharp
public struct BuildingWorkers : IComponentData {
    public int workerCapacity;        // сколько работает
    public int workerCount;           // текущее
    public int workerIds1;            // ID граждан (4 на здание; для больших — extension)
    public int workerIds2;
    public int workerIds3;
    public int workerIds4;
}
```

#### `BuildingProduction`
```csharp
public struct BuildingProduction : IComponentData {
    public int inputResourceId;       // сырьё
    public int outputItemId;          // изделие
    public int productionRate;        // единиц/ход
    public int stockpile;             // накоплено
}
```

#### `AnchorComponent` (D-002 — якорь зонирования)
```csharp
public struct AnchorComponent : IComponentData {
    public AnchorType type;           // Natural/Declared/Built
    public int influenceRadius;       // гексов
    public byte influenceStrength;    // 0-100
}

public enum AnchorType : byte {
    Natural,    // река, пещера — с первого хода, нельзя снять
    Declared,   // священная роща — с первого хода, снимается ценой
    Built       // дорога, колодец — по технологиям, физически разрушается
}
```

### Archetype: Building

Building = BuildingEntity + BuildingWorkers + BuildingProduction (+ AnchorComponent если якорь)

**Размер**: ~120 байт (с якорем — ~140)
**10 000+ зданий**: ~1.4 МБ

---

## ⚔️ Компоненты фракций (D-004)

#### `FactionEntity`
```csharp
public struct FactionEntity : IComponentData {
    public int factionId;
    public FactionType type;          // Hunters/Priests/Elders/Farmers/Artisans/Merchants/Military/Bureaucrats/Scholars
    public int settlementId;          // где базируется (или -1 для государства)
}

public enum FactionType : byte {
    Hunters,     // палеолит
    Priests,     // палеолит
    Elders,      // палеолит
    Farmers,     // неолит
    Artisans,    // неолит
    Merchants,   // бронза
    Military,    // бронза
    Bureaucrats, // античность
    Scholars     // античность
}
```

#### `FactionPower`
```csharp
public struct FactionPower : IComponentData {
    public byte value;                // 0-100 (доля населения + богатства)
    public byte trend;                // 0=stable, 1=rising, 2=falling
}
```

#### `FactionGrievance`
```csharp
public struct FactionGrievance : IComponentData {
    public byte value;                // 0-100 (обида)
    public FixedString128 lastReason; // "40 лет не выделяли землю храму"
    public int sinceTurn;             // когда началась
}
```

> Grievance переживает вождя (D-004 — «память племени»).

#### `FactionAgenda`
```csharp
public struct FactionAgenda : IComponentData {
    public int priorityReformId;      // ID реформы, которую фракция хочет
    public int opposedReformId;       // ID реформы, которую против
    public byte intensity;            // 0-100 (насколько сильно)
}
```

#### `FactionHiddenLinks` (D-004 — скрытые связи)
```csharp
public struct FactionHiddenLinks : IComponentData {
    public int linkedFactionId;       // -1 если нет
    public int linkedAICivId;         // -1 если нет
    public byte linkStrength;         // 0-100
    public byte discoveredByPlayer;   // 0/1 (разведка)
}
```

### Archetype: Faction

Faction = FactionEntity + FactionPower + FactionGrievance + FactionAgenda + FactionHiddenLinks

**Размер**: ~200 байт
**3-9 фракций**: ~1.8 КБ

---

## 👑 Компоненты вождя (D-001)

> Вождь — это **особый Citizen** с дополнительными компонентами.

#### `ChiefComponent`
```csharp
public struct ChiefComponent : IComponentData {
    public int chiefId;               // ID citizen (entity)
    public ChiefEra era;              // YOUNG/MATURE/OLD/DECLINING
    public int reignStartYear;
    public byte legitimacy;           // 0-100
    public byte pressure;             // 0-100 (давление непоглощённого изменения)
}

public enum ChiefEra : byte {
    YOUNG,      // 16-30
    MATURE,     // 30-50
    OLD,        // 50-65
    DECLINING   // 65+
}
```

#### `ChiefHeir`
```csharp
public struct ChiefHeir : IComponentData {
    public int heirCitizenId;         // -1 если не назначен
    public int regentCitizenId;       // -1 если не нужен
    public byte regentYearsLeft;      // для малолетних
}
```

#### `ChiefAdaptations`
```csharp
public struct ChiefAdaptations : IComponentData {
    public int reformIds1;            // ID завершённых реформ (массив)
    public int reformIds2;
    public int reformIds3;
    public int reformIds4;
    public int reformIds5;
    public byte count;
}
```

#### `ChiefChronicle`
```csharp
public struct ChiefChronicle : IComponentData {
    public int firstEventId;          // linked list событий хроники
    public int eventCount;
    public byte hasWriting;           // 0/1 (T-037 алфавит) — определяет точность дат
}
```

### Archetype: Chief

Chief = Citizen + ChiefComponent + ChiefHeir + ChiefAdaptations + ChiefChronicle

**Размер**: Citizen (~200) + ~80 = ~280 байт
**1 вождь**: ~280 байт

---

## 🌍 Компоненты AI-цивилизаций (D-005)

> D-005: двухслойный AI. Слой 1 (макро) — всегда. Слой 2 (полная симуляция) — при контакте.

#### `AICivEntity`
```csharp
public struct AICivEntity : IComponentData {
    public int aiCivId;
    public int capitalHexId;
    public int archetypeId;           // из 8 архетипов (D-009)
    public byte contactLevel;         // 0=unknown, 1=known, 2=diplomacy, 3=trade, 4=ally, 5=vassal
    public byte layer;                // 1=macro, 2=full (D-005)
}
```

#### `AICivMacroState` (Слой 1 — макро)
```csharp
public struct AICivMacroState : IComponentData {
    public int population;
    public long wealth;
    public long treasury;
    public int armySize;
    public byte armyQuality;          // 0-10
    public int relationToPlayer;      // -100..+100
    public int techCount;
    public int techIds1;              // топ технологий (массив)
    public int techIds2;
    public int techIds3;
    public int techIds4;
    public int techIds5;
    // для больших списков — separate AICivTechSystem
}
```

#### `AICivFactions` (агрегат, не индивидуальные)
```csharp
public struct AICivFactions : IComponentData {
    public byte priestPower;
    public byte militaryPower;
    public byte merchantPower;
    public byte otherPower;           // сумма остальных
}
```

#### `AICivArc` (D-016 — арки соседей, Д2)
```csharp
public struct AICivArc : IComponentData {
    public AICivArcType type;         // None/Rising/Decaying/NomadicWave
    public int arcStartTurn;
    public int arcEndTurn;            // -1 если бесконечная
}

public enum AICivArcType : byte {
    None,
    Rising,         // восходящий сосед
    Decaying,       // загнивающая империя
    NomadicWave     // кочевая волна
}
```

### Archetype: AICiv

AICiv = AICivEntity + AICivMacroState + AICivFactions + AICivArc

**Размер**: ~150 байт
**10-50 AI-цивилизаций**: ~7.5 КБ

> При переключении на слой 2 (полная симуляция) — AICiv получает все компоненты обычного государства (settlements, factions, citizens).

---

## ⚔️ Компоненты армии (D-014)

> D-014: «армия = большая экспедиция». Юнит = экипировка (гражданин + предметы из каталогов).

#### `ArmyEntity`
```csharp
public struct ArmyEntity : IComponentData {
    public int armyId;
    public int commanderCitizenId;    // вождь/чемпион/генерал
    public int hexId;                 // текущая позиция
    public TravelState travel;        // если в движении
    public ArmyType type;             // Expedition/Raid/Army/Siege
    public byte morale;               // 0-100
}

public enum ArmyType : byte {
    Expedition,  // разведка/миссия
    Raid,        // палеолитный рейд (10-30 чел.)
    Army,        // полноценная армия
    Siege        // осадный корпус
}
```

#### `ArmySupply` (D-014 — снабжение как первичный параметр)
```csharp
public struct ArmySupply : IComponentData {
    public short daysOfSupply;        // дни снабжения (вместо HP!)
    public short dailyConsumption;    // расход в день
    public SupplySource source;       // Baggage/Purchase/Loot
}

public enum SupplySource : byte {
    Baggage,  // обоз (медленно, дорого)
    Purchase, // закупка у соседей (D-005)
    Loot      // грабёж (D-014 — мораль падает)
}
```

#### `ArmyUnits`
```csharp
public struct ArmyUnits : IComponentData {
    public int unitCount;
    public int firstUnitId;           // linked list юнитов
    // юнит = гражданин + экипировка (D-014 — юнит = экипировка)
}
```

### Archetype: Army

Army = ArmyEntity + ArmySupply + ArmyUnits + TravelState (если движется)

**Размер**: ~100 байт
**0-10 армий**: ~1 КБ

---

## 🐪 Компоненты караванов (D-005, Д4)

#### `CaravanEntity`
```csharp
public struct CaravanEntity : IComponentData {
    public int caravanId;
    public int fromSettlementId;
    public int toSettlementId;
    public int fromAICivId;           // -1 если местный
    public int toAICivId;
    public int hexId;                 // текущая позиция
    public TravelState travel;
    public TradeType type;            // Land/Sea/ViaIntermediary
}

public enum TradeType : byte {
    Land,            // караван (T-022 колесо)
    Sea,             // корабль (T-060a вёсельное, T-060b парусное)
    ViaIntermediary  // через посредника
}
```

#### `CaravanCargo`
```csharp
public struct CaravanCargo : IComponentData {
    public int itemId1;
    public int quantity1;
    public int itemId2;
    public int quantity2;
    public int itemId3;
    public int quantity3;
    public long goldValue;            // общая стоимость
}
```

### Archetype: Caravan

Caravan = CaravanEntity + CaravanCargo + TravelState

**Размер**: ~120 байт
**0-50 караванов**: ~6 КБ

---

## 🎉 Компоненты событий (D-016)

#### `EventEntity`
```csharp
public struct EventEntity : IComponentData {
    public int eventId;
    public EventType type;            // Trigger/Calendar/Narrative
    public int priority;              // для очереди отображения
    public int turnFired;
    public byte resolved;             // 0=pending, 1=resolved
}

public enum EventType : byte {
    Trigger,     // по условию
    Calendar,    // по частоте эпохи
    Narrative    // по арке/состоянию
}
```

#### `EventPayload`
```csharp
public struct EventPayload : IComponentData {
    public int titleId;               // ID строки из локализации
    public int portraitAssetId;       // ID ассета
    public int textId;                // ID строки
    public int choiceCount;           // 2-4
    public int choiceId1;
    public int choiceId2;
    public int choiceId3;
    public int choiceId4;
}
```

#### `EventChoice`
```csharp
public struct EventChoice : IComponentData {
    public int choiceId;
    public int textId;
    public int consequenceId;        // ID последствия (применяется при выборе)
    public byte requiresConfirmation; // 0/1
}
```

### Archetype: Event (pending)

Event (pending) = EventEntity + EventPayload + (2-4 × EventChoice)

**Размер**: ~150 байт + 4×40 = ~310 байт
**5-20 активных событий**: ~6 КБ

---

## ⚠️ Компоненты вырождения (D-017)

#### `DegradationState`
```csharp
public struct DegradationState : IComponentData {
    public int civilizationId;        // ID государства игрока или AI
    public byte stage;                // 0=none, 1=stagnation, 2=decline, 3=crisis, 4=collapse, 5=dark age, 6=renaissance
    public int stageStartTurn;
    public byte precursorFlags;       // bitfield предвестников (см. D-017)
}
```

#### `DegradationCauses` (5 категорий из GDD §16)
```csharp
public struct DegradationCauses : IComponentData {
    public byte demographic;          // 0-100 (депопуляция, миграция, старение)
    public byte environmental;        // истощение почв, засуха, месторождения
    public byte military;             // поражение, перенапряжение, вторжение
    public byte social;               // мятеж, раскол, бюрократия
    public byte cultural;             // ассимиляция, утрата знаний, шок
}
```

### Archetype: Civilization (meta-entity для государства игрока/AI)

Civilization = DegradationState + DegradationCauses + (статистика)

**Размер**: ~80 байт
**1 игрок + 10-50 AI**: ~4 КБ

---

## 🗺️ Компоненты гекса (T-004 подробно)

#### `HexEntity`
```csharp
public struct HexEntity : IComponentData {
    public int hexId;                 // 0..64799
    public int2 axialCoord;           // (q, r) — offset/axial coords
    public float2 latLon;             // широта/долгота центра
}
```

#### `HexTerrain` (статическое, из генерации мира)
```csharp
public struct HexTerrain : IComponentData {
    public byte terrainType;          // Mountain/Forest/Swamp/Steppe/Desert/Tundra/...
    public byte biome;                // BIOME 6000
    public short elevationMeters;     // высота над уровнем моря
    public byte fertility;            // 0-100
    public byte waterAccess;          // 0-100
    public byte climateZone;          // Koppen-Geiger
}
```

#### `HexResources` (статическое)
```csharp
public struct HexResources : IComponentData {
    public int surfaceResourceId1;    // 3 поверхностных
    public int surfaceResourceId2;
    public int surfaceResourceId3;
    public int subsurfaceResourceId1; // 2 подповерхностных
    public int subsurfaceResourceId2;
    public int deepResourceId1;       // 1 глубокий
    public byte availabilityFlags;    // bitfield: какие доступны (по техам)
}
```

#### `HexFaunaFlora` (статическое)
```csharp
public struct HexFaunaFlora : IComponentData {
    public int faunaCount;
    public int firstFaunaId;          // linked list
    public int floraCount;
    public int firstFloraId;
    public byte faunaRichness;        // 0-100 (для D-009 — мегафауна)
}
```

#### `HexPolitical` (динамическое)
```csharp
public struct HexPolitical : IComponentData {
    public int ownerId;               // ID государства (-1 = дикий)
    public int settlementId;          // -1 если нет
    public byte controlledSince;      // год захвата
}
```

#### `HexVisibility` (D-013 — динамическое)
```csharp
public struct HexVisibility : IComponentData {
    public VisibilityState state;     // Unknown/Observed/InMemory/Known
    public int lastObservedTurn;      // для устаревания InMemory
    public byte staleFlags;           // что устарело (постройки, войска, ресурсы)
}

public enum VisibilityState : byte {
    Unknown,    // никогда не видел
    Observed,   // прямо сейчас вижу
    InMemory,   // видел, устаревает
    Known       // общие знания (география)
}
```

### Archetype: Hex

Hex = HexEntity + HexTerrain + HexResources + HexFaunaFlora + HexPolitical + HexVisibility

**Размер**: ~80 байт
**64 800 гексов**: ~5.2 МБ

---

## 🔄 Системы (логика)

> Системы — pure functions от компонентов. Каждая система имеет частоту тика (см. T-003).

### Системы гражданина (1/сек — близкие к камере)

#### `CitizenNeedSystem`
- **Запрос**: Citizen с Needs
- **Логика**: голод растёт со временем, усталость от работы, безопасность от угроз
- **Запись**: обновляет Needs
- **Связь**: GDD §7, D-003

#### `CitizenActionSystem`
- **Запрос**: Citizen с Needs + Skills + CurrentAction + ActionReason
- **Логика**: вычисляет utility score для каждого ActionType, выбирает максимальный
- **Запись**: обновляет CurrentAction + ActionReason (R7 explainability)
- **Формула**: `utility = needs × values × (has_vacancy) × edicts` (D-003)
- **Связь**: D-003, D-007 (подпись причины)

#### `CitizenMovementSystem`
- **Запрос**: Citizen с WorldPosition + CurrentAction
- **Логика**: двигает к цели действия
- **Запись**: обновляет WorldPosition.localPosition
- **Связь**: GDD §7

### Системы семьи (1/10сек)

#### `FamilySystem`
- **Запрос**: Family + FamilySize + FamilyProperty
- **Логика**: ролям, потребление ресурсов, рождение детей (D-001 наследник)
- **Запись**: обновляет FamilySize, FamilyProperty
- **Связь**: D-001, D-003

### Системы поселения (1/мин)

#### `ProductionSystem`
- **Запрос**: Building + BuildingWorkers + BuildingProduction
- **Логика**: производство изделий из сырья
- **Запись**: обновляет BuildingProduction.stockpile, SettlementStockpile
- **Связь**: GDD §7, D-002

#### `MigrationSystem` (D-003)
- **Запрос**: Citizen с Loyalty + Skills + WorldPosition
- **Логика**: решает переезд по формуле D-003
- **Запись**: создаёт TravelState с type=Migrate
- **Связь**: D-003

#### `FactionSystem` (D-004)
- **Запрос**: Faction + FactionPower + FactionGrievance
- **Логика**: обновляет силу (доля населения + богатства), обиду
- **Запись**: обновляет FactionPower, FactionGrievance
- **Связь**: D-004

### Системы глобальные (1/5мин, 1/30мин, 1/ход)

#### `TradeSystem` (1/5мин)
- **Запрос**: Caravan + CaravanCargo + AICivMacroState
- **Логика**: цены, движение караванов
- **Запись**: обновляет CaravanEntity.hexId, AICivMacroState.wealth
- **Связь**: D-005

#### `DiplomacySystem` (1/30мин, D-005)
- **Запрос**: AICivEntity + AICivMacroState
- **Логика**: дипломатические акции
- **Запись**: обновляет AICivEntity.contactLevel, AICivMacroState.relationToPlayer
- **Связь**: D-005

#### `WarSystem` (1/30мин, D-014)
- **Запрос**: Army + ArmySupply + ArmyUnits + AICivEntity
- **Логика**: военные кампании, битвы, осады
- **Запись**: обновляет ArmySupply, ArmyEntity.morale, население (потери)
- **Связь**: D-014

#### `EventSystem` (1/ход, D-016 — подробно в T-005)
- **Запрос**: все состояния
- **Логика**: проверяет триггеры, генерирует события, предлагает выборы игроку
- **Запись**: создаёт EventEntity
- **Связь**: D-016

#### `TechSystem` (1/ход)
- **Запрос**: Civilization + (статистика исследований)
- **Логика**: прогресс по приоритетным технологиям (D-004 + research_system R3)
- **Запись**: открывает технологии, обновляет прогресс
- **Связь**: research_system, D-015 (R3 перекалибровка)

#### `DegradationSystem` (1/ход, D-017)
- **Запрос**: Civilization + DegradationState + DegradationCauses
- **Логика**: обновляет стадии деградации по 5 категориям причин
- **Запись**: обновляет DegradationState.stage
- **Связь**: D-017

#### `ChiefSystem` (1/ход, D-001)
- **Запрос**: Chief + ChiefComponent + ChiefHeir
- **Логика**: обновляет давление (R9 — предохранители), эру, проверяет смерть, наследование
- **Запись**: обновляет ChiefComponent, при смерти — создаёт событие E-CHIEF-SUCCESSION (D-016)
- **Связь**: D-001, D-004 (кризис ×3.0 = max), D-016

#### `VisibilitySystem` (1/сек, D-013)
- **Запрос**: Hex + HexVisibility + (сословные посты/разведчики)
- **Логика**: обновляет состояния видимости гексов
- **Запись**: обновляет HexVisibility
- **Связь**: D-013

---

## 📊 Профиль памяти (оценка)

| Archetype | Кол-во | Размер | Итого |
|---|---|---|---|
| Citizen | 30 000 | 200 байт | 6 МБ |
| Family | 10 000 | 80 байт | 800 КБ |
| Settlement | 500 | 150 байт | 75 КБ |
| Building | 10 000 | 120 байт | 1.2 МБ |
| Faction | 9 (×государств) | 200 байт | ~50 КБ |
| Chief | 1 | 280 байт | 280 байт |
| Army | 10 | 100 байт | 1 КБ |
| Caravan | 50 | 120 байт | 6 КБ |
| AICiv | 50 | 150 байт | 7.5 КБ |
| Event (pending) | 20 | 310 байт | 6 КБ |
| Hex | 64 800 | 80 байт | 5.2 МБ |
| Civilization (meta) | 51 | 80 байт | 4 КБ |
| **ИТОГО** | | | **~13.3 МБ** |

> 13 МБ — это **только данные симуляции**. Рендер (меши, текстуры) — отдельно, управляется GPU.

---

## ✅ Чек-лист готовности спеки

- [x] Определены все компоненты (POD struct'ы)
- [x] Определены все archetypes (типы сущностей)
- [x] Определены все системы (логика)
- [x] Связь с каждой дизайн-спекой (D-001..D-017)
- [x] Профиль памяти (оценка ~13 МБ)
- [x] Принцип POD (только данные, без методов)
- [x] Принцип queries (запросы по компонентам)
- [x] R7 explainability — компонент ActionReason
- [x] D-013 — компонент HexVisibility
- [x] D-014 — компонент ArmySupply (дни снабжения вместо HP)
- [x] D-016 — компоненты EventEntity/EventPayload/EventChoice
- [x] D-017 — компоненты DegradationState/DegradationCauses
- [x] D-005 — двухслойный AI (layer 1/2)
- [x] D-005 — арки соседей (AICivArc)

---

## 📚 Источники

- GDD §7 (гражданин как личность, utility score, 8 полей)
- D-001 Вождь (ChiefComponent, ChiefHeir, ChiefChronicle)
- D-002 Зонирование (AnchorComponent, BuildingEntity)
- D-003 Миграция (TravelState, MigrationSystem)
- D-004 Фракции (FactionEntity, FactionGrievance, FactionHiddenLinks)
- D-005 AI соседей (AICivEntity, двухслойный, AICivArc)
- D-006 Собственность (Wallet, три валюты)
- D-007 Видимость (SettlementVisibility, ActionReason)
- D-009 Альт. пути (HexFaunaFlora.faunaRichness для мегафауны)
- D-011 Стадии (SettlementType)
- D-013 Туман войны (HexVisibility, 4 состояния)
- D-014 Военное дело (ArmySupply, ArmyType, юнит = экипировка)
- D-015 Контракт сессии (частоты тика — см. T-003)
- D-016 События (EventEntity, EventPayload, EventChoice)
- D-017 Вырождение (DegradationState, DegradationCauses)
- Внешний аудит Модели B (R7 explainability)

---

## Связанные файлы

- [`README.md`](README.md) — обзор Стадии 3
- [`engine_architecture_design.md`](engine_architecture_design.md) — T-001 Архитектура движка
- [`../05_player/chief_design.md`](../05_player/chief_design.md) — D-001 Вождь
- [`../04_settlements/zoning_design.md`](../04_settlements/zoning_design.md) — D-002 Зонирование
- [`../04_settlements/migration_design.md`](../04_settlements/migration_design.md) — D-003 Миграция
- [`../09_reforms/factions_design.md`](../09_reforms/factions_design.md) — D-004 Фракции
- [`../10_diplomacy/ai_neighbors_design.md`](../10_diplomacy/ai_neighbors_design.md) — D-005 AI соседей
- [`../11_warfare/warfare_design.md`](../11_warfare/warfare_design.md) — D-014 Военное дело
- [`../12_events/event_system_design.md`](../12_events/event_system_design.md) — D-016 События
- [`../12_civilization_dynamics/degradation_design.md`](../12_civilization_dynamics/degradation_design.md) — D-017 Вырождение
- [`../13_technical/fog_of_war_design.md`](../13_technical/fog_of_war_design.md) — D-013 Туман войны
