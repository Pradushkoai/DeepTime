#!/usr/bin/env python3
"""
DeepTime — Extreme runs (экстремальные сценарии)

Тестирование краёв параметров:
- pop=10 (маленькое племя — риск вымирания)
- pop=200 (большое племя — тест производительности и перенаселения)
- pop=500 (очень большое — стресс-тест)
- turns=400 (100 лет — долгая игра)
- turns=1000 (250 лет — очень долгая)

Использование:
    python3 scripts/vertical_slice/extreme_runs.py
"""

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))

from batch_runs import run_batch, print_analysis


def main():
    print("=" * 80)
    print("DeepTime — EXTREME RUNS (экстремальные сценарии)")
    print("=" * 80)

    # === Сценарий 1: Маленькое племя (pop=10) ===
    print("\n" + "=" * 80)
    print("СЦЕНАРИЙ 1: Маленькое племя (pop=10, 100 лет)")
    print("=" * 80)
    archetypes_all = ["FOREST", "STEPPE", "RIVER_VALLEY", "COASTAL",
                      "MOUNTAIN", "DESERT", "TROPICAL", "ARCTIC"]
    results_1 = run_batch(archetypes_all, ["smart"], [42, 100, 1000],
                          turns=400, population=10, output_subdir="extreme/pop10")

    # === Сценарий 2: Большое племя (pop=200) ===
    print("\n" + "=" * 80)
    print("СЦЕНАРИЙ 2: Большое племя (pop=200, 100 лет)")
    print("=" * 80)
    results_2 = run_batch(archetypes_all, ["smart"], [42, 100, 1000],
                          turns=400, population=200, output_subdir="extreme/pop200")

    # === Сценарий 3: Очень большое племя (pop=500) — стресс ===
    print("\n" + "=" * 80)
    print("СЦЕНАРИЙ 3: Очень большое племя (pop=500, 100 лет) — стресс-тест")
    print("=" * 80)
    results_3 = run_batch(archetypes_all, ["smart"], [42],
                          turns=400, population=500, output_subdir="extreme/pop500")

    # === Сценарий 4: Очень долгая игра (turns=1000 = 250 лет) ===
    print("\n" + "=" * 80)
    print("СЦЕНАРИЙ 4: Очень долгая игра (1000 ходов = 250 лет, pop=50)")
    print("=" * 80)
    results_4 = run_batch(["FOREST", "STEPPE", "COASTAL", "TROPICAL"],
                          ["smart"], [42, 100],
                          turns=1000, population=50, output_subdir="extreme/long250y")

    # === Анализ ===
    print("\n" + "=" * 80)
    print("ИТОГОВЫЙ АНАЛИЗ ЭКСТРЕМАЛЬНЫХ СЦЕНАРИЕВ")
    print("=" * 80)

    print("\n📊 Сценарий 1: pop=10 (маленькое племя, 100 лет)")
    print(f"{'Архетип':15s} | {'Нас.фин':>8s} | {'Δнас':>6s} | {'Давл':>5s} | {'Верд':>6s}")
    print("-" * 60)
    for m in results_1:
        c = m["config"]
        s = m["summary"]
        print(f"{c['archetype']:15s} | {s['population_final']:8d} | {s['population_change']:+6d} | "
              f"{s['max_chief_pressure']:5d} | {m['verdict_score']:6d}/3 {m['verdict_label']}")
    avg_1 = sum(m["verdict_score"] for m in results_1) / len(results_1)
    survived_1 = sum(1 for m in results_1 if m["summary"]["population_final"] >= 5)
    print(f"Средний вердикт: {avg_1:.2f}/3 | Выжило: {survived_1}/{len(results_1)}")

    print("\n📊 Сценарий 2: pop=200 (большое племя, 100 лет)")
    print(f"{'Архетип':15s} | {'Нас.фин':>8s} | {'Δнас':>6s} | {'Давл':>5s} | {'Верд':>6s} | {'Время':>6s}")
    print("-" * 70)
    for m in results_2:
        c = m["config"]
        s = m["summary"]
        print(f"{c['archetype']:15s} | {s['population_final']:8d} | {s['population_change']:+6d} | "
              f"{s['max_chief_pressure']:5d} | {m['verdict_score']:6d}/3 | {m['elapsed_seconds']:5.1f}s")
    avg_2 = sum(m["verdict_score"] for m in results_2) / len(results_2)
    print(f"Средний вердикт: {avg_2:.2f}/3")

    print("\n📊 Сценарий 3: pop=500 (стресс-тест, 100 лет)")
    print(f"{'Архетип':15s} | {'Нас.фин':>8s} | {'Δнас':>6s} | {'Давл':>5s} | {'Верд':>6s} | {'Время':>6s}")
    print("-" * 70)
    for m in results_3:
        c = m["config"]
        s = m["summary"]
        print(f"{c['archetype']:15s} | {s['population_final']:8d} | {s['population_change']:+6d} | "
              f"{s['max_chief_pressure']:5d} | {m['verdict_score']:6d}/3 | {m['elapsed_seconds']:5.1f}s")
    avg_3 = sum(m["verdict_score"] for m in results_3) / len(results_3)
    print(f"Средний вердикт: {avg_3:.2f}/3")

    print("\n📊 Сценарий 4: 250 лет (очень долгая игра)")
    print(f"{'Архетип':15s} | {'Нас.фин':>8s} | {'Δнас':>6s} | {'Давл':>5s} | {'Реформ':>6s} | {'Верд':>6s} | {'Лет':>4s}")
    print("-" * 75)
    for m in results_4:
        c = m["config"]
        s = m["summary"]
        print(f"{c['archetype']:15s} | {s['population_final']:8d} | {s['population_change']:+6d} | "
              f"{s['max_chief_pressure']:5d} | {s['reforms_completed']:6d} | "
              f"{m['verdict_score']:6d}/3 | {s['years_simulated']:4d}")
    avg_4 = sum(m["verdict_score"] for m in results_4) / len(results_4)
    print(f"Средний вердикт: {avg_4:.2f}/3")

    # Сводка
    print("\n" + "=" * 80)
    print("СВОДКА ЭКСТРЕМАЛЬНЫХ СЦЕНАРИЕВ")
    print("=" * 80)
    print(f"Сценарий 1 (pop=10): {survived_1}/{len(results_1)} выжило, средний вердикт {avg_1:.2f}/3")
    print(f"Сценарий 2 (pop=200): средний вердикт {avg_2:.2f}/3")
    print(f"Сценарий 3 (pop=500): средний вердикт {avg_3:.2f}/3")
    print(f"Сценарий 4 (250 лет): средний вердикт {avg_4:.2f}/3")


if __name__ == "__main__":
    main()
