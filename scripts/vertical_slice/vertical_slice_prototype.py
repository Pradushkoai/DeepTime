#!/usr/bin/env python3
"""
DeepTime — Vertical Slice Prototype (Python, headless, no UI)

Цель: проверить ядро симуляции (D-001 вождь, D-004 фракции, D-015 контракт сессии,
D-016 события) без рендера. Ответить на вопрос: "ядро DeepTime весело или нет?"

Scope (по T-008 Vertical Slice):
- 1 поселение, ~50 граждан, 5 ресурсов, 3 технологии, 1 угроза (зима)
- Темп "вождя" (1 ход = 1 сезон) — D-015
- 3 фракции: охотники, жречество, старейшины — D-004
- 5-10 базовых событий — D-016, T-005
- Метрики: решений/ход, событий/ход, выживаемость, давление вождя

Связанные спеки: T-001 (архитектура), T-002 (данные), T-003 (LOD), T-005 (события),
T-008 (vertical slice), D-001 (вождь), D-004 (фракции), D-015 (контракт сессии),
D-016 (события).

Запуск: python3 /home/z/my-project/scripts/vertical_slice_prototype.py
"""

import random
from dataclasses import dataclass, field
from enum import Enum, IntEnum
from typing import Optional


# ============================================================================
# ЭНУМЫ (D-002, D-004, D-016)
# ============================================================================

class Season(IntEnum):
    SPRING = 0
    SUMMER = 1
    AUTUMN = 2
    WINTER = 3


class Gender(IntEnum):
    MALE = 0
    FEMALE = 1


class ActionType(IntEnum):
    IDLE = 0
    HUNT = 1        # охота (мясо)
    GATHER = 2      # собирательство (ягоды)
    FISH = 3        # рыболовство
    BUILD = 4       # строительство
    REST = 5        # отдых
    RITUAL = 6      # ритуал
    MIGRATE = 7     # кочёвка
    CRAFT = 8       # ремесло (после T-014 керамика)


class FactionType(IntEnum):
    HUNTERS = 0     # охотники (палеолит)
    PRIESTS = 1     # жречество
    ELDERS = 2      # старейшины


class ChiefEra(IntEnum):
    YOUNG = 0       # 16-30
    MATURE = 1      # 30-50
    OLD = 2         # 50-65
    DECLINING = 3   # 65+


class EventPriority(IntEnum):
    CRITICAL = 0
    HIGH = 1
    NORMAL = 2
    LOW = 3
    BACKGROUND = 4


class EventType(IntEnum):
    CHIEF_SUCCESSION = 0
    CHIEF_DEATH = 1
    WINTER_COMING = 2
    HUNGER = 3
    FACTION_GRIEVANCE = 4
    CHAMPION_PROPOSES = 5
    RITUAL_OF_YEAR = 6
    WEDDING = 7
    BIRTH_NOTABLE = 8
    DEATH_ELDER = 9
    GOOD_HARVEST = 10
    FIRST_POT = 11  # R6 — позитивный канал


class TribeArchetype(IntEnum):
    """D-009 — архетип стартовой локации"""
    FOREST = 0          # лесной (Сев. Европа, Амазония, Тайга)
    STEPPE = 1          # степной кочевой
    RIVER_VALLEY = 2    # речно-долинный
    COASTAL = 3         # приморский
    MOUNTAIN = 4        # горно-долинный
    DESERT = 5          # пустынно-оазисный
    TROPICAL = 6        # тропический
    ARCTIC = 7          # арктический


# ============================================================================
# DATA: КАТАЛОГИ (упрощённые для среза)
# ============================================================================

RESOURCE_NAMES = {
    0: "мясо",
    1: "ягоды",
    2: "рыба",
    3: "дерево",
    4: "камень",
    5: "шкуры",
}

# Игровые поля (P5 — упрощённо)
RESOURCE_FOOD_VALUE = {  # ккал/единица
    0: 1500,  # мясо
    1: 200,   # ягоды
    2: 800,   # рыба
    3: 0,
    4: 0,
    5: 0,
}

# D-009 — доли калорий по архетипу (упрощённо)
ARCHETYPE_CALORIE_SHARES = {
    TribeArchetype.FOREST:       {"hunt": 0.40, "gather": 0.40, "fish": 0.20},
    TribeArchetype.STEPPE:       {"hunt": 0.70, "gather": 0.20, "fish": 0.10},
    TribeArchetype.RIVER_VALLEY: {"hunt": 0.25, "gather": 0.30, "fish": 0.45},
    TribeArchetype.COASTAL:      {"hunt": 0.20, "gather": 0.20, "fish": 0.60},
    TribeArchetype.MOUNTAIN:     {"hunt": 0.60, "gather": 0.30, "fish": 0.10},
    TribeArchetype.DESERT:       {"hunt": 0.30, "gather": 0.50, "fish": 0.20},
    TribeArchetype.TROPICAL:     {"hunt": 0.20, "gather": 0.60, "fish": 0.20},
    TribeArchetype.ARCTIC:       {"hunt": 0.80, "gather": 0.05, "fish": 0.15},
}


# D-009 — стартовые навыки по архетипу (бонусы к "своим" занятиям)
ARCHETYPE_STARTING_SKILLS = {
    TribeArchetype.FOREST:       {"hunt": (20, 45), "gather": (25, 50), "fish": (15, 30), "build": (15, 30)},
    TribeArchetype.STEPPE:       {"hunt": (40, 65), "gather": (15, 30), "fish": (10, 20), "build": (10, 25)},
    TribeArchetype.RIVER_VALLEY: {"hunt": (15, 30), "gather": (25, 45), "fish": (40, 65), "build": (15, 30)},
    TribeArchetype.COASTAL:      {"hunt": (15, 30), "gather": (15, 30), "fish": (50, 70), "build": (15, 30)},
    TribeArchetype.MOUNTAIN:     {"hunt": (35, 60), "gather": (20, 35), "fish": (10, 20), "build": (20, 35)},
    TribeArchetype.DESERT:       {"hunt": (25, 45), "gather": (30, 50), "fish": (15, 25), "build": (15, 30)},
    TribeArchetype.TROPICAL:     {"hunt": (15, 30), "gather": (40, 65), "fish": (25, 45), "build": (15, 30)},
    TribeArchetype.ARCTIC:       {"hunt": (45, 70), "gather": (10, 20), "fish": (25, 45), "build": (15, 30)},
}


def _gen_skills_for_archetype(rng, archetype):
    """Сгенерировать навыки в зависимости от архетипа (D-009)"""
    s = ARCHETYPE_STARTING_SKILLS[archetype]
    return {
        "hunt": rng.randint(*s["hunt"]),
        "gather": rng.randint(*s["gather"]),
        "fish": rng.randint(*s["fish"]),
        "build": rng.randint(*s["build"]),
        "craft": rng.randint(5, 20),
    }


# ============================================================================
# DATA: ГРАЖДАНИН (T-002 — Citizen archetype)
# ============================================================================

@dataclass
class Citizen:
    """D-001, T-002 — гражданин как личность"""
    id: int
    name: str
    gender: Gender
    age: int
    birth_year: int

    # GDD §7 — 12 навыков (0-100)
    hunt_skill: int = 10
    gather_skill: int = 10
    fish_skill: int = 10
    build_skill: int = 5
    craft_skill: int = 5

    # Потребности (0-100, 100 = критично)
    hunger: int = 0
    fatigue: int = 0

    # Семья и лояльность
    family_id: int = -1
    family_role: str = "member"  # head/spouse/child/elder
    loyalty: int = 70

    # Текущее действие (R7 — explainability)
    current_action: ActionType = ActionType.IDLE
    action_reason: str = ""
    action_alternative: str = ""

    # Состояние
    alive: bool = True
    death_cause: str = ""


@dataclass
class Family:
    """D-001 наследие, T-002 — семья"""
    id: int
    surname: str
    head_citizen_id: int
    members: list = field(default_factory=list)
    grain_reserves: int = 0
    meat_reserves: int = 0


@dataclass
class Faction:
    """D-004 — фракция с силой и обидой"""
    type: FactionType
    name: str
    power: int = 30          # 0-100 (доля населения + богатства)
    grievance: int = 0       # 0-100 (обида, переживает вождя)
    grievance_reason: str = ""
    agenda: str = ""         # что хочет


@dataclass
class Chief:
    """D-001 — вождь-гибрид"""
    citizen_id: int
    name: str
    age: int
    era: ChiefEra
    health: int = 100
    legitimacy: int = 80
    pressure: int = 0          # 0-100 (давление непоглощённого изменения)
    reign_start_year: int = 0
    heir_id: int = -1
    completed_reforms: list = field(default_factory=list)


@dataclass
class EventChoice:
    """D-016 — выбор в событии"""
    label: str
    description: str
    # consequences — dict с изменениями
    consequences: dict


@dataclass
class GameEvent:
    """D-016, T-005 — событие с выборами"""
    id: int
    type: EventType
    priority: EventPriority
    title: str
    text: str
    choices: list  # list[EventChoice]
    auto_resolve: bool = False  # True = не требует выбора игрока
    fired_in_turn: int = 0


# ============================================================================
# DATA: МИР (упрощённый — 1 поселение)
# ============================================================================

@dataclass
class Settlement:
    """D-002 — поселение"""
    name: str
    population: int = 0
    founded_year: int = -10000

    # Склады
    meat: int = 0           # единицы мяса
    berries: int = 0        # единицы ягод
    fish: int = 0           # единицы рыбы
    wood: int = 0
    stone: int = 0
    hides: int = 0

    # Здания (упрощённо — счётчики)
    huts: int = 5           # жилища
    storage_pits: int = 1   # ямы-склады
    hearth: int = 1         # костёр (T-005 огонь)

    # Статистика
    births_this_year: int = 0
    deaths_this_year: int = 0


@dataclass
class WorldState:
    """Глобальное состояние симуляции"""
    year: int = -10000  # стартовый год (10 000 до н.э.)
    season: Season = Season.AUTUMN  # старт с осени (онбординг «зима идёт»)
    turn: int = 0
    seed: int = 42

    archetype: TribeArchetype = TribeArchetype.FOREST
    settlement: Settlement = None
    chief: Chief = None

    citizens: dict = field(default_factory=dict)  # id -> Citizen
    families: dict = field(default_factory=dict)  # id -> Family
    factions: dict = field(default_factory=dict)  # FactionType -> Faction

    pending_events: list = field(default_factory=list)  # list[GameEvent]
    resolved_events: list = field(default_factory=list)  # лог
    chronicle: list = field(default_factory=list)  # D-001 хроника

    # Игровые параметры (ползунки ценностей, D-001)
    values: dict = field(default_factory=lambda: {
        "safety": 60,      # Безопасность ↔ Изобилие
        "warlike": 40,     # Воинственность ↔ Миролюбие
        "knowledge": 30,   # Знание ↔ Традиция
        "nature": 70,      # Природа ↔ Прогресс
        "collective": 70,  # Коллектив ↔ Индивидуализм
    })

    # Приоритеты (D-001)
    priorities: dict = field(default_factory=lambda: {
        "food": 40,        # еда
        "stockpile": 30,   # запасы (для зимы!)
        "build": 10,
        "tech": 10,
        "army": 5,
        "trade": 5,
    })

    # Технологии
    techs_unlocked: set = field(default_factory=lambda: {0, 1, 2})  # T-004 охота, T-005 огонь, базовый собирательство
    tech_progress: dict = field(default_factory=dict)  # tech_id -> прогресс 0-100

    # Метрики (T-008)
    metrics: dict = field(default_factory=lambda: {
        "decisions_this_turn": 0,
        "events_this_turn": 0,
        "total_decisions": 0,
        "total_events": 0,
        "winters_survived": 0,
        "max_pressure": 0,
        "turns_played": 0,
    })

    rng: random.Random = None


# ============================================================================
# SYSTEMS (T-002, T-003)
# ============================================================================

def system_citizen_needs(world: WorldState):
    """1/ход — обновление потребностей граждан (GDD §7)

    Голод растёт со временем, усталость от работы.
    """
    for c in world.citizens.values():
        if not c.alive:
            continue
        # Голод растёт каждый ход
        c.hunger = min(100, c.hunger + 15)
        # Усталость зависит от действия
        if c.current_action in (ActionType.HUNT, ActionType.BUILD, ActionType.MIGRATE):
            c.fatigue = min(100, c.fatigue + 20)
        elif c.current_action == ActionType.REST:
            c.fatigue = max(0, c.fatigue - 30)
        else:
            c.fatigue = min(100, c.fatigue + 5)


def system_citizen_actions(world: WorldState):
    """1/ход — выбор действия гражданина по utility score (D-003, GDD §7)

    Формула: utility = needs × values × (has_vacancy) × edicts
    Для среза — упрощённо.
    """
    shares = ARCHETYPE_CALORIE_SHARES[world.archetype]
    food_priority = world.priorities["food"]
    stockpile_priority = world.priorities["stockpile"]

    # Глобальный голод — если много голодных, еда в приоритете
    hungry_count = sum(1 for c in world.citizens.values()
                      if c.alive and c.hunger > 50)
    food_crisis = hungry_count > 10

    for c in world.citizens.values():
        if not c.alive:
            continue
        # Дети до 12 — помогают собирать, но слабо
        is_child = c.age < 12
        if is_child:
            # Дети — только собирательство или отдых
            gather_u = c.hunger * 0.5 + c.gather_skill * 0.3
            rest_u = c.fatigue * 0.6
            utilities = {ActionType.GATHER: gather_u, ActionType.REST: rest_u}
            best_action = max(utilities, key=utilities.get)
            c.current_action = best_action
            c.action_reason = f"ребёнок, {best_action.name}"
            continue

        # Вычисляем utility для каждого действия
        utilities = {}

        # Охота — если голоден или приоритет еды/запасов высокий
        hunt_u = 0
        if c.hunger > 30:
            hunt_u += c.hunger * 0.6
        if food_crisis:
            hunt_u += 30  # кризис — все на еду
        hunt_u += food_priority * 0.5 * shares["hunt"]
        hunt_u += stockpile_priority * 0.4 * shares["hunt"]
        hunt_u += c.hunt_skill * 0.3
        utilities[ActionType.HUNT] = hunt_u

        # Собирательство
        gather_u = 0
        if c.hunger > 30:
            gather_u += c.hunger * 0.5
        if food_crisis:
            gather_u += 25
        gather_u += food_priority * 0.5 * shares["gather"]
        gather_u += c.gather_skill * 0.3
        utilities[ActionType.GATHER] = gather_u

        # Рыболовство (только если архетип позволяет)
        fish_u = 0
        if shares["fish"] > 0.1:
            if c.hunger > 30:
                fish_u += c.hunger * 0.5
            if food_crisis:
                fish_u += 25
            fish_u += food_priority * 0.5 * shares["fish"]
            fish_u += c.fish_skill * 0.3
        utilities[ActionType.FISH] = fish_u

        # Строительство — низкий приоритет, если все голодны
        build_u = 0
        if not food_crisis:  # не строить в кризис
            if world.priorities["build"] > 15:
                build_u += world.priorities["build"] * 0.3
            if world.settlement.huts < world.settlement.population // 8:
                build_u += 15  # снижено с 30
            build_u += c.build_skill * 0.2
        utilities[ActionType.BUILD] = build_u

        # Отдых — если устал
        rest_u = 0
        if c.fatigue > 70:
            rest_u += c.fatigue * 0.8
        utilities[ActionType.REST] = rest_u

        # Ритуал — если сезон подходит и есть жречество
        ritual_u = 0
        if world.season == Season.WINTER and world.factions.get(FactionType.PRIESTS):
            ritual_u += 15
        utilities[ActionType.RITUAL] = ritual_u

        # Выбираем максимальный utility
        best_action = max(utilities, key=utilities.get)
        best_u = utilities[best_action]

        # Записываем причину (R7 explainability)
        c.current_action = best_action
        c.action_reason = _explain_action(c, best_action, utilities)
        # Альтернатива — второй по utility
        sorted_actions = sorted(utilities.items(), key=lambda x: -x[1])
        if len(sorted_actions) > 1:
            alt_action, alt_u = sorted_actions[1]
            c.action_alternative = f"{alt_action.name} (utility {alt_u:.0f})"


def _explain_action(c: Citizen, action: ActionType, utilities: dict) -> str:
    """R7 — explainability: причина выбора в одну строку"""
    reasons = []
    if c.hunger > 50:
        reasons.append(f"голод {c.hunger}")
    if c.fatigue > 60 and action == ActionType.REST:
        reasons.append(f"усталость {c.fatigue}")
    if action == ActionType.HUNT:
        reasons.append(f"навык охоты {c.hunt_skill}")
    elif action == ActionType.GATHER:
        reasons.append(f"навык собирательства {c.gather_skill}")
    elif action == ActionType.BUILD:
        reasons.append("нужны жилища")
    u = utilities.get(action, 0)
    return f"{', '.join(reasons)} → utility {u:.0f}"


def system_production(world: WorldState):
    """1/ход — производство ресурсов (GDD §7)"""
    s = world.settlement
    shares = ARCHETYPE_CALORIE_SHARES[world.archetype]

    # Сезонный множитель — летом изобилие, зимой дефицит
    season_mult = {
        Season.SPRING: 1.2,
        Season.SUMMER: 1.5,   # пик изобилия
        Season.AUTUMN: 1.2,
        Season.WINTER: 0.4,   # зимой добыча тяжёлая
    }[world.season]

    meat_gained = 0
    berries_gained = 0
    fish_gained = 0
    wood_gained = 0
    stone_gained = 0

    for c in world.citizens.values():
        if not c.alive:
            continue
        # Дети не работают
        if c.age < 12:
            continue
        # Старики работают с штрафом
        skill_mult = 1.0
        if c.age >= 60:
            skill_mult = 0.5

        if c.current_action == ActionType.HUNT:
            # Успех зависит от навыка + сезона + архетипа
            success = min(1.0, c.hunt_skill / 60 + 0.4) * skill_mult * season_mult
            # Мясо за успешную охоту — зависит от доли охоты в архетипе
            meat_gained += max(1, int(round(success * 3 * shares["hunt"] * 2.5))) if success > 0.3 else 0
        elif c.current_action == ActionType.GATHER:
            success = min(1.0, c.gather_skill / 60 + 0.5) * skill_mult * season_mult
            # Ягоды — v0.36: поднято ×4 (вместо ×3) для долгих прогонов
            berries_gained += max(1, int(round(success * 4 * shares["gather"] * 4))) if success > 0.3 else 0
        elif c.current_action == ActionType.FISH:
            success = min(1.0, c.fish_skill / 60 + 0.5) * skill_mult * season_mult
            # Рыба — v0.36: поднято ×3 (вместо ×2.5)
            fish_gained += max(1, int(round(success * 3 * shares["fish"] * 3))) if success > 0.3 else 0
        elif c.current_action == ActionType.BUILD:
            wood_gained += 1
            stone_gained += 1

    s.meat += meat_gained
    s.berries += berries_gained
    s.fish += fish_gained
    s.wood += wood_gained
    s.stone += stone_gained

    return {
        "meat": meat_gained,
        "berries": berries_gained,
        "fish": fish_gained,
        "wood": wood_gained,
        "stone": stone_gained,
    }


def system_consumption(world: WorldState):
    """1/ход — потребление еды гражданами (GDD §7)

    Каждый гражданин ест ~1 единицу еды в ход.
    Зимой — больше.
    Дети (0-15) едят меньше.

    v0.36: потребление накопительное — за 5 ходов гражданин съедает 4 единицы (0.8/ход)
    Зимой — 6 единиц за 5 ходов (1.2/ход)
    Это даёт реальное снижение потребления без округления в 1.

    v0.36b: шанс смерти от голода снижен (0.08 вместо 0.10)
    """
    s = world.settlement
    is_winter = world.season == Season.WINTER

    # Накопительное потребление — каждый 5-й ход гражданин ест 2 единицы, иначе 1
    # Это даёт 6/5 = 1.2 зимой, 5/5 = 1.0 обычно — но мы хотим меньше
    # Альтернатива: каждый 5-й ход — 0 единиц (пост), иначе 1
    # Это даёт 4/5 = 0.8 обычно, 5/5 = 1.0 зимой (пост не зимой)
    fast_day = (world.turn % 5 == 0)  # каждый 5-й ход — "пост"
    if is_winter:
        # Зимой поста нет — все едят
        food_needed_base = 1
    else:
        # Обычно каждый 5-й ход — 0 единиц (пост), иначе 1
        food_needed_base = 0 if fast_day else 1

    dead_from_hunger = []

    for c in world.citizens.values():
        if not c.alive:
            continue

        # Дети едят меньше — половина
        is_child = c.age < 16
        if is_child:
            food_needed = max(0, food_needed_base // 2)
        else:
            food_needed = food_needed_base

        if food_needed == 0:
            # Постный день — голод немного растёт
            c.hunger = min(100, c.hunger + 5)
            continue

        # Пытаемся накормить
        fed = False
        # Приоритет: мясо > рыба > ягоды
        if s.meat >= food_needed:
            s.meat -= food_needed
            fed = True
        elif s.fish >= food_needed:
            s.fish -= food_needed
            fed = True
        elif s.berries >= food_needed:
            s.berries -= food_needed
            fed = True
        elif s.meat + s.fish + s.berries >= food_needed:
            # Комбинированное питание
            need = food_needed
            take_meat = min(s.meat, need)
            s.meat -= take_meat
            need -= take_meat
            take_fish = min(s.fish, need)
            s.fish -= take_fish
            need -= take_fish
            s.berries -= need
            fed = True

        if fed:
            c.hunger = max(0, c.hunger - 40)
        else:
            # Голод
            c.hunger = min(100, c.hunger + 15)
            if c.hunger >= 100:
                # Смерть от голода — v0.36b: снижена (0.08 вместо 0.10)
                death_chance = 0.08
                if is_child:
                    death_chance = 0.15
                if world.rng.random() < death_chance:
                    c.alive = False
                    c.death_cause = "голод"
                    dead_from_hunger.append(c)

    return dead_from_hunger


def system_factions(world: WorldState):
    """1/ход — обновление силы и обиды фракций (D-004)"""
    # Сила = доля населения по профессии
    total_alive = sum(1 for c in world.citizens.values() if c.alive)
    if total_alive == 0:
        return

    hunters_count = sum(1 for c in world.citizens.values()
                       if c.alive and c.current_action == ActionType.HUNT)
    ritual_count = sum(1 for c in world.citizens.values()
                      if c.alive and c.current_action == ActionType.RITUAL)
    elders_count = sum(1 for c in world.citizens.values()
                      if c.alive and c.age >= 50)

    if FactionType.HUNTERS in world.factions:
        f = world.factions[FactionType.HUNTERS]
        f.power = min(100, int(hunters_count / max(1, total_alive) * 100) + 20)

    if FactionType.PRIESTS in world.factions:
        f = world.factions[FactionType.PRIESTS]
        f.power = min(100, int(ritual_count / max(1, total_alive) * 100) + 15)

    if FactionType.ELDERS in world.factions:
        f = world.factions[FactionType.ELDERS]
        f.power = min(100, int(elders_count / max(1, total_alive) * 100) + 25)

    # Обида растёт, если давление вождя высокое (D-004)
    # v0.35: порог 80 вместо 60 — менее агрессивно
    if world.chief and world.chief.pressure > 80:
        for f in world.factions.values():
            if f.grievance < 80:
                f.grievance = min(100, f.grievance + 3)  # было +5
                if not f.grievance_reason:
                    f.grievance_reason = "давление вождя высокое"


def system_chief(world: WorldState):
    """1/ход — обновление вождя (D-001)

    Давление растёт от:
    - Смены сезона (особенно зима)
    - Голод граждан
    - Смерть граждан
    - Кризисов (хищник, болезнь, неурожай)

    v0.35: снижен рост давления для баланса
    """
    if not world.chief:
        return

    chief = world.chief

    # Давление от голода — снижено (max +5 вместо +15)
    hungry = sum(1 for c in world.citizens.values() if c.alive and c.hunger > 60)
    if hungry > 0:
        pressure_gain = min(5, hungry // 4)
        chief.pressure = min(100, chief.pressure + pressure_gain)

    # Давление от зимы — снижено (+2 вместо +5)
    if world.season == Season.WINTER:
        chief.pressure = min(100, chief.pressure + 2)

    # Давление от недавних смертей — снижено (recent*1 вместо *3)
    recent_deaths = sum(1 for entry in world.chronicle[-5:]
                       if "погиб" in entry.get("entry", "") or "умер" in entry.get("entry", "")
                       or "Болезнь" in entry.get("entry", "") or "Жёсткая" in entry.get("entry", ""))
    if recent_deaths > 0:
        chief.pressure = min(100, chief.pressure + recent_deaths * 1)

    # Давление от обиды фракций — убрано (обида уже влияет через фракции)
    # total_grievance не влияет на давление вождя

    # Давление спадает активнее, если всё хорошо
    total_grievance = sum(f.grievance for f in world.factions.values())
    if hungry == 0 and recent_deaths == 0 and total_grievance < 50:
        chief.pressure = max(0, chief.pressure - 2)  # было -1

    # Обновление эры
    if chief.age < 30:
        chief.era = ChiefEra.YOUNG
    elif chief.age < 50:
        chief.era = ChiefEra.MATURE
    elif chief.age < 65:
        chief.era = ChiefEra.OLD
    else:
        chief.era = ChiefEra.DECLINING

    # Проверка смерти вождя (D-001 — от первого из двух: возраст/давление)
    # ВАЖНО: триггерим только ОДИН раз — если уже есть pending CHIEF_DEATH, не дублируем
    if chief.age >= 80 or chief.pressure >= 100 or chief.health <= 0:
        already_pending = any(e.type == EventType.CHIEF_DEATH for e in world.pending_events)
        if not already_pending:
            _fire_event(world, EventType.CHIEF_DEATH, EventPriority.CRITICAL)


def handle_chief_death(world: WorldState, choice_label: str):
    """Обработка смерти вождя — создание нового (D-001, R9)

    Вызывается из resolve_event при выборе в CHIEF_DEATH/CHIEF_SUCCESSION.
    """
    old_chief = world.chief
    old_pressure = old_chief.pressure

    # Создаём нового вождя (наследника или нового гражданина)
    rng = world.rng

    # Ищем наследника
    heir_id = old_chief.heir_id
    if heir_id == -1 or heir_id not in world.citizens or not world.citizens[heir_id].alive:
        # Нет наследника — берём случайного взрослого
        candidates = [c for c in world.citizens.values()
                     if c.alive and 18 <= c.age <= 40 and c.id != old_chief.citizen_id]
        if not candidates:
            # Все умерли — берём любого живого
            candidates = [c for c in world.citizens.values() if c.alive]
        if not candidates:
            return  # некому стать вождём
        heir = rng.choice(candidates)
        heir_id = heir.id

    heir = world.citizens[heir_id]

    # R9 — предохранители спиралей
    if choice_label == "Долг отцов":
        # Давление наследуется полностью, гасится 5/год
        new_pressure = old_pressure
    elif choice_label == "Новая метла":
        # Давление обнуляется
        new_pressure = 0
    else:
        new_pressure = old_pressure // 2  # по умолчанию 50%

    # Помечаем старого вождя как мёртвого
    if old_chief.citizen_id in world.citizens:
        old_citizen = world.citizens[old_chief.citizen_id]
        old_citizen.alive = False
        old_citizen.death_cause = "вождь (передача власти)"

    # Создаём нового вождя
    world.chief = Chief(
        citizen_id=heir.id,
        name=heir.name,
        age=heir.age,
        era=ChiefEra.YOUNG if heir.age < 30 else ChiefEra.MATURE,
        health=80,
        legitimacy=max(50, old_chief.legitimacy - 10),
        pressure=new_pressure,
        reign_start_year=world.year,
        heir_id=-1,
        completed_reforms=[],
    )

    # Записываем в хронику
    world.chronicle.append({
        "year": world.year,
        "season": world.season.name,
        "entry": f"{heir.name} стал новым вождём (давление {new_pressure})"
    })


def system_aging_and_death(world: WorldState):
    """1 раз в год (4 хода) — старение и естественная смерть"""
    # Старение — раз в год (4 сезона)
    if world.season != Season.SPRING:
        return

    for c in list(world.citizens.values()):
        if not c.alive:
            continue
        c.age += 1
        # Естественная смерть (вероятность растёт с возрастом)
        if c.age >= 60:
            death_chance = (c.age - 60) * 0.01
            if world.rng.random() < death_chance:
                c.alive = False
                c.death_cause = "старость"
                world.settlement.deaths_this_year += 1
                # Событие смерти старейшины
                if c.age >= 50:
                    _fire_event(world, EventType.DEATH_ELDER, EventPriority.NORMAL,
                              citizen_name=c.name, age=c.age)


def system_random_crises(world: WorldState):
    """1/ход — случайные кризисы (для напряжения — иначе слишком легко)"""
    # Жёсткая зима — раз в 5-10 лет
    if world.season == Season.WINTER:
        if world.rng.random() < 0.15:  # 15% за зиму
            # Жёсткая зима — доп. потребление еды
            s = world.settlement
            extra_loss = min(s.meat + s.berries + s.fish,
                            sum(1 for c in world.citizens.values() if c.alive) // 2)
            s.meat = max(0, s.meat - extra_loss // 2)
            s.berries = max(0, s.berries - extra_loss // 2)
            world.chronicle.append({
                "year": world.year, "season": world.season.name,
                "entry": f"Жёсткая зима: потеряно ~{extra_loss} единиц еды"
            })

    # Неурожай ягод — летом
    if world.season == Season.SUMMER:
        if world.rng.random() < 0.1:  # 10% за лето
            s = world.settlement
            loss = s.berries // 3
            s.berries -= loss
            world.chronicle.append({
                "year": world.year, "season": world.season.name,
                "entry": f"Неурожай ягод: потеряно {loss} единиц"
            })

    # Болезнь — редко, но убивает
    if world.rng.random() < 0.03:  # 3% за ход
        alive_citizens = [c for c in world.citizens.values() if c.alive]
        if alive_citizens:
            victim = world.rng.choice(alive_citizens)
            if victim.age >= 60 or victim.age < 5:  # старики и дети уязвимее
                victim.alive = False
                victim.death_cause = "болезнь"
                world.chronicle.append({
                    "year": world.year, "season": world.season.name,
                    "entry": f"Болезнь унесла {victim.name}"
                })

    # Хищник атакует — редко
    if world.season != Season.WINTER and world.rng.random() < 0.02:
        alive_citizens = [c for c in world.citizens.values() if c.alive and c.age >= 16]
        if alive_citizens:
            victim = world.rng.choice(alive_citizens)
            if world.rng.random() < 0.4:  # 40% шанс смерти
                victim.alive = False
                victim.death_cause = "хищник"
                world.chronicle.append({
                    "year": world.year, "season": world.season.name,
                    "entry": f"{victim.name} погиб от хищника"
                })


# ============================================================================
# EVENT SYSTEM (T-005, D-016)
# ============================================================================

_event_id_counter = [0]


def _fire_event(world: WorldState, etype: EventType, priority: EventPriority,
               citizen_name: str = "", **kwargs):
    """Создать событие и добавить в очередь (T-005)"""
    _event_id_counter[0] += 1
    event_id = _event_id_counter[0]

    title, text, choices = _build_event(world, etype, citizen_name, **kwargs)

    event = GameEvent(
        id=event_id,
        type=etype,
        priority=priority,
        title=title,
        text=text,
        choices=choices,
        fired_in_turn=world.turn,
    )
    world.pending_events.append(event)
    return event


def _build_event(world: WorldState, etype: EventType, citizen_name: str = "", **kwargs):
    """Построить событие по типу (D-016)"""
    chief_name = world.chief.name if world.chief else "вождь"

    if etype == EventType.CHIEF_DEATH:
        title = f"Смерть вождя {chief_name}"
        text = (f"{chief_name} умер. "
                f"Давление: {world.chief.pressure}, возраст: {world.chief.age}. "
                f"Наследник: {'есть' if world.chief.heir_id != -1 else 'НЕТ'}.")
        choices = [
            EventChoice(
                label="Долг отцов",
                description="Давление наследуется полностью, гасится 5/год",
                consequences={"chief_pressure": "inherit", "legitimacy": -5, "grievance_all": +10}
            ),
            EventChoice(
                label="Новая метла",
                description="Давление обнуляется, ценой легитимности/обиды",
                consequences={"chief_pressure": 0, "legitimacy": -30, "grievance_all": +20, "reform_bonus": +20}
            ),
        ]
        return title, text, choices

    elif etype == EventType.CHIEF_SUCCESSION:
        heir = world.citizens.get(world.chief.heir_id) if world.chief else None
        heir_name = heir.name if heir else "узурпатор"
        title = f"{heir_name} вступает на престол"
        text = f"{heir_name} принял власть. Как поступить?"
        choices = [
            EventChoice("Долг отцов", "Давление наследуется, гасится 5/год",
                       {"chief_pressure": "inherit", "legitimacy": -5}),
            EventChoice("Новая метла", "Давление обнуляется, ценой легитимности",
                       {"chief_pressure": 0, "legitimacy": -30, "grievance_all": +20}),
        ]
        return title, text, choices

    elif etype == EventType.WINTER_COMING:
        days_to_winter = 90 if world.season == Season.AUTUMN else 0
        title = "Зима идёт!"
        text = (f"Холодный ветер с севера. До зимы ~{days_to_winter} дней. "
                f"Запасы: мясо {world.settlement.meat}, ягоды {world.settlement.berries}, "
                f"рыба {world.settlement.fish}. Население: {sum(1 for c in world.citizens.values() if c.alive)}.")
        choices = [
            EventChoice("Удвоить запасы", "+приоритет запасам, −приоритет еде сейчас",
                       {"priority_shift": {"stockpile": +20, "food": -10}}),
            EventChoice("Продолжать как есть", "Без изменений",
                       {}),
            EventChoice("Кочёвка на юг", "Потеря 5 человек, +20 запасов",
                       {"migration_south": True}),
        ]
        return title, text, choices

    elif etype == EventType.HUNGER:
        hungry = sum(1 for c in world.citizens.values() if c.alive and c.hunger > 70)
        title = f"Голод! {hungry} человек голодают"
        text = (f"Запасы истощаются. {hungry} граждан голодают. "
                f"Что делать?")
        choices = [
            EventChoice("Общественные работы", "Все на добычу, +усталость",
                       {"all_to_food": True, "fatigue_all": +20}),
            EventChoice("Рацион", "Сократить потребление, +голод",
                       {"ration": True, "hunger_all": +10}),
            EventChoice("Молиться", "Ритуал, +давление вождю, шанс на удачу",
                       {"ritual": True, "chief_pressure": +10, "luck_chance": 0.3}),
        ]
        return title, text, choices

    elif etype == EventType.FACTION_GRIEVANCE:
        faction = kwargs.get("faction", FactionType.HUNTERS)
        f = world.factions.get(faction)
        fname = f.name if f else "фракция"
        title = f"{fname} в ярости (обида {f.grievance if f else '?'})"
        text = f"{fname} требует реформ. Причина: {f.grievance_reason if f else '?'}."
        choices = [
            EventChoice("Уступить", "−легитимность, −обида",
                       {"legitimacy": -10, "faction_grievance": (faction, -30)}),
            EventChoice("Подавить", "+обида, риск мятежа",
                       {"faction_grievance": (faction, +10), "rebellion_risk": 0.2}),
            EventChoice("Отложить", "Без изменений, обида растёт",
                       {}),
        ]
        return title, text, choices

    elif etype == EventType.CHAMPION_PROPOSES:
        champion_name = kwargs.get("champion_name", "Карл")
        title = f"Чемпион {champion_name} предлагает реформу"
        text = (f"{champion_name}, лучший охотник племени, предлагает "
                f"провести реформу «Обновление элит».")
        choices = [
            EventChoice("Поддержать", "Реформа стартует, +обида конкурирующей фракции",
                       {"start_reform": "refresh_elites", "grievance_other": +15}),
            EventChoice("Отклонить", "+легитимность, −обида фракции чемпиона",
                       {"legitimacy": +5}),
        ]
        return title, text, choices

    elif etype == EventType.RITUAL_OF_YEAR:
        title = "Ритуал года: праздник огня"
        text = "Жречество приглашает на ритуал. Это укрепляет мораль."
        choices = [
            EventChoice("Великий пир", "+мораль всем, −запасы",
                       {"morale_boost": True, "meat": -10, "berries": -5}),
            EventChoice("Скромная церемония", "−мораль, +запасы",
                       {"morale_minor": True}),
            EventChoice("Отказаться", "−обида жречества",
                       {"faction_grievance": (FactionType.PRIESTS, +20)}),
        ]
        return title, text, choices

    elif etype == EventType.WEDDING:
        title = f"Свадьба: {citizen_name}"
        text = f"{citizen_name}, заметный член племени, берёт пару."
        choices = [
            EventChoice("Пир за счёт казны", "+мораль, −запасы",
                       {"morale_boost": True, "meat": -5}),
            EventChoice("Скромная церемония", "−мораль, +запасы",
                       {}),
        ]
        return title, text, choices

    elif etype == EventType.BIRTH_NOTABLE:
        title = f"Родился первый ребёнок нового рода"
        text = f"В семье {citizen_name} родился ребёнок. Племя растёт."
        choices = [
            EventChoice("Праздник", "+мораль, −запасы",
                       {"morale_boost": True, "meat": -3}),
            EventChoice("Записать в хронику", "+культурная память",
                       {"chronicle_entry": f"Родился ребёнок в семье {citizen_name}"}),
        ]
        return title, text, choices

    elif etype == EventType.DEATH_ELDER:
        title = f"Смерть старейшины {citizen_name}"
        text = f"{citizen_name}, старейшина племени, умер в возрасте {kwargs.get('age', '?')}."
        choices = [
            EventChoice("Похоронить с почестями", "+давление, +хроника",
                       {"chief_pressure": +5, "chronicle_entry": f"Похороны {citizen_name}"}),
            EventChoice("Скромные похороны", "Без затрат",
                       {}),
        ]
        return title, text, choices

    elif etype == EventType.GOOD_HARVEST:
        title = "Богатый урожай ягод!"
        text = "В этом сезоне ягод вдоволь. Запасы пополнились."
        choices = [
            EventChoice("Запасти", "+запасы ягод",
                       {"berries": +20}),
            EventChoice("Пир", "+мораль, часть в запасы",
                       {"morale_boost": True, "berries": +10}),
        ]
        return title, text, choices

    elif etype == EventType.FIRST_POT:
        title = "🎉 Первый горшок обожжён!"
        text = "Гончар обожёг первый глиняный горшок. Племя празднует."
        choices = [
            EventChoice("Пир за счёт казны", "+мораль, −запасы",
                       {"morale_boost": True, "meat": -5}),
            EventChoice("Записать в хронику", "+культурная память",
                       {"chronicle_entry": "Первый горшок обожжён"}),
            EventChoice("Щедро наградить мастера", "+навык, −казна",
                       {"craft_bonus": True}),
        ]
        return title, text, choices

    return "Событие", "Описание", []


def system_events_check(world: WorldState):
    """1/ход — проверка триггеров и генерация событий (T-005)"""
    # 1. Зима идёт (онбординг D-015)
    if world.season == Season.AUTUMN and not any(e.type == EventType.WINTER_COMING for e in world.pending_events):
        if world.rng.random() < 0.5:  # не каждый год
            _fire_event(world, EventType.WINTER_COMING, EventPriority.HIGH)

    # 2. Голод
    hungry = sum(1 for c in world.citizens.values() if c.alive and c.hunger > 70)
    if hungry >= 5 and not any(e.type == EventType.HUNGER for e in world.pending_events):
        _fire_event(world, EventType.HUNGER, EventPriority.CRITICAL)

    # 3. Обида фракций > 80
    for ftype, f in world.factions.items():
        if f.grievance > 90 and not any(
            e.type == EventType.FACTION_GRIEVANCE and e.text.startswith(f.name)
            for e in world.pending_events
        ):
            _fire_event(world, EventType.FACTION_GRIEVANCE, EventPriority.HIGH, faction=ftype)

    # 4. Чемпион реформ (GDD §14) — редкое, раз в 5-10 лет
    # v0.35: поднято с 5% до 10%
    if world.rng.random() < 0.10:
        alive_citizens = [c for c in world.citizens.values() if c.alive and c.age >= 25]
        if alive_citizens:
            champion = world.rng.choice(alive_citizens)
            _fire_event(world, EventType.CHAMPION_PROPOSES, EventPriority.NORMAL,
                       champion_name=champion.name)

    # 5. Ритуал года — каждую зиму
    if world.season == Season.WINTER and not any(
        e.type == EventType.RITUAL_OF_YEAR for e in world.pending_events
    ):
        if world.rng.random() < 0.7:
            _fire_event(world, EventType.RITUAL_OF_YEAR, EventPriority.NORMAL)

    # 6. Свадьба — редко, заметный гражданин
    if world.rng.random() < 0.1:
        candidates = [c for c in world.citizens.values()
                     if c.alive and 18 <= c.age <= 35 and c.family_role == "head"]
        if candidates:
            c = world.rng.choice(candidates)
            _fire_event(world, EventType.WEDDING, EventPriority.LOW, citizen_name=c.name)

    # 7. Рождение — редко
    if world.rng.random() < 0.15:
        candidates = [c for c in world.citizens.values()
                     if c.alive and 20 <= c.age <= 35 and c.gender == Gender.FEMALE]
        if candidates:
            c = world.rng.choice(candidates)
            _fire_event(world, EventType.BIRTH_NOTABLE, EventPriority.LOW,
                       citizen_name=c.name)

    # 8. Богатый урожай — иногда летом
    if world.season == Season.SUMMER and world.rng.random() < 0.2:
        _fire_event(world, EventType.GOOD_HARVEST, EventPriority.LOW)

    # 9. Первый горшок (R6 позитивный канал) — если есть керамика
    if 14 in world.techs_unlocked and world.rng.random() < 0.1:  # T-014 керамика
        if not any(e.type == EventType.FIRST_POT for e in world.resolved_events):
            _fire_event(world, EventType.FIRST_POT, EventPriority.NORMAL)


def resolve_event(world: WorldState, event: GameEvent, choice_index: int):
    """Применить выбор игрока (T-005 — EventResolver)"""
    if choice_index >= len(event.choices):
        return

    choice = event.choices[choice_index]
    cons = choice.consequences

    # Спецобработка CHIEF_DEATH / CHIEF_SUCCESSION — передаём власть (D-001, R9)
    if event.type in (EventType.CHIEF_DEATH, EventType.CHIEF_SUCCESSION):
        handle_chief_death(world, choice.label)
        # Не применяем обычные chief_pressure consequences — уже обработано
        cons = {k: v for k, v in cons.items() if k != "chief_pressure"}

    # Применяем consequences
    if "chief_pressure" in cons:
        if cons["chief_pressure"] == "inherit" and world.chief.heir_id != -1:
            # Наследуется полностью (новый вождь получит старое давление)
            pass  # устанавливается в system_chief_succession
        elif isinstance(cons["chief_pressure"], int):
            world.chief.pressure = cons["chief_pressure"]

    if "legitimacy" in cons:
        world.chief.legitimacy = max(0, min(100, world.chief.legitimacy + cons["legitimacy"]))

    if "grievance_all" in cons:
        for f in world.factions.values():
            f.grievance = max(0, min(100, f.grievance + cons["grievance_all"]))

    if "faction_grievance" in cons:
        ftype, val = cons["faction_grievance"]
        if ftype in world.factions:
            world.factions[ftype].grievance = max(0, min(100, world.factions[ftype].grievance + val))

    if "priority_shift" in cons:
        for k, v in cons["priority_shift"].items():
            world.priorities[k] = max(0, min(100, world.priorities.get(k, 0) + v))

    if "meat" in cons:
        world.settlement.meat = max(0, world.settlement.meat + cons["meat"])
    if "berries" in cons:
        world.settlement.berries = max(0, world.settlement.berries + cons["berries"])

    if "all_to_food" in cons and cons["all_to_food"]:
        # Все на добычу
        for c in world.citizens.values():
            if c.alive and c.age >= 16:
                if c.hunt_skill > c.gather_skill:
                    c.current_action = ActionType.HUNT
                else:
                    c.current_action = ActionType.GATHER

    if "fatigue_all" in cons:
        for c in world.citizens.values():
            if c.alive:
                c.fatigue = min(100, c.fatigue + cons["fatigue_all"])

    if "ration" in cons and cons["ration"]:
        # Сократить потребление — голод растёт
        for c in world.citizens.values():
            if c.alive:
                c.hunger = min(100, c.hunger + 10)

    if "hunger_all" in cons:
        for c in world.citizens.values():
            if c.alive:
                c.hunger = min(100, c.hunger + cons["hunger_all"])

    if "morale_boost" in cons and cons["morale_boost"]:
        # Мораль — упрощённо: лояльность растёт
        for c in world.citizens.values():
            if c.alive:
                c.loyalty = min(100, c.loyalty + 10)

    if "chief_pressure" in cons and isinstance(cons.get("chief_pressure"), int):
        world.chief.pressure = cons["chief_pressure"]

    if "chronicle_entry" in cons:
        world.chronicle.append({
            "year": world.year,
            "season": world.season.name,
            "entry": cons["chronicle_entry"]
        })

    if "start_reform" in cons:
        world.chief.completed_reforms.append(cons["start_reform"])
        # Реформа снижает давление
        world.chief.pressure = max(0, world.chief.pressure - 20)

    # Событие в лог
    world.resolved_events.append({
        "turn": world.turn,
        "year": world.year,
        "season": world.season.name,
        "event_type": event.type.name,
        "title": event.title,
        "choice": choice.label,
    })
    world.metrics["total_events"] += 1
    world.metrics["events_this_turn"] += 1


# ============================================================================
# GAME LOOP (T-001, D-015)
# ============================================================================

def advance_season(world: WorldState):
    """Смена сезона (D-015 — темп «вождя»: 1 ход = 1 сезон)"""
    season_order = [Season.SPRING, Season.SUMMER, Season.AUTUMN, Season.WINTER]
    idx = season_order.index(world.season)
    world.season = season_order[(idx + 1) % 4]
    if world.season == Season.SPRING:
        world.year += 1
        # Весна — рождаемость
        _handle_births(world)
    elif world.season == Season.WINTER:
        world.metrics["winters_survived"] += 1


def _handle_births(world: WorldState):
    """Весной — рождения (с учётом перенаселения)"""
    alive_count = sum(1 for c in world.citizens.values() if c.alive)
    # Перенаселение — при >80 чел рождаемость падает
    birth_chance = 0.3 if alive_count < 80 else 0.15 if alive_count < 120 else 0.05

    fertile = [c for c in world.citizens.values()
              if c.alive and c.gender == Gender.FEMALE and 18 <= c.age <= 35]
    births = 0
    for c in fertile:
        if world.rng.random() < birth_chance:
            births += 1
    for _ in range(births):
        new_id = max(world.citizens.keys()) + 1 if world.citizens else 1
        gender = world.rng.choice([Gender.MALE, Gender.FEMALE])
        name = _gen_name(world.rng, gender)
        new_c = Citizen(
            id=new_id, name=name, gender=gender, age=0, birth_year=world.year
        )
        world.citizens[new_id] = new_c
        world.settlement.births_this_year += 1


NAMES_MALE = ["Борис", "Карл", "Олаф", "Сигурд", "Эрик", "Хрольв", "Гуннар", "Торстен",
              "Свен", "Рагнар", "Ивар", "Бьорн", "Ульф", "Кнуд", "Хакон"]
NAMES_FEMALE = ["Анна", "Хельга", "Фрейя", "Сигрид", "Тора", "Ингрид", "Астрид", "Рагнхильд",
                "Гудрун", "Сольвейг", "Брунхильда", "Торгунна", "Эльза", "Карин"]


def _gen_name(rng, gender):
    if gender == Gender.MALE:
        return rng.choice(NAMES_MALE)
    return rng.choice(NAMES_FEMALE)


def simulate_turn(world: WorldState, ai_choice_strategy="auto"):
    """Один ход симуляции (T-001 — game loop)

    ai_choice_strategy:
        "auto" — автоматически выбирать первый выбор (для бенчмарка)
        "random" — случайный выбор
        "smart" — эвристический выбор (минимизировать давление/голод)
    """
    world.turn += 1
    world.metrics["decisions_this_turn"] = 0
    world.metrics["events_this_turn"] = 0
    world.metrics["turns_played"] += 1

    # DEBUG
    s_before = world.settlement
    debug_before = (s_before.meat, s_before.berries, s_before.fish)

    # 1. Проверка триггеров → события
    system_events_check(world)

    # 2. Resolve событий (auto для бенчмарка)
    if world.pending_events:
        # Сортируем по приоритету (CRITICAL = 0 — высший)
        world.pending_events.sort(key=lambda e: e.priority)
        # Берем топ-5 (T-005 — лимит очереди)
        to_resolve = world.pending_events[:5]
        world.pending_events = world.pending_events[5:]

        for event in to_resolve:
            choice_idx = _choose_event(world, event, ai_choice_strategy)
            resolve_event(world, event, choice_idx)
            world.metrics["decisions_this_turn"] += 1
            world.metrics["total_decisions"] += 1

    # 3. Симуляция систем
    system_citizen_needs(world)
    system_citizen_actions(world)
    production = system_production(world)
    dead = system_consumption(world)
    system_factions(world)
    system_chief(world)
    system_aging_and_death(world)
    system_random_crises(world)  # кризисы для напряжения

    # DEBUG — вывести если первый ход или есть проблема
    if world.turn <= 0:  # отключено
        alive = sum(1 for c in world.citizens.values() if c.alive)
        # Подсчёт по действиям
        action_counts = {}
        for c in world.citizens.values():
            if c.alive:
                a = c.current_action.name
                action_counts[a] = action_counts.get(a, 0) + 1
        print(f"  [DEBUG turn {world.turn} {world.season.name}] "
              f"до: мясо={debug_before[0]} ягоды={debug_before[1]} рыба={debug_before[2]} | "
              f"произведено: мясо={production['meat']} ягоды={production['berries']} рыба={production['fish']} | "
              f"после: мясо={world.settlement.meat} ягоды={world.settlement.berries} рыба={world.settlement.fish} | "
              f"alive={alive}")
        print(f"    действия: {action_counts}")

    # 4. Обновление давления вождя в метриках
    if world.chief:
        world.metrics["max_pressure"] = max(world.metrics["max_pressure"], world.chief.pressure)

    # 5. Смена сезона
    advance_season(world)

    return dead


def _choose_event(world: WorldState, event: GameEvent, strategy: str) -> int:
    """Выбор в событии по стратегии (для auto-симуляции)"""
    if strategy == "auto":
        return 0  # первый выбор
    elif strategy == "random":
        return world.rng.randrange(len(event.choices))
    elif strategy == "smart":
        # Эвристика: минимизировать давление, голод, обиду
        best_idx = 0
        best_score = -999
        for i, choice in enumerate(event.choices):
            score = 0
            cons = choice.consequences
            if "chief_pressure" in cons:
                if cons["chief_pressure"] == "inherit":
                    score -= 30
                elif isinstance(cons["chief_pressure"], int):
                    score += (50 - cons["chief_pressure"])  # меньше — лучше
            if "legitimacy" in cons:
                score += cons["legitimacy"]  # больше — лучше
            if "grievance_all" in cons:
                score -= cons["grievance_all"]
            if "all_to_food" in cons and cons["all_to_food"]:
                score += 20  # при голоде — хорошо
            if "morale_boost" in cons and cons["morale_boost"]:
                score += 10
            if "start_reform" in cons:
                score += 15  # реформы снижают давление
            if "priority_shift" in cons:
                if cons["priority_shift"].get("stockpile", 0) > 0:
                    score += 5  # запасы на зиму — хорошо
            if score > best_score:
                best_score = score
                best_idx = i
        return best_idx
    return 0


# ============================================================================
# ИНИЦИАЛИЗАЦИЯ (D-008 стартовый пакет, D-015 онбординг)
# ============================================================================

def init_world(archetype: TribeArchetype = TribeArchetype.FOREST,
               population: int = 50, seed: int = 42) -> WorldState:
    """Инициализация мира для вертикального среза (D-008)"""
    rng = random.Random(seed)
    world = WorldState(seed=seed, archetype=archetype, rng=rng)

    # D-015 — старт с летом (игрок готовится к зиме, а не падает в неё)
    world.season = Season.SUMMER

    # Поселение
    world.settlement = Settlement(name="Стойбище у Реки", population=population)

    # Стартовые ресурсы (D-008) — больше, чтобы пережить первую зиму
    world.settlement.meat = 50
    world.settlement.berries = 60
    world.settlement.fish = 30
    world.settlement.wood = 40
    world.settlement.stone = 20
    world.settlement.hides = 10

    # Вождь (D-001) — с навыками по архетипу + бонус вождя
    chief_id = 1
    chief_name = _gen_name(rng, Gender.MALE)
    chief_skills = _gen_skills_for_archetype(rng, archetype)
    chief_citizen = Citizen(
        id=chief_id, name=chief_name, gender=Gender.MALE,
        age=rng.randint(25, 35), birth_year=world.year - 30,
        hunt_skill=min(100, chief_skills["hunt"] + 20),
        gather_skill=chief_skills["gather"],
        fish_skill=chief_skills["fish"],
        build_skill=chief_skills["build"],
        craft_skill=chief_skills["craft"],
        loyalty=90,
        family_role="head",
    )
    world.citizens[chief_id] = chief_citizen
    world.chief = Chief(
        citizen_id=chief_id,
        name=chief_name,
        age=chief_citizen.age,
        era=ChiefEra.YOUNG,
        reign_start_year=world.year,
    )

    # Граждане — с навыками по архетипу (D-009)
    for i in range(2, population + 1):
        gender = rng.choice([Gender.MALE, Gender.FEMALE])
        age = rng.choices(
            [rng.randint(0, 15), rng.randint(16, 35), rng.randint(36, 55), rng.randint(56, 70)],
            weights=[30, 40, 20, 10]
        )[0]
        name = _gen_name(rng, gender)
        skills = _gen_skills_for_archetype(rng, archetype)
        c = Citizen(
            id=i, name=name, gender=gender, age=age, birth_year=world.year - age,
            hunt_skill=skills["hunt"],
            gather_skill=skills["gather"],
            fish_skill=skills["fish"],
            build_skill=skills["build"],
            craft_skill=skills["craft"],
            loyalty=rng.randint(50, 80),
        )
        world.citizens[i] = c

    # Фракции (D-004 — 3 в палеолите)
    world.factions[FactionType.HUNTERS] = Faction(
        type=FactionType.HUNTERS, name="Охотники",
        power=40, grievance=0, agenda="больше мяса"
    )
    world.factions[FactionType.PRIESTS] = Faction(
        type=FactionType.PRIESTS, name="Жречество",
        power=25, grievance=0, agenda="больше ритуалов"
    )
    world.factions[FactionType.ELDERS] = Faction(
        type=FactionType.ELDERS, name="Старейшины",
        power=35, grievance=0, agenda="стабильность"
    )

    return world


# ============================================================================
# ЗАПУСК ПРОТОТИПА
# ============================================================================

def print_state(world: WorldState, turn: int):
    """Вывод состояния для отладки"""
    alive = sum(1 for c in world.citizens.values() if c.alive)
    hungry = sum(1 for c in world.citizens.values() if c.alive and c.hunger > 60)
    s = world.settlement
    print(f"\n--- Ход {turn} | {world.season.name} {world.year} до н.э. ---")
    print(f"  Население: {alive} (голодает: {hungry})")
    print(f"  Запасы: мясо {s.meat}, ягоды {s.berries}, рыба {s.fish}, дерево {s.wood}")
    print(f"  Вождь {world.chief.name}: возраст {world.chief.age}, "
          f"эра {world.chief.era.name}, давление {world.chief.pressure}, "
          f"легитимность {world.chief.legitimacy}")
    for f in world.factions.values():
        print(f"  Фракция {f.name}: сила {f.power}, обида {f.grievance}")
    print(f"  Метрики: решений {world.metrics['decisions_this_turn']}, "
          f"событий {world.metrics['events_this_turn']}")


def print_summary(world: WorldState):
    """Итоговый отчёт (T-008 — метрики успеха)"""
    alive = sum(1 for c in world.citizens.values() if c.alive)
    total_turns = world.metrics["turns_played"]
    print("\n" + "=" * 70)
    print("ИТОГОВЫЙ ОТЧЁТ ВЕРТИКАЛЬНОГО СРЕЗА")
    print("=" * 70)
    print(f"Ходов сыграно: {total_turns} ({total_turns // 4} лет)")
    print(f"Население: стартовое 50 → финальное {alive}")
    print(f"Зим пережито: {world.metrics['winters_survived']}")
    print(f"Всего событий: {world.metrics['total_events']}")
    print(f"Всего решений: {world.metrics['total_decisions']}")
    if total_turns > 0:
        decisions_per_hour = world.metrics["total_decisions"] / (total_turns / 60)  # условно 60 ходов = 1 час
        print(f"Решений в час (условный): {decisions_per_hour:.1f}")
        print(f"  Цель по D-015: ≥ 5. {'✅ OK' if decisions_per_hour >= 5 else '❌ НИЖЕ ЦЕЛИ'}")
    print(f"Максимальное давление вождя: {world.metrics['max_pressure']}/100")
    print(f"  Вождь: {world.chief.name}, возраст {world.chief.age}, эра {world.chief.era.name}")
    print(f"  Легитимность: {world.chief.legitimacy}")
    print(f"  Завершённых реформ: {len(world.chief.completed_reforms)}")

    print(f"\nФракции (финал):")
    for f in world.factions.values():
        status = "✅" if f.grievance < 60 else "⚠️" if f.grievance < 80 else "🔥"
        print(f"  {status} {f.name}: сила {f.power}, обида {f.grievance}")

    print(f"\nХроника (последние 10):")
    for entry in world.chronicle[-10:]:
        print(f"  {entry['year']} {entry['season']}: {entry['entry']}")

    print(f"\nРешённые события (последние 15):")
    for ev in world.resolved_events[-15:]:
        print(f"  Ход {ev['turn']} ({ev['season']} {ev['year']}): "
              f"{ev['title']} → {ev['choice']}")

    # Вердикт
    print("\n" + "=" * 70)
    print("ВЕРДИКТ")
    print("=" * 70)
    if alive >= 30:
        print("✅ Племя выжило (≥30 чел из 50)")
    elif alive >= 10:
        print("⚠️ Племя на грани (10-29 чел)")
    else:
        print("❌ Племя погибло (<10 чел)")

    if world.chief.pressure < 80:
        print("✅ Вождь удержался (давление <80)")
    else:
        print("⚠️ Вождь под давлением (≥80)")

    rebellious = sum(1 for f in world.factions.values() if f.grievance > 80)
    if rebellious == 0:
        print("✅ Нет мятежных фракций")
    else:
        print(f"⚠️ {rebellious} фракций в ярости")


def collect_metrics(world: WorldState, run_config: dict) -> dict:
    """Собрать метрики прогона для JSON-вывода (T-008)"""
    alive = sum(1 for c in world.citizens.values() if c.alive)
    hungry = sum(1 for c in world.citizens.values() if c.alive and c.hunger > 60)
    total_turns = world.metrics["turns_played"]
    years = total_turns // 4

    # События по типам
    events_by_type = {}
    for ev in world.resolved_events:
        et = ev["event_type"]
        events_by_type[et] = events_by_type.get(et, 0) + 1

    # Причины смерти
    death_causes = {}
    for c in world.citizens.values():
        if not c.alive and c.death_cause:
            death_causes[c.death_cause] = death_causes.get(c.death_cause, 0) + 1

    # Фракции
    factions_state = {}
    for ftype, f in world.factions.items():
        factions_state[f.name] = {
            "power": f.power,
            "grievance": f.grievance,
        }

    # Вердикт
    verdict = {
        "tribe_survived": alive >= 30,
        "chief_alive": world.chief.pressure < 100 and world.chief.age < 80,
        "no_rebellions": all(f.grievance < 80 for f in world.factions.values()),
    }
    verdict_score = sum(verdict.values())  # 0-3

    return {
        "config": run_config,
        "summary": {
            "turns_played": total_turns,
            "years_simulated": years,
            "population_start": run_config["population"],
            "population_final": alive,
            "population_change": alive - run_config["population"],
            "hungry_final": hungry,
            "winters_survived": world.metrics["winters_survived"],
            "total_events": world.metrics["total_events"],
            "total_decisions": world.metrics["total_decisions"],
            "decisions_per_hour": (world.metrics["total_decisions"] / (total_turns / 60)) if total_turns > 0 else 0,
            "max_chief_pressure": world.metrics["max_pressure"],
            "reforms_completed": len(world.chief.completed_reforms),
            "chief_age": world.chief.age,
            "chief_era": world.chief.era.name,
            "chief_legitimacy": world.chief.legitimacy,
            "chronicle_entries": len(world.chronicle),
        },
        "events_by_type": events_by_type,
        "death_causes": death_causes,
        "factions_final": factions_state,
        "verdict": verdict,
        "verdict_score": verdict_score,  # 0-3 (3 = идеально)
        "verdict_label": ["❌❌❌ гибель", "⚠️❌❌ тяжело", "✅⚠️❌ выжили с проблемами", "✅✅✅ идеально"][verdict_score],
    }


def main():
    import argparse
    parser = argparse.ArgumentParser(description="DeepTime Vertical Slice Prototype")
    parser.add_argument("--seed", type=int, default=42, help="RNG seed")
    parser.add_argument("--strategy", choices=["auto", "random", "smart"], default="smart",
                       help="AI strategy for event choices")
    parser.add_argument("--archetype", type=str, default="FOREST",
                       choices=["FOREST", "STEPPE", "RIVER_VALLEY", "COASTAL",
                               "MOUNTAIN", "DESERT", "TROPICAL", "ARCTIC"],
                       help="Tribe archetype (D-009)")
    parser.add_argument("--population", type=int, default=50, help="Starting population")
    parser.add_argument("--turns", type=int, default=100, help="Number of turns to simulate")
    parser.add_argument("--print-every", type=int, default=10, help="Print state every N turns (0 = silent)")
    parser.add_argument("--json", type=str, default="", help="Save metrics to JSON file")
    parser.add_argument("--quiet", action="store_true", help="No stdout output")
    args = parser.parse_args()

    archetype = TribeArchetype[args.archetype]

    if not args.quiet:
        print("=" * 70)
        print("DeepTime — Vertical Slice Prototype (Python, headless)")
        print(f"seed={args.seed} strategy={args.strategy} archetype={args.archetype} "
              f"pop={args.population} turns={args.turns}")
        print("=" * 70)

    # Инициализация
    world = init_world(archetype=archetype, population=args.population, seed=args.seed)

    if not args.quiet:
        print(f"\nСтарт: {world.settlement.name}, {world.archetype.name}")
        print(f"Вождь: {world.chief.name}, возраст {world.chief.age}")
        print(f"Население: {len(world.citizens)}")

    # Симуляция
    for turn in range(1, args.turns + 1):
        simulate_turn(world, ai_choice_strategy=args.strategy)

        if args.print_every > 0 and (turn % args.print_every == 0 or turn == 1):
            print_state(world, turn)

    # Итоговый отчёт
    if not args.quiet:
        print_summary(world)

    # JSON-вывод
    if args.json:
        run_config = {
            "seed": args.seed,
            "strategy": args.strategy,
            "archetype": args.archetype,
            "population": args.population,
            "turns": args.turns,
        }
        metrics = collect_metrics(world, run_config)
        import json
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(metrics, f, ensure_ascii=False, indent=2)
        if not args.quiet:
            print(f"\n📄 Метрики сохранены: {args.json}")


if __name__ == "__main__":
    main()
