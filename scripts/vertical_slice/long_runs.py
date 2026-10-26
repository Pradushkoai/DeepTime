#!/usr/bin/env python3
"""
DeepTime — Long runs (долгие прогоны)

400 ходов = 100 лет симуляции.
Цель: проверить, не вырождается ли симуляция на длинной дистанции.
- Перенаселение?
- Застой (нет событий)?
- Накопление давления?
- Деградация баланса?

Использование:
    python3 scripts/vertical_slice/long_runs.py
"""

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))

# Импортируем batch_runs
from batch_runs import run_batch, print_analysis


def main():
    # 8 архетипов × 3 стратегии × 3 seed = 72 прогона
    # 400 ходов = 100 лет (вместо 100 ходов = 25 лет)
    archetypes = ["FOREST", "STEPPE", "RIVER_VALLEY", "COASTAL",
                  "MOUNTAIN", "DESERT", "TROPICAL", "ARCTIC"]
    strategies = ["auto", "random", "smart"]
    seeds = [42, 100, 1000]

    print("=" * 80)
    print("DeepTime — LONG RUNS (долгие прогоны)")
    print("8 архетипов × 3 стратегии × 3 seed = 72 прогона")
    print("400 ходов = 100 лет симуляции")
    print("=" * 80)

    results = run_batch(archetypes, strategies, seeds, turns=400, population=50,
                       output_subdir="long_v036b")

    # Дополнительный анализ для долгих прогонов
    print("\n" + "=" * 80)
    print("СПЕЦИФИЧЕСКИЙ АНАЛИЗ ДЛЯ ДОЛГИХ ПРОГОНОВ")
    print("=" * 80)

    # Группировка по архетипу — финальное состояние
    by_archetype = {}
    for m in results:
        a = m["config"]["archetype"]
        by_archetype.setdefault(a, []).append(m)

    print("\n📊 Финальное состояние по архетипам (100 лет):")
    print(f"{'Архетип':15s} | {'Нас.фин':>8s} | {'Δнас (старт 50)':>15s} | {'Давл':>5s} | {'Реформ':>6s} | {'Верд':>6s} | {'Лет':>4s}")
    print("-" * 80)
    for a, runs in sorted(by_archetype.items()):
        pop_f = sum(r["summary"]["population_final"] for r in runs) / len(runs)
        pop_d = pop_f - 50
        press = sum(r["summary"]["max_chief_pressure"] for r in runs) / len(runs)
        reforms = sum(r["summary"]["reforms_completed"] for r in runs) / len(runs)
        score = sum(r["verdict_score"] for r in runs) / len(runs)
        years = sum(r["summary"]["years_simulated"] for r in runs) / len(runs)
        print(f"{a:15s} | {pop_f:8.1f} | {pop_d:+15.1f} | {press:5.1f} | {reforms:6.1f} | {score:6.2f}/3 | {years:4.0f}")

    # Перенаселение — если население > 200
    print("\n🌐 Перенаселение (>200 чел):")
    overpopulated = [m for m in results if m["summary"]["population_final"] > 200]
    if overpopulated:
        for m in overpopulated[:10]:
            c = m["config"]
            print(f"  {c['archetype']:15s} | {c['strategy']:6s} | seed={c['seed']:3d} | "
                  f"нас={m['summary']['population_final']:4d} | {m['verdict_label']}")
    else:
        print("  Нет перенаселения (все <200)")

    # Застой — мало событий (<50 за 100 лет)
    print("\n😴 Застой (<50 событий за 100 лет):")
    stagnant = [m for m in results if m["summary"]["total_events"] < 50]
    if stagnant:
        for m in stagnant[:10]:
            c = m["config"]
            print(f"  {c['archetype']:15s} | {c['strategy']:6s} | seed={c['seed']:3d} | "
                  f"соб={m['summary']['total_events']:4d} | нас={m['summary']['population_final']:4d}")
    else:
        print("  Нет застоя (все ≥50 событий)")

    # Вырождение — население <10
    print("\n💀 Вырождение (<10 чел):")
    degraded = [m for m in results if m["summary"]["population_final"] < 10]
    if degraded:
        for m in degraded:
            c = m["config"]
            print(f"  {c['archetype']:15s} | {c['strategy']:6s} | seed={c['seed']:3d} | "
                  f"нас={m['summary']['population_final']:4d} | {m['verdict_label']}")
    else:
        print("  Нет вырождения (все ≥10 чел)")

    # Смертность от голода — индикатор баланса
    print("\n⚰️ Смертность от голода (агрегированно):")
    hunger_deaths = sum(m["death_causes"].get("голод", 0) for m in results)
    total_deaths = sum(sum(m["death_causes"].values()) for m in results)
    print(f"  Голод: {hunger_deaths} из {total_deaths} смертей ({100*hunger_deaths/max(1,total_deaths):.1f}%)")

    # Реформы — индикатор динамики
    print("\n📜 Реформы (агрегированно):")
    total_reforms = sum(m["summary"]["reforms_completed"] for m in results)
    avg_reforms = total_reforms / len(results)
    print(f"  Всего: {total_reforms} | Среднее: {avg_reforms:.1f} за 100 лет на игру")


if __name__ == "__main__":
    main()
