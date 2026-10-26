---
статус: ACTIVE
дата_обновления: 2026-10-26
спецификация_id: T-006
версия: 1.0
стадия: 3 (Техническая архитектура)
вопросы: [Save/Load, сериализация, replay, мультиплеер]
зависимости: [../_meta/ai_working_principles.md, engine_architecture_design.md, data_structures_design.md, lod_simulation_design.md]
---

# T-006: Save/Load — Спецификация

> 📋 **Спецификация T-006** — сериализация состояния симуляции. Поддержка save/load, replay, мультиплеера (Q-018).
>
> **Принцип**: детерминизм от seed + input log. Можно сохранять только input, а не всё состояние — но для удобства игрока сохраняем и snapshot.

---

## 🎯 Обзор

GDD §19 определяет: «Хранение сейвов — SQLite (легче) или BSON». Эта спека уточняет:
1. Что сохраняем (snapshot vs input log)
2. Формат (SQLite + BSON hybrid)
3. Версионирование (миграции схем)
4. Replay (playback input log)
5. Мультиплеер (Q-018 — синхронизация input)
6. Автосейв

---

## 💾 Что сохраняем

### 3 уровня сохранений

| Уровень | Что | Размер | Когда |
|---|---|---|---|
| **L1: Input Log** | Все действия игрока (эдикты, реформы, выборы в событиях) | ~1 КБ/ход | Всегда (в памяти) |
| **L2: Snapshot** | Полное состояние ECS на ход N | ~13 МБ | Автосейв каждые 10 ходов |
| **L3: Full Save** | Snapshot + Input Log + метаданные | ~14 МБ | По команде игрока |

### L1: Input Log (минимальный)

```
InputLogEntry {
    int turn;                  // ход
    PlayerActionType type;     // Edict/Reform/EventChoice/Priority/...
    int payloadHash;           // хэш параметров (для детерминизма)
    byte[] payload;            // сериализованные параметры
}
```

**Размер**: ~100-500 байт/запись. За 1000 ходов — ~500 КБ.

### L2: Snapshot (полное состояние)

Содержит все ECS-компоненты:
- Все 30 000 граждан (~6 МБ)
- Все 10 000 семей (~800 КБ)
- Все 10 000 зданий (~1.2 МБ)
- Все 64 800 гексов (HexPolitical + HexVisibility, статичное — пропускаем) (~1 МБ)
- Все фракции, вожди, армии, караваны, AI-цивилизации, события (~50 КБ)
- Метаданные (seed, текущий ход, темп игрока) (~1 КБ)

**ИТОГО**: ~13 МБ на snapshot.

### L3: Full Save = Snapshot + Input Log

- Snapshot на ход N
- Input Log от хода N до текущего
- Метаданные (имя сейва, дата, скриншот)

---

## 🗄️ Формат хранения

### Гибрид SQLite + BSON

> SQLite — для метаданных и индексов. BSON — для бинарных blob'ов (snapshot, input log).

### Структура SQLite

```sql
CREATE TABLE saves (
    save_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,                    -- "Autosave 1234"
    created_at INTEGER NOT NULL,           -- Unix timestamp
    seed INTEGER NOT NULL,                 -- для детерминизма
    turn INTEGER NOT NULL,                 -- ход snapshot'а
    player_era TEXT NOT NULL,             -- "Bronze Age"
    player_population INTEGER NOT NULL,
    thumbnail BLOB,                        -- PNG скриншот
    snapshot_blob BLOB NOT NULL,           -- BSON
    input_log_blob BLOB,                   -- BSON (от snapshot до текущего)
    schema_version INTEGER NOT NULL
);

CREATE INDEX idx_saves_created ON saves(created_at DESC);
```

### BSON-структура snapshot

```python
# Python псевдокод
snapshot = {
    "schema_version": 1,
    "seed": 12345,
    "turn": 1000,
    "tempo": "GENERATIONS",  # D-015 — вождя/поколения/эпохи
    "ecs": {
        "citizens": [...],  # 30 000 × ~200 байт
        "families": [...],
        "settlements": [...],
        "buildings": [...],
        "factions": [...],
        "chief": {...},
        "armies": [...],
        "caravans": [...],
        "ai_civs": [...],
        "events_pending": [...],
        "hexes_dynamic": [...],  # только политическая принадлежность + видимость
        "civilizations": [...]
    },
    "chronicle": [...],  # D-001 — события хроники
    "stats": {
        "play_time_seconds": 3600,
        "decisions_per_hour": 7,
        ...
    }
}
```

### Сжатие

- BSON → gzip → ~3-5 МБ (сжимается хорошо, т.к. много повторяющихся структур)
- Скриншот (PNG 256×144) → ~50 КБ

**Итоговый размер сейва**: ~5 МБ.

---

## 🔄 Версионирование схем

> При обновлении игры структура может поменяться. Нужны миграции.

### Поле `schema_version`

```csharp
public const int CURRENT_SCHEMA_VERSION = 1;

public class SaveMigrator {
    public Snapshot Migrate(Snapshot snap, int fromVersion) {
        for (int v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
            snap = migrations[v](snap);
        }
        return snap;
    }
    
    private static readonly Dictionary<int, Func<Snapshot, Snapshot>> migrations = new() {
        { 1, MigrateV1ToV2 },
        { 2, MigrateV2ToV3 },
        // ...
    };
}
```

### Стратегия миграций

- Каждая версия — инкрементальная (V1 → V2 → V3 → ...)
- Старые сейвы (на 5 версий назад) — поддерживаются
- Очень старые сейвы (на 10+ версий) — предупреждение «возможны несовместимости»

---

## ▶️ Replay

> Replay = playback Input Log на том же seed'е. Полностью детерминированный.

### Использование

1. **Тестирование багов** — отправить input log разработчику, он проигрывает и видит баг
2. **Мультиплеер** (Q-018) — синхронизация input между игроками
3. **«История цивилизации»** — игрок может проиграть свою партию
4. **Возврат к ходу N** — откат к snapshot + replay input с этого хода

### Реализация

```csharp
public class ReplayPlayer {
    public void Play(string savePath, int fromTurn, int toTurn) {
        var save = SaveLoader.Load(savePath);
        var sim = new Simulation(save.seed);
        sim.LoadSnapshot(save.snapshot);
        
        foreach (var entry in save.inputLog.SkipWhile(e => e.turn < fromTurn)) {
            if (entry.turn > toTurn) break;
            sim.ApplyInput(entry);
            sim.SimulateTurn();
        }
    }
}
```

### Гарантия детерминизма

- Все RNG — детерминированные (PCG с seed'ом)
- Порядок систем — фиксированный (T-002)
- Порядок entities в ECS — стабильный (sorted by ID)
- Проверка: hash состояния после каждого хода — должен совпадать при replay

---

## 🌐 Мультиплеер (Q-018 — DEFERRED)

> Архитектура готовится, реализация отложена.

### Принцип

- Каждый игрок имеет свою симуляцию
- Синхронизируется только Input Log
- Если hash состояний разошёлся — disconnect (требуется resync)

### Lockstep

```
Ход N:
  1. Все игроки отправляют свои input'ы на ход N серверу
  2. Сервер собирает все input'ы, рассылает всем
  3. Все игроки применяют input'ы, симулируют ход N
  4. Все игроки отправляют hash состояния после хода N
  5. Если hash'и совпадают → ход N+1
  6. Если не совпадают → resync (передача snapshot)
```

### Проблемы

- **Lag** — если один игрок медленный, все ждут
- **Afk** — автопропуск хода после 60 сек
- **Big snapshot** — resync на 13 МБ — дорого

### Решения

- **Псевдо-мультиплеер** — каждый игрок управляет своим государством, но мир общий (как в Endless Legend)
- **Asynchronous** — игроки делают ходы в своё время, сервер применяет когда все готовы (как в Play-by-Email)

> Подробно — в отдельной спеке T-MULTIPLAYER (когда Q-018 активируется).

---

## 💾 Автосейв

### Когда

- Каждые 10 ходов — L2 snapshot
- При выходе из игры — L3 full save
- Перед крупным событием (смерть вождя, стадия вырождения) — L3 full save

### Хранение

- Максимум 5 автосейвов (FIFO)
- Папка: `%APPDATA%/DeepTime/saves/autosave_*.sqlite`
- Имена: `autosave_2026-10-26_14-30.sqlite`

### Восстановление после краша

При запуске игра проверяет:
1. Есть ли «грязный» флаг (записывается перед симуляцией хода, стирается после)
2. Если есть — предложить восстановить последний автосейв

---

## 📊 Профиль нагрузки

| Операция | Время | Размер |
|---|---|---|
| Save (snapshot) | ~500 ms | ~5 МБ |
| Load (snapshot) | ~300 ms | ~5 МБ |
| Save (input log only) | ~10 ms | ~10 КБ |
| Replay (1000 ходов) | ~30 сек | — |
| Автосейв (10 ходов) | ~500 ms | ~5 МБ |

---

## ✅ Чек-лист готовности спеки

- [x] 3 уровня сохранений (Input Log / Snapshot / Full Save)
- [x] Гибрид SQLite + BSON
- [x] Сжатие gzip (~5 МБ на сейв)
- [x] Версионирование схем (миграции)
- [x] Replay (детерминированный playback)
- [x] Мультиплеер (Q-018 — архитектура готовится, lockstep)
- [x] Автосейв (каждые 10 ходов + при выходе)
- [x] Восстановление после краша
- [x] Профиль нагрузки (~500 ms save, ~300 ms load)

---

## 📚 Источники

- GDD §19 (SQLite или BSON)
- Q-018 Мультиплеер (DEFERRED — архитектура готовится)
- T-001 Архитектура движка (детерминизм)
- T-002 Структура данных (ECS-компоненты для сериализации)
- D-001 Вождь (хроника — отдельный блок в snapshot)

---

## Связанные файлы

- [`README.md`](README.md) — обзор Стадии 3
- [`engine_architecture_design.md`](engine_architecture_design.md) — T-001 Архитектура движка
- [`data_structures_design.md`](data_structures_design.md) — T-002 Структура данных
