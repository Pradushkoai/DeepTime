#!/usr/bin/env python3
"""
DeepTime — Batch runs для Vertical Slice Prototype

Запускает серию прогонов с разными параметрами:
- 8 архетипов × 3 стратегии × 3 seed = 72 прогона
- Сохраняет каждый прогон в JSON
- Создает сводный CSV + сводный JSON
- Выводит таблицу результатов в stdout

Использование:
    python3 scripts/vertical_slice/batch_runs.py
    python3 scripts/vertical_slice/batch_runs.py --turns 200
    python3 scripts/vertical_slice/batch_runs.py --archetypes FOREST,STEPPE --seeds 42,100
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path


SCRIPT_DIR = Path(__file__).parent
PROTOTYPE = SCRIPT_DIR / "vertical_slice_prototype.py"
RESULTS_DIR = SCRIPT_DIR / "results"


def run_single(archetype: str, strategy: str, seed: int, turns: int, population: int) -> dict:
    """Запустить один прогон и вернуть метрики из JSON"""
    json_path = RESULTS_DIR / f"run_{archetype}_{strategy}_seed{seed}.json"

    cmd = [
        sys.executable, str(PROTOTYPE),
        "--archetype", archetype,
        "--strategy", strategy,
        "--seed", str(seed),
        "--turns", str(turns),
        "--population", str(population),
        "--print-every", "0",
        "--quiet",
        "--json", str(json_path),
    ]

    start_time = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    elapsed = time.time() - start_time

    if result.returncode != 0:
        print(f"❌ Ошибка {archetype}/{strategy}/seed{seed}: {result.stderr[:200]}")
        return None

    # Читаем JSON
    with open(json_path, "r", encoding="utf-8") as f:
        metrics = json.load(f)

    metrics["elapsed_seconds"] = round(elapsed, 2)
    return metrics


def run_batch(archetypes, strategies, seeds, turns, population):
    """Запустить серию прогонов"""
    RESULTS_DIR.mkdir(exist_ok=True)

    total = len(archetypes) * len(strategies) * len(seeds)
    print(f"\n🚀 Запуск {total} прогонов: {len(archetypes)} архетипов × "
          f"{len(strategies)} стратегий × {len(seeds)} seeds")
    print(f"   turns={turns}, population={population}")
    print(f"   Папка результатов: {RESULTS_DIR}\n")

    all_results = []
    count = 0

    for archetype in archetypes:
        for strategy in strategies:
            for seed in seeds:
                count += 1
                print(f"  [{count}/{total}] {archetype:15s} | {strategy:6s} | seed={seed:3d} ...", end=" ", flush=True)
                metrics = run_single(archetype, strategy, seed, turns, population)
                if metrics:
                    verdict_label = metrics["verdict_label"]
                    pop_final = metrics["summary"]["population_final"]
                    pressure = metrics["summary"]["max_chief_pressure"]
                    print(f"нас={pop_final:3d} давл={pressure:3d} | {verdict_label}")
                    all_results.append(metrics)
                else:
                    print("ОШИБКА")

    # Сводный JSON
    summary_path = RESULTS_DIR / "all_runs_summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\n📄 Сводный JSON: {summary_path}")

    # CSV
    csv_path = RESULTS_DIR / "all_runs_summary.csv"
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write("archetype,strategy,seed,population_final,population_change,"
                "winters_survived,total_events,total_decisions,decisions_per_hour,"
                "max_pressure,reforms_completed,chief_age,chief_era,chief_legitimacy,"
                "verdict_score,verdict_label,hunters_grievance,priests_grievance,elders_grievance,"
                "deaths_hunger,deaths_old_age,deaths_disease,deaths_predator,deaths_total,elapsed_seconds\n")
        for m in all_results:
            s = m["summary"]
            v = m["verdict"]
            f_ = m["factions_final"]
            d = m["death_causes"]
            f.write(f"{m['config']['archetype']},{m['config']['strategy']},{m['config']['seed']},"
                   f"{s['population_final']},{s['population_change']},"
                   f"{s['winters_survived']},{s['total_events']},{s['total_decisions']},"
                   f"{s['decisions_per_hour']:.1f},"
                   f"{s['max_chief_pressure']},{s['reforms_completed']},"
                   f"{s['chief_age']},{s['chief_era']},{s['chief_legitimacy']},"
                   f"{m['verdict_score']},{m['verdict_label']},"
                   f"{f_.get('Охотники',{}).get('grievance',0)},"
                   f"{f_.get('Жречество',{}).get('grievance',0)},"
                   f"{f_.get('Старейшины',{}).get('grievance',0)},"
                   f"{d.get('голод',0)},{d.get('старость',0)},"
                   f"{d.get('болезнь',0)},{d.get('хищник',0)},"
                   f"{sum(d.values())},{m['elapsed_seconds']}\n")
    print(f"📄 Сводный CSV: {csv_path}")

    return all_results


def print_analysis(results):
    """Анализ результатов — какие параметры дают лучший баланс"""
    print("\n" + "=" * 80)
    print("АНАЛИЗ РЕЗУЛЬТАТОВ")
    print("=" * 80)

    # Группировка по архетипу
    by_archetype = {}
    for m in results:
        a = m["config"]["archetype"]
        by_archetype.setdefault(a, []).append(m)

    print("\n📊 По архетипам (среднее по всем прогонам):")
    print(f"{'Архетип':15s} | {'Нас.фин':>8s} | {'Δнас':>6s} | {'Давл':>5s} | {'Реш/ч':>6s} | {'Соб':>5s} | {'Реформ':>6s} | {'Верд':>6s} | {'Время':>6s}")
    print("-" * 90)
    for a, runs in sorted(by_archetype.items()):
        pop_f = sum(r["summary"]["population_final"] for r in runs) / len(runs)
        pop_d = sum(r["summary"]["population_change"] for r in runs) / len(runs)
        press = sum(r["summary"]["max_chief_pressure"] for r in runs) / len(runs)
        dph = sum(r["summary"]["decisions_per_hour"] for r in runs) / len(runs)
        ev = sum(r["summary"]["total_events"] for r in runs) / len(runs)
        reforms = sum(r["summary"]["reforms_completed"] for r in runs) / len(runs)
        score = sum(r["verdict_score"] for r in runs) / len(runs)
        elapsed = sum(r["elapsed_seconds"] for r in runs) / len(runs)
        print(f"{a:15s} | {pop_f:8.1f} | {pop_d:+6.1f} | {press:5.1f} | {dph:6.1f} | {ev:5.1f} | {reforms:6.1f} | {score:6.2f}/3 | {elapsed:5.1f}s")

    # Группировка по стратегии
    by_strategy = {}
    for m in results:
        s = m["config"]["strategy"]
        by_strategy.setdefault(s, []).append(m)

    print("\n📊 По стратегиям (среднее по всем прогонам):")
    print(f"{'Стратегия':10s} | {'Нас.фин':>8s} | {'Δнас':>6s} | {'Давл':>5s} | {'Реш/ч':>6s} | {'Верд':>6s}")
    print("-" * 60)
    for s, runs in sorted(by_strategy.items()):
        pop_f = sum(r["summary"]["population_final"] for r in runs) / len(runs)
        pop_d = sum(r["summary"]["population_change"] for r in runs) / len(runs)
        press = sum(r["summary"]["max_chief_pressure"] for r in runs) / len(runs)
        dph = sum(r["summary"]["decisions_per_hour"] for r in runs) / len(runs)
        score = sum(r["verdict_score"] for r in runs) / len(runs)
        print(f"{s:10s} | {pop_f:8.1f} | {pop_d:+6.1f} | {press:5.1f} | {dph:6.1f} | {score:6.2f}/3")

    # Топ-5 и худшие-5
    sorted_results = sorted(results, key=lambda r: r["verdict_score"], reverse=True)
    print("\n🏆 Топ-5 лучших прогонов:")
    for m in sorted_results[:5]:
        s = m["summary"]
        c = m["config"]
        print(f"  {c['archetype']:15s} | {c['strategy']:6s} | seed={c['seed']:3d} | "
              f"нас={s['population_final']:3d} давл={s['max_chief_pressure']:3d} | "
              f"{m['verdict_label']}")

    print("\n💀 Худшие-5 прогонов:")
    for m in sorted_results[-5:]:
        s = m["summary"]
        c = m["config"]
        print(f"  {c['archetype']:15s} | {c['strategy']:6s} | seed={c['seed']:3d} | "
              f"нас={s['population_final']:3d} давл={s['max_chief_pressure']:3d} | "
              f"{m['verdict_label']}")

    # Причины смерти (агрегированно)
    print("\n⚰️ Причины смерти (агрегированно по всем прогонам):")
    death_total = {}
    for m in results:
        for cause, count in m["death_causes"].items():
            death_total[cause] = death_total.get(cause, 0) + count
    for cause, count in sorted(death_total.items(), key=lambda x: -x[1]):
        print(f"  {cause:15s}: {count:5d}")

    # События (агрегированно)
    print("\n🎉 События (агрегированно по всем прогонам):")
    event_total = {}
    for m in results:
        for et, count in m["events_by_type"].items():
            event_total[et] = event_total.get(et, 0) + count
    for et, count in sorted(event_total.items(), key=lambda x: -x[1]):
        print(f"  {et:25s}: {count:5d}")


def main():
    parser = argparse.ArgumentParser(description="DeepTime batch runs")
    parser.add_argument("--archetypes", type=str, default="FOREST,STEPPE,RIVER_VALLEY,COASTAL,MOUNTAIN,DESERT,TROPICAL,ARCTIC",
                       help="Comma-separated archetypes (default: all 8)")
    parser.add_argument("--strategies", type=str, default="auto,random,smart",
                       help="Comma-separated strategies (default: all 3)")
    parser.add_argument("--seeds", type=str, default="42,100,1000",
                       help="Comma-separated seeds (default: 42,100,1000)")
    parser.add_argument("--turns", type=int, default=100, help="Turns per run")
    parser.add_argument("--population", type=int, default=50, help="Starting population")
    args = parser.parse_args()

    archetypes = [a.strip() for a in args.archetypes.split(",")]
    strategies = [s.strip() for s in args.strategies.split(",")]
    seeds = [int(s.strip()) for s in args.seeds.split(",")]

    results = run_batch(archetypes, strategies, seeds, args.turns, args.population)
    print_analysis(results)

    print(f"\n✅ Готово. Всего прогонов: {len(results)}")
    print(f"   JSON-файлы: {RESULTS_DIR}/run_*.json")
    print(f"   Сводный JSON: {RESULTS_DIR}/all_runs_summary.json")
    print(f"   Сводный CSV: {RESULTS_DIR}/all_runs_summary.csv")


if __name__ == "__main__":
    main()
