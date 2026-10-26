#!/usr/bin/env python3
"""
DeepTime — Web UI для Vertical Slice Prototype

Flask-приложение, которое запускает симуляцию и позволяет игроку
делать ходы и выбирать в событиях через браузер.

Запуск:
    python3 scripts/vertical_slice/web/web_app.py
    → открой http://127.0.0.1:5001/
"""

import sys
import os
from pathlib import Path

# Добавить путь к прототипу
SCRIPT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(SCRIPT_DIR))

from flask import Flask, render_template, request, redirect, url_for, jsonify
from vertical_slice_prototype import (
    init_world, simulate_turn, _fire_event, resolve_event,
    TribeArchetype, Season, EventType, EventPriority,
)

app = Flask(__name__, template_folder="templates", static_folder="static")


@app.errorhandler(Exception)
def handle_exception(e):
    """Ловить все исключения чтобы сервер не падал"""
    import traceback
    print(f"[ERROR] {e}")
    traceback.print_exc()
    return f"Ошибка сервера: {e}", 500

# Глобальное состояние игры
WORLD = None
LAST_TURN_RESULT = None
GAME_CONFIG = {
    "archetype": "FOREST",
    "seed": 42,
    "population": 50,
    "strategy": "smart",  # для auto-resolve фоновых событий
}


def get_world():
    global WORLD
    if WORLD is None:
        WORLD = init_world(
            archetype=TribeArchetype[GAME_CONFIG["archetype"]],
            population=GAME_CONFIG["population"],
            seed=GAME_CONFIG["seed"],
        )
    return WORLD


def reset_world():
    global WORLD, LAST_TURN_RESULT
    WORLD = None
    LAST_TURN_RESULT = None


def get_state_dict():
    """Собрать состояние мира для отображения"""
    world = get_world()
    alive = [c for c in world.citizens.values() if c.alive]
    alive_count = len(alive)
    hungry = sum(1 for c in alive if c.hunger > 60)
    children = sum(1 for c in alive if c.age < 16)
    elders = sum(1 for c in alive if c.age >= 60)
    adults = alive_count - children - elders

    # Действия граждан
    action_counts = {}
    for c in alive:
        a = c.current_action.name
        action_counts[a] = action_counts.get(a, 0) + 1

    # Граждане для визуализации (canvas) — максимум 50 точек
    citizens_vis = []
    import random as _rng
    _rng2 = _rng.Random(world.seed + world.turn)
    for c in alive[:50]:
        action_color = {
            "HUNT": "#f04848",
            "GATHER": "#4ec9b0",
            "FISH": "#569cd6",
            "BUILD": "#dcdcaa",
            "REST": "#888",
            "RITUAL": "#c586c0",
            "IDLE": "#666",
        }.get(c.current_action.name, "#aaa")
        citizens_vis.append({
            "name": c.name,
            "age": c.age,
            "action": c.current_action.name,
            "color": action_color,
            "hunger": c.hunger,
            "x": _rng2.uniform(0.1, 0.9),
            "y": _rng2.uniform(0.15, 0.85),
        })

    # События ожидающие выбора
    pending = []
    for ev in world.pending_events[:5]:  # топ-5 по приоритету
        pending.append({
            "id": ev.id,
            "type": ev.type.name,
            "priority": ev.priority.name,
            "title": ev.title,
            "text": ev.text,
            "choices": [{"label": ch.label, "description": ch.description} for ch in ev.choices],
        })

    # Хроника (последние 15)
    chronicle = list(reversed(world.chronicle[-15:]))

    # Решённые события (последние 10)
    resolved = list(reversed(world.resolved_events[-10:]))

    # Фракции
    factions = []
    for f in world.factions.values():
        grievance_emoji = "✅" if f.grievance < 60 else "⚠️" if f.grievance < 90 else "🔥"
        factions.append({
            "name": f.name,
            "power": f.power,
            "grievance": f.grievance,
            "grievance_reason": f.grievance_reason,
            "emoji": grievance_emoji,
        })

    # Сезон
    season_emoji = {
        Season.SPRING: "🌱 ВЕСНА",
        Season.SUMMER: "☀️ ЛЕТО",
        Season.AUTUMN: "🍂 ОСЕНЬ",
        Season.WINTER: "❄️ ЗИМА",
    }[world.season]
    season_code = world.season.name  # SPRING/SUMMER/AUTUMN/WINTER для canvas

    return {
        "turn": world.turn,
        "year": world.year,
        "season": season_emoji,
        "season_code": season_code,
        "archetype": world.archetype.name,
        "alive": alive_count,
        "hungry": hungry,
        "children": children,
        "adults": adults,
        "elders": elders,
        "citizens_vis": citizens_vis,
        "huts": world.settlement.huts,
        "hearth": world.settlement.hearth,
        "settlement": {
            "name": world.settlement.name,
            "meat": world.settlement.meat,
            "berries": world.settlement.berries,
            "fish": world.settlement.fish,
            "wood": world.settlement.wood,
            "stone": world.settlement.stone,
        },
        "chief": {
            "name": world.chief.name,
            "age": world.chief.age,
            "era": world.chief.era.name,
            "pressure": world.chief.pressure,
            "legitimacy": world.chief.legitimacy,
            "reforms": len(world.chief.completed_reforms),
        },
        "factions": factions,
        "action_counts": action_counts,
        "pending_events": pending,
        "chronicle": chronicle,
        "resolved_events": resolved,
        "metrics": {
            "total_events": world.metrics["total_events"],
            "total_decisions": world.metrics["total_decisions"],
            "winters_survived": world.metrics["winters_survived"],
            "max_pressure": world.metrics["max_pressure"],
        },
        "game_over": alive_count == 0,
    }


@app.route("/")
def index():
    state = get_state_dict()
    return render_template("index.html", state=state, config=GAME_CONFIG)


@app.route("/next_turn", methods=["POST"])
def next_turn():
    """Сделать один ход симуляции"""
    global LAST_TURN_RESULT
    world = get_world()

    # Проверяем, есть ли pending events — если да, не делаем ход, пока игрок не выберет
    if world.pending_events:
        return redirect(url_for("index"))

    # Делаем ход
    dead = simulate_turn(world, ai_choice_strategy=GAME_CONFIG["strategy"])
    LAST_TURN_RESULT = {"dead_this_turn": len(dead) if dead else 0}
    return redirect(url_for("index"))


@app.route("/resolve_event/<int:event_id>/<int:choice_idx>", methods=["POST"])
def resolve_event_route(event_id, choice_idx):
    """Разрешить событие выбором игрока"""
    world = get_world()

    # Найти событие по id
    event = None
    for i, ev in enumerate(world.pending_events):
        if ev.id == event_id:
            event = ev
            break

    if event is None:
        return redirect(url_for("index"))

    # Resolve с выбранным индексом
    resolve_event(world, event, choice_idx)

    # Удалить из pending
    world.pending_events.remove(event)

    return redirect(url_for("index"))


@app.route("/auto_resolve_all", methods=["POST"])
def auto_resolve_all():
    """Автоматически разрешить все pending события (smart стратегией)"""
    world = get_world()
    while world.pending_events:
        ev = world.pending_events.pop(0)
        # smart выбор
        from vertical_slice_prototype import _choose_event
        choice_idx = _choose_event(world, ev, GAME_CONFIG["strategy"])
        resolve_event(world, ev, choice_idx)
    return redirect(url_for("index"))


@app.route("/reset", methods=["POST"])
def reset():
    """Сбросить игру с новыми параметрами"""
    archetype = request.form.get("archetype", "FOREST")
    seed = int(request.form.get("seed", 42))
    population = int(request.form.get("population", 50))
    strategy = request.form.get("strategy", "smart")

    GAME_CONFIG["archetype"] = archetype
    GAME_CONFIG["seed"] = seed
    GAME_CONFIG["population"] = population
    GAME_CONFIG["strategy"] = strategy

    reset_world()
    return redirect(url_for("index"))


@app.route("/auto_play/<int:turns>", methods=["POST"])
def auto_play(turns):
    """Авто-игра N ходов (для быстрого теста)"""
    world = get_world()
    for _ in range(turns):
        # Если есть pending events — resolve smart
        while world.pending_events:
            ev = world.pending_events.pop(0)
            from vertical_slice_prototype import _choose_event
            choice_idx = _choose_event(world, ev, GAME_CONFIG["strategy"])
            resolve_event(world, ev, choice_idx)
        # Делаем ход
        simulate_turn(world, ai_choice_strategy=GAME_CONFIG["strategy"])
        # Если игра окончена — выходим
        if sum(1 for c in world.citizens.values() if c.alive) == 0:
            break
    return redirect(url_for("index"))


@app.route("/api/state")
def api_state():
    """API endpoint — состояние в JSON"""
    return jsonify(get_state_dict())


if __name__ == "__main__":
    print("=" * 60)
    print("DeepTime — Web UI для Vertical Slice Prototype")
    print("=" * 60)
    print(f"Архетип: {GAME_CONFIG['archetype']}, seed: {GAME_CONFIG['seed']}, "
          f"pop: {GAME_CONFIG['population']}, стратегия: {GAME_CONFIG['strategy']}")
    print(f"Открой: http://127.0.0.1:5001/")
    print("=" * 60)
    # threaded=True чтобы сервер не умиал при нескольких запросах
    # debug=False но с error handler
    app.run(host="0.0.0.0", port=5001, debug=False, threaded=True)
