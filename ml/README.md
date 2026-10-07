# ML Documentation - Omaha Hi-Lo

## Обзор

ML система для Omaha Hi-Lo использует нейросети TensorFlow.js для принятия решений в покере. Архитектура основана на двухступенчатом подходе: сначала оценивается equity руки, затем EV каждого действия.

## Архитектура

### Двухступенчатая модель

```
Features → Equity Network → Equity Prediction
           ↓
           EV Network → EV(fold/call/raise)
```

1. **Equity Network** — предсказывает вероятности исходов раздачи:
   - `high_win` — вероятность выиграть high
   - `low_win` — вероятность выиграть low
   - `scoop` — вероятность забрать весь банк
   - `quarter` — вероятность получить четверть банка
   - `lose` — вероятность проиграть

2. **EV Network** — предсказывает ожидаемую ценность действий:
   - `EV_fold` — EV при фолде (обычно 0)
   - `EV_call` — EV при колле
   - `EV_raise` — EV при рейзе

### Преимущества подхода

- Интерпретируемость: можно видеть, почему выбрано действие
- Возможность анализировать ошибки сети
- Разделение знаний о руке и о принятии решений

## Признаки (Features)

### Базовый набор (base)

Всего 24 признака, разделенных на категории:

#### Game Context
- `street` — этап игры (0=preflop, 1=flop, 2=turn, 3=river)
- `players_remaining` — количество активных игроков
- `position` — позиция за столом (нормализованная)
- `pot_bb` — размер банка в big blinds
- `stack_bb` — стек игрока в BB
- `spr` — Stack-to-Pot Ratio
- `to_call_bb` — сколько нужно коллировать в BB
- `pot_odds` — пот-оддсы

#### Hand Strength
- `preflop_score` — оценка стартовой руки (эвристика)
- `high_strength` — сила high руки (0-1)
- `low_strength` — сила low руки (0-1)
- `nut_high` — флаг: является ли рука nut high
- `nut_low` — флаг: является ли рука nut low

#### Outs
- `high_outs` — количество аутов на high (нормализовано)
- `low_outs` — количество аутов на low (нормализовано)
- `clean_high_outs` — чистые ауты на high
- `clean_low_outs` — чистые ауты на low

#### Board Texture
- `paired_board` — есть ли пара на борде
- `flush_possible` — возможен ли флеш
- `straight_possible` — возможен ли стрит
- `low_possible` — возможен ли low
- `board_low_cards` — количество low карт на борде
- `board_high_cards` — количество high карт на борде

#### Opponent Info
- `actor_has_acted` — действовал ли игрок уже
- `opp_raise_rate` — частота рейзов соперников
- `opp_jam_rate` — частота олл-инов соперников
- `opp_hand_aggro` — была ли агрессия в текущей руке

### Варианты наборов признаков

#### noPreflop
То же, что base, но без `preflop_score`. Используется для проверки, нужна ли эвристика.

#### ratioOuts
Заменяет абсолютные значения аутов на **отношения**:
- `nut_high_ratio` = nut_high / unseen_cards
- `nut_low_ratio` = nut_low / unseen_cards
- `keep_high_ratio` = clean_high_outs / unseen_cards
- `keep_low_ratio` = clean_low_outs / unseen_cards

Это нормализует признаки и делает их сопоставимыми между разными этапами игры.

#### nutScoop
Добавляет к base:
- `scoop_outs_ratio` — ауты на scoop / unseen_cards
- Все ratio из ratioOuts

Фокусируется на scoop-потенциале — ключевом аспекте Hi-Lo.

## Обучение

### Подготовка данных

1. **Генерация датасета** (`genDataset.js`)
   - Симуляция игр с разными ботами
   - Сохранение состояний для каждого решения
   - Результат: файл с сырыми данными

2. **Разметка датасета** (`labelDataset.js`)
   - Monte Carlo симуляция для каждого состояния
   - Расчет истинного equity (100K симуляций)
   - Расчет EV для каждого действия
   - Результат: помеченный датасет для обучения

### Процесс обучения

```bash
cd ml
npm run train -- --data=data/omaha4_8p_labeled.jsonl --set=base --epochs=20
```

Параметры:
- `--data` — путь к размеченному датасету
- `--set` — набор признаков (base, noPreflop, ratioOuts, nutScoop)
- `--epochs` — количество эпох
- `--batch` — размер батча (по умолчанию 256)
- `--val` — доля валидации (по умолчанию 0.1)
- `--warmStart` — путь к существующей модели для дообучения
- `--decisionEv` — режим EV: 'analytic' или 'trained'

### Выходные данные

Модели сохраняются в папку `models/<set>/`:
- `equity/model.json` + `equity/weights.bin` — equity network
- `ev/model.json` + `ev/weights.bin` — EV network
- `trainingMeta.json` — метаданные (нормализация, конфигурация)

## Инференс

### Загрузка моделей

```javascript
import { loadNeuralModels } from '@/helpers/neuralBot'

await loadNeuralModels('models')
```

### Принятие решений

```javascript
import { neuralDecision } from '@/helpers/neuralBot'

const action = neuralDecision(store, playerIndex, engine)
// Возвращает: 'fold', 'call' или 'raise'
```

### Логика принятия решений

1. Извлечение признаков из контекста игры
2. Нормализация признаков (используя mean/std из trainingMeta)
3. Предсказание equity через equity network
4. Предсказание EV через ev network (на основе equity)
5. Выбор действия с наилучшим EV

#### Аналитический EV (decisionEv: 'analytic')

Если в trainingMeta указано `decisionEv: 'analytic'`, EV для действий вычисляется по формуле, а не предсказывается сетью:

```
EV_call = (share * (pot + toCall) - toCall) / pot
EV_raise = binomial_model(opponents, call_prob, share)
```

Это более интерпретируемо и стабильно.

#### Тренированный EV (decisionEv: 'trained')

Сеть обучается предсказывать EV напрямую. Это может быть точнее, но менее интерпретируемо.

### Специальные правила

- **Nuts hand** — если у игрока абсолютный nuts, всегда коллировать или рейзить
- **All-in protection** — избегать all-in без сильной руки или хорошего equity
- **Pot-size raise** — рейз до размера банка по умолчанию

## Эксперименты

### Запуск экспериментов

```bash
cd ml
npm run experiments
```

Сравнивает разные наборы признаков на одном датасете и выводит метрики.

### Бенчмаркинг

```bash
cd ml
npm run benchmark
```

Запускает симуляции с нейросетевым ботом и собирает статистику.

## Метрики

### Метрики обучения

- `equityValMae` — Mean Absolute Error для equity
- `evValMae` — Mean Absolute Error для EV

### Метрики симуляции

- Win rate
- ROI
- Средний стек
- Частота действий

## Планы развития

Из папки `.opencode/plans/`:

### Feature Engineering (idea)

- **Dynamic features** — разные признаки для разных улиц
- **Nut-preserving ratio** — процент карт, сохраняющих nuts
- **Scoop probability** — явная вероятность забрать весь банк
- **Backdoor draws** — бэкдор-дро

### Архитектура

- **Opponent modeling** — учет стиля соперников
- **Position-aware** — более сложное позиционирование
- **Multi-street planning** — планирование на несколько улиц вперед

### Оценка рук

- **Preflop chart** — точный чарт для 7 карт (из evaluation)
- **Scoop-focused** — акцент на scoop-потенциал
- **High-only hands** — учет strong high-only рук

## Структура ML кода

```
ml/
├── src/
│   ├── core/
│   │   ├── trainCore.js       # Ядро обучения
│   │   ├── neuralPolicy.js    # Полиси для headless режима
│   │   ├── runner.js          # Запуск симуляций
│   │   └── headlessEngine.js  # Движок без UI
│   ├── features/
│   │   ├── variants.js        # Варианты наборов признаков
│   │   ├── mcEquity.js        # Monte Carlo equity
│   │   └── fastForward.js     # Быстрый инференс
│   ├── genDataset.js          # Генерация сырых данных
│   ├── labelDataset.js        # Разметка данных
│   ├── train.js               # Скрипт обучения
│   ├── neuralSim.js           # Симуляция с нейросетью
│   └── experiments.js         # Эксперименты
├── models*/                   # Обученные модели
└── package.json
```

## Интеграция с Vue клиентом

Модели загружаются в браузере через TensorFlow.js и используются в `<ref_file file="E:\php\Omaha-hi-lo-client\src\helpers\neuralBot.js" />` для принятия решений ботом.

## Отладка

Переменная окружения `POKER_ML_DEBUG=1` включает логирование решений:
- EV значений
- Признаков
- Выбранных действий
- Nuts spots

## Ссылки

- Документация клиента: [../README.md](../README.md)
- План оценки рук: [../.opencode/plans/evaluation](../.opencode/plans/evaluation)
- Идеи по ML: [../.opencode/plans/idea](../.opencode/plans/idea)
