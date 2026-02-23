# opencode-consilium

> Консилиум ИИ-экспертов через OpenCode CLI — параллельный опрос агентов и синтез ответов

[![npm version](https://badge.fury.io/js/opencode-consilium.svg)](https://badge.fury.io/js/opencode-consilium)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Особенности

- 🚀 **Параллельный опрос** — все эксперты запускаются одновременно
- 🔧 **Полная настройка** — конфигурационные файлы, CLI опции, программный API
- 🔌 **Плагины и хуки** — расширяйте функциональность через lifecycle hooks
- 🔄 **Retry механизм** — автоматические повторные попытки при ошибках
- 📊 **Несколько форматов** — text, markdown, json
- 🛡️ **Graceful shutdown** — корректная отмена по Ctrl+C
- 📦 **TypeScript** — полная типизация из коробки

## Установка

```bash
# npm
npm install opencode-consilium

# yarn
yarn add opencode-consilium

# глобально (для CLI)
npm install -g opencode-consilium
```

## Быстрый старт

### CLI

```bash
# Базовый запуск
consilium "Оценить архитектуру проекта"

# С выборочными экспертами
consilium -e arch,sec "Проверить безопасность API"

# С таймаутом и форматом
consilium --expert-timeout 120000 -f json "Задача"
```

### Программный API

```typescript
import { Consilium, runConsilium, askConsilium } from 'opencode-consilium';

// Быстрый запуск
const result = await runConsilium('Оценить миграцию на React 19');
console.log(result.text);

// Только текст
const answer = await askConsilium('Нужен ли Docker?');

// С полной конфигурацией
const consilium = new Consilium({
  experts: ['arch', 'sec'],
  chair: 'consilium',
  timeouts: {
    expert: 180000,
    chair: 300000
  },
  hooks: {
    onExpertEnd: (result) => console.log(`✅ ${result.agent}`),
    onEnd: (result) => console.log(`Готово за ${result.totalTime}мс`)
  }
});

const result = await consilium.run('Ваша задача');
```

## CLI Опции

```
ИСПОЛЬЗОВАНИЕ:
  consilium [опции] <задача>

ОПЦИИ:
  -h, --help              Показать справку
  -v, --version           Показать версию
  -V, --verbose           Подробный вывод
  -s, --silent            Тихий режим

  -c, --config <файл>     Путь к файлу конфигурации
  -e, --experts <список>  Эксперты через запятую (arch,ux,ba,sec)
  --chair <агент>         Агент-председатель

  --expert-timeout <мс>   Таймаут для экспертов (по умолчанию: 300000)
  --chair-timeout <мс>    Таймаут для председателя (по умолчанию: 600000)

  -o, --output <файл>     Выходной файл (по умолчанию: consilium_result.txt)
  -f, --format <формат>   Формат вывода: text, markdown, json
  -l, --log-level <уровень> Уровень логирования: silent, error, warn, info, debug

  -r, --retries <число>   Количество повторных попыток

КОМАНДЫ:
  --init                  Создать пример конфигурационного файла
  --list-agents           Показать список доступных агентов
  --dry-run               Показать сформированные промпты без вызова
```

## Конфигурация

### Файл конфигурации

Создайте `consilium.config.json`:

```json
{
  "experts": [
    { "name": "arch", "enabled": true, "priority": 1 },
    { "name": "ux", "enabled": true, "priority": 2 },
    { "name": "ba", "enabled": true, "priority": 3 },
    { "name": "sec", "enabled": true, "priority": 4 }
  ],
  "chair": {
    "agent": "consilium",
    "timeout": 600000
  },
  "timeouts": {
    "expert": 300000,
    "chair": 600000
  },
  "retry": {
    "expertRetries": 1,
    "delay": 1000,
    "exponentialBackoff": true
  },
  "output": {
    "file": "consilium_result.md",
    "format": "markdown"
  }
}
```

### Кастомные промпты

```typescript
const consilium = new Consilium({
  experts: [
    {
      name: 'arch',
      prompt: (task) => `Проанализируй как архитектор: ${task}. \n        Укажи: 1) Плюсы 2) Минусы 3) Рекомендации.`
    },
    {
      name: 'custom_expert',
      prompt: 'Ты эксперт по ${task}. Дай краткий ответ.'
    }
  ]
});
```

### Кастомный председатель

```typescript
const consilium = new Consilium({
  chair: {
    agent: 'consilium',
    promptTemplate: (task, experts) => {
      let prompt = `Задача: ${task}\n\nМнения:\n`;
      for (const e of experts) {
        prompt += `${e.agent}: ${e.text}\n\n`;
      }
      prompt += `Сделай итоговый план с приоритетами.`;
      return prompt;
    },
    maxExpertTextLength: 2000
  }
});
```

## Хуки (Lifecycle Hooks)

```typescript
const consilium = new Consilium({
  hooks: {
    // Перед стартом
    onStart: (task, config) => {
      console.log(`Запуск консилиума: ${task}`);
    },

    // Эксперты
    onExpertStart: (expert, task) => {
      console.log(`⏳ ${expert} анализирует...`);
    },
    onExpertEnd: (result) => {
      console.log(`✅ ${result.agent}: ${result.text.length} символов`);
    },
    onExpertError: (result) => {
      console.error(`❌ ${result.agent}: ${result.errorCode}`);
    },

    // Председатель
    onChairStart: (task, experts) => {
      console.log(`🧠 Синтез ${experts.length} мнений...`);
    },
    onChairEnd: (result) => {
      console.log(`📋 Готово`);
    },

    // Завершение
    onEnd: (result) => {
      console.log(`Время: ${result.totalTime}мс`);
      // Отправить в Slack, сохранить в БД и т.д.
    },

    // Ошибки
    onError: (error, context) => {
      console.error('Ошибка:', error, context);
    }
  }
});
```

## Плагины

```typescript
import type { ConsiliumPlugin } from 'opencode-consilium';

const slackPlugin: ConsiliumPlugin = {
  name: 'slack-notifier',
  version: '1.0.0',
  hooks: {
    onEnd: async (result) => {
      await fetch('https://hooks.slack.com/...', {
        method: 'POST',
        body: JSON.stringify({ text: result.text })
      });
    }
  }
};

const consilium = new Consilium(config);
consilium.use(slackPlugin);
```

## API Reference

### Consilium

```typescript
class Consilium {
  constructor(config?: Partial<ConsiliumConfig> | string);
  
  getConfig(): ConsiliumConfig;
  getStatus(): ConsiliumStatus;
  
  onProgress(callback: ProgressCallback): () => void;
  use(plugin: ConsiliumPlugin): this;
  cancel(): void;
  
  run(task: string, options?: RunOptions): Promise<ConsiliumResult>;
  runSimple(task: string, options?: RunOptions): Promise<string>;
  dryRun(task: string): DryRunResult;
}
```

### Функции

```typescript
// Создать экземпляр
function createConsilium(config?: Partial<ConsiliumConfig> | string): Consilium;

// Быстрый запуск
function runConsilium(task: string, config?: Partial<ConsiliumConfig>): Promise<ConsiliumResult>;

// Только текст
function askConsilium(task: string, config?: Partial<ConsiliumConfig>): Promise<string>;

// Загрузить конфиг
function loadConfig(path?: string): ConfigLoadResult;

// Создать минимальный конфиг
function createMinimalConfig(experts?: string[]): ConsiliumConfig;

// Сгенерировать пример конфига
function generateExampleConfig(): string;
```

### Типы

```typescript
interface ConsiliumResult {
  text: string;
  experts: AgentResult[];
  chair: AgentResult;
  totalTime: number;
  parallelTime: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

interface AgentResult {
  agent: string;
  text: string;
  success: boolean;
  duration?: number;
  errorCode?: 'TIMEOUT' | 'EMPTY_RESPONSE' | 'SPAWN_ERROR' | 'PARSE_ERROR';
  attempt?: number;
}

interface ConsiliumConfig {
  experts: ExpertConfig[];
  chair: ChairConfig;
  timeouts: TimeoutConfig;
  retry: RetryConfig;
  output: OutputConfig;
  hooks?: ConsiliumHooks;
  // ... см. types.ts
}
```

## Требования

- Node.js >= 18.0.0
- OpenCode CLI >= 1.0.0

## Разработка

```bash
# Клонировать
git clone https://github.com/LevapVeeskela/opencode-consilium.git

# Установить зависимости
npm install

# Сборка
npm run build

# Тесты
npm test
```

## Лицензия

MIT © LevapVeeskela
