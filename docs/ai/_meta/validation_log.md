---
статус: ACTIVE
дата_обновления: 2026-10-25
тип: VALIDATION_LOG
---

# Validation Log — Валидация связей (Принцип 11)

> Результат валидации связей между элементами каталогов. Проверяется наличие входящих и исходящих связей у каждого элемента.

---

## Валидация от 2026-10-25 (v0.8)

**Всего элементов проверено**: 566

| Метрика | Значение | % |
|---|---|---|
| С явными разделами «Связи» | 106 | 18% |
| С любой ссылкой (implicit) | 544 | 96% |
| Висящие (без связей) | 22 | 3% |

### По каталогам

| Каталог | Всего | Явные связи | Любые ссылки | Висящие | Статус |
|---|---|---|---|---|---|
| resources | 288 | 0 | 280 | 8 | ⚠️ |
| processed_materials | 94 | 0 | 93 | 1 | ⚠️ |
| soils | 0 | 0 | 0 | 0 | ✅ |
| flora | 0 | 0 | 0 | 0 | ✅ |
| fauna | 0 | 0 | 0 | 0 | ✅ |
| items | 107 | 105 | 107 | 0 | ✅ |
| tech:processes | 20 | 0 | 20 | 0 | ✅ |
| tech:tech_tree | 45 | 0 | 34 | 11 | ⚠️ |
| tech:dependencies_graph | 12 | 1 | 10 | 2 | ⚠️ |

### Висящие элементы (детально)

| Каталог | Файл | Элемент |
|---|---|---|
| resources | 01_minerals_ores.md | Витерит |
| resources | 06_fibers_textiles.md | Верблюжья шерсть (Camel hair) |
| resources | 08_food_resources.md | Специи (см. 11_spices_medicinal.md) |
| resources | 09_hides_leather.md | Технологии обработки |
| resources | 09_hides_leather.md | Виды кожи (по типу обработки) |
| resources | 13_salts_minerals_chem.md | Селитра (см. 12_water_salt.md — Селитра) |
| resources | 13_salts_minerals_chem.md | Асфальт / Битум (см. 04_organic_fuels.md) |
| resources | 13_salts_minerals_chem.md | Мумия / Асфальт + смола (см. 04_organic_fuels.md) |
| processed_materials | 07_food_products.md | Мёд (см. [../resources/08_food_resources.md](../resources/08_food_resources.md)) |
| tech:tech_tree | tech_tree.md | Принципы (см. [prerequisites.md](prerequisites.md) и [_meta/ai_working_principles.md → Принцип 9](../_meta/ai_working_principles.md)) |
| tech:tech_tree | tech_tree.md | Стартовые технологии (известны с начала игры) |
| tech:tech_tree | tech_tree.md | Переход: Неолит → Халколит |
| tech:tech_tree | tech_tree.md | Переход: Халколит → Бронзовый век |
| tech:tech_tree | tech_tree.md | Переход: Бронза → Железный век |
| tech:tech_tree | tech_tree.md | Эпоха 6: Античность (~500 до н.э.) |
| tech:tech_tree | tech_tree.md | Эпоха 7: Средние века (5-15 в.) |
| tech:tech_tree | tech_tree.md | Эпоха 8: Ренессанс / Раннее Новое время (15-18 в.) |
| tech:tech_tree | tech_tree.md | Эпоха 9: Индустриальная (18-19 в.) |
| tech:tech_tree | tech_tree.md | Эпоха 10: Современная (20 в.) |
| tech:tech_tree | tech_tree.md | Эпоха 11: Электронная (конец 20 — 21 в.) |
| tech:dependencies_graph | dependencies_graph.md | Путь к стеклу (3 варианта) |
| tech:dependencies_graph | dependencies_graph.md | Путь к топливу |

### Рекомендации

1. Для элементов без связей → добавить разделы «Входящие связи» и «Исходящие связи»
2. Для элементов с неявными ссылками → формализовать в разделы
3. После исправления → запустить скрипт повторно

### Скрипт валидации

- **Файл**: `/home/z/my-project/scripts/validate_dependencies.py`
- **Запуск**: `python3 scripts/validate_dependencies.py`
- **Результат**: обновляет этот файл + выводит в консоль
