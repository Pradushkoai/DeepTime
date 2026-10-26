# Web UI для Vertical Slice Prototype

> 📋 Flask-приложение, которое запускает симуляцию и позволяет игроку делать ходы и выбирать в событиях через браузер.

## 🚀 Запуск под Windows (одной командой)

### Вариант 1: .bat файл (проще)

1. Скачай `run_windows.bat` из репозитория:
   https://github.com/Pradushkoai/DeepTime/raw/main/scripts/vertical_slice/web/run_windows.bat

2. Дважды кликни на файл.

Скрипт сам:
- Клонирует репо в `C:\Users\<ты>\DeepTime`
- Установит портативный Python (через uv, без прав админа)
- Поставит Flask
- Запустит сервер
- Откроет браузер на `http://127.0.0.1:5001/`

**Требования**: Windows 10/11, git (https://git-scm.com/download/win), интернет.

### Вариант 2: PowerShell

```powershell
# Скачать и запустить одной командой:
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/Pradushkoai/DeepTime/main/scripts/vertical_slice/web/run_windows.ps1 | iex"
```

Или вручную:
1. Скачай `run_windows.ps1`
2. Правый клик → "Run with PowerShell"

### Вариант 3: Ручной запуск (если уже есть Python)

```bash
git clone https://github.com/Pradushkoai/DeepTime.git
cd DeepTime
python -m pip install flask
python scripts/vertical_slice/web/web_app.py
# → открой http://127.0.0.1:5001/
```

## 🎮 Как играть

1. **Главная страница** — состояние племени (население, запасы, вождь, фракции)
2. **Кнопка "Следующий ход"** — делает один ход симуляции
3. **Кнопки "10 ходов" / "50 ходов"** — авто-игра (быстрый тест)
4. **События** — когда есть ожидающие события, показываются с выборами. Кликай на выбор.
5. **"Разрешить все события"** — авто-resolve всех событий smart-стратегией
6. **"Новая игра"** — сброс с новыми параметрами (архетип, seed, population, стратегия)

## 📊 Что показывается

### Левая колонка
- **Состояние племени**: ход, год, сезон, архетип, население (взрослые/дети/старики), голодающие
- **Вождь**: имя, возраст, эра, легитимность, давление (с прогресс-баром), реформы
- **Запасы**: мясо, ягоды, рыба, дерево
- **Действия граждан**: сколько охотятся/собирают/строят/отдыхают

### Средняя колонка
- **События** (ожидающие) — с приоритетом (CRITICAL красный, HIGH жёлтый, NORMAL зелёный, LOW серый)
- **Выборы** — кнопки с описанием последствий
- **Решённые события** — лог последних 10

### Правая колонка
- **Фракции**: сила + обида (с прогресс-баром), эмодзи-статус (✅/⚠️/🔥)
- **Хроника**: последние 15 записей (год, сезон, событие)
- **Метрики**: всего событий, решений, зим пережито, макс. давление

## 🎨 Цветовая схема

- Фон: тёмно-синий (#1a1a2e)
- Панели: тёмно-синий (#16213e)
- Акцент: оранжевый (#f5a623) — кнопки, заголовки
- Хорошее: зелёный (#4ec9b0)
- Предупреждение: жёлтый (#f5a623)
- Плохое: красный (#f04848)

## 🔧 API

- `GET /` — главная страница (HTML)
- `POST /next_turn` — сделать один ход
- `POST /auto_play/<N>` — авто-игра N ходов
- `POST /resolve_event/<event_id>/<choice_idx>` — выбрать в событии
- `POST /auto_resolve_all` — разрешить все события smart
- `POST /reset` — новая игра (параметры из формы)
- `GET /api/state` — состояние в JSON

## 📂 Структура

```
scripts/vertical_slice/web/
├── web_app.py              # Flask-приложение
├── run_windows.bat         # Windows launcher (.bat)
├── run_windows.ps1         # Windows launcher (PowerShell)
├── templates/
│   └── index.html          # главная страница
└── README.md               # этот файл
```

## 🔗 Связанные файлы

- [`../vertical_slice_prototype.py`](../vertical_slice_prototype.py) — симуляция
- [`../batch_runs.py`](../batch_runs.py) — серия прогонов
- [`../../docs/ai/14_architecture/vertical_slice_design.md`](../../docs/ai/14_architecture/vertical_slice_design.md) — T-008 спецификация
