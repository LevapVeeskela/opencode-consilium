#!/usr/bin/env node

/**
 * @fileoverview CLI интерфейс для Consilium
 * @module opencode-consilium/cli
 */

import { writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CLIOptions, ConsiliumConfig, ConsiliumResult, RunOptions } from './types.js';
import { Consilium, createConsilium, loadConfig, generateExampleConfig, checkOpenCodeAvailable } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Версия пакета
const VERSION = '1.0.0';

/**
 * Парсит аргументы командной строки
 */
function parseArgs(argv: string[]): CLIOptions {
  const options: CLIOptions = {
    task: ''
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';

    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;

      case '-v':
      case '--version':
        options.version = true;
        break;

      case '-V':
      case '--verbose':
        options.verbose = true;
        break;

      case '-s':
      case '--silent':
        options.silent = true;
        break;

      case '-c':
      case '--config':
        options.config = argv[++i];
        break;

      case '-e':
      case '--experts':
        options.experts = argv[++i];
        break;

      case '--chair':
        options.chair = argv[++i];
        break;

      case '--expert-timeout':
        options.expertTimeout = parseInt(argv[++i] ?? '0', 10);
        break;

      case '--chair-timeout':
        options.chairTimeout = parseInt(argv[++i] ?? '0', 10);
        break;

      case '-o':
      case '--output':
        options.output = argv[++i];
        break;

      case '-f':
      case '--format':
        options.format = argv[++i] as 'text' | 'markdown' | 'json';
        break;

      case '-l':
      case '--log-level':
        options.logLevel = argv[++i] as 'silent' | 'error' | 'warn' | 'info' | 'debug';
        break;

      case '-r':
      case '--retries':
        options.retries = parseInt(argv[++i] ?? '0', 10);
        break;

      case '--list-agents':
        options.listAgents = true;
        break;

      case '--init':
        options.init = true;
        break;

      case '--dry-run':
        options.dryRun = true;
        break;

      default:
        if (arg && !arg.startsWith('-')) {
          options.task = options.task ? `${options.task} ${arg}` : arg;
        }
        break;
    }
  }

  return options;
}

/**
 * Выводит справку
 */
function printHelp(): void {
  console.log(`
consilium - Консилиум ИИ-экспертов через OpenCode CLI

ИСПОЛЬЗОВАНИЕ:
  consilium [опции] <задача>
  consilium --init
  consilium --list-agents

ОПЦИИ:
  -h, --help              Показать эту справку
  -v, --version           Показать версию
  -V, --verbose           Подробный вывод
  -s, --silent            Тихий режим (только результат)

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

ПРИМЕРЫ:
  consilium "Оценить архитектуру проекта"
  consilium -e arch,sec "Проверить безопасность API"
  consilium --config ./my-consilium.json "Задача"
  consilium --init

КОНФИГУРАЦИЯ:
  Создайте файл consilium.config.json для постоянных настроек:

  {
    "experts": ["arch", "ux", "ba", "sec"],
    "chair": "consilium",
    "timeouts": {
      "expert": 300000,
      "chair": 600000
    }
  }

ДОКУМЕНТАЦИЯ:
  https://github.com/LevapVeeskela/opencode-consilium
`);
}

/**
 * Выводит версию
 */
function printVersion(): void {
  console.log(`consilium v${VERSION}`);
}

/**
 * Выводит список агентов
 */
async function listAgents(config: ConsiliumConfig): Promise<void> {
  console.log('\n📋 Доступные агенты:\n');

  console.log('Эксперты:');
  for (const expert of config.experts) {
    const status = expert.enabled === false ? ' (отключен)' : '';
    console.log(`  • ${expert.name}${status}`);
  }

  console.log('\nПредседатель:');
  console.log(`  • ${config.chair.agent}`);

  console.log('\nИсключённые агенты:');
  for (const agent of config.excludedAgents || []) {
    console.log(`  • ${agent}`);
  }
}

/**
 * Создаёт пример конфигурационного файла
 */
function initConfig(): void {
  const configPath = resolve(process.cwd(), 'consilium.config.json');

  if (existsSync(configPath)) {
    console.error('❌ Файл consilium.config.json уже существует.');
    console.log('   Удалите его или используйте другой путь.');
    process.exit(1);
  }

  const example = generateExampleConfig();
  writeFileSync(configPath, example, 'utf-8');

  console.log(`✅ Создан файл ${configPath}`);
  console.log('   Отредактируйте его под свои нужды.');
}

/**
 * Выводит dry-run информацию
 */
function dryRun(task: string, config: ConsiliumConfig): void {
  const consilium = new Consilium(config);
  const info = consilium.dryRun(task);

  console.log('\n🔍 DRY RUN - Промпты без вызова агентов\n');

  console.log('Эксперты:');
  for (const { agent, prompt } of info.expertPrompts) {
    console.log(`\n[${agent.toUpperCase()}]`);
    console.log(prompt);
  }

  console.log('\n[ПРЕДСЕДАТЕЛЬ]');
  console.log('(промпт будет сформирован после ответов экспертов)');
}

/**
 * Логирует прогресс
 */
function setupProgressLogging(consilium: Consilium, verbose: boolean): void {
  consilium.onProgress((event) => {
    if (verbose) {
      console.log(`[${new Date(event.timestamp).toISOString()}] ${event.type}`, event);
    }

    switch (event.type) {
      case 'expert_start':
        console.log('\n🔍 Опрос экспертов...\n');
        break;
      case 'chair_start':
        console.log('\n🧠 Синтез председателя...\n');
        break;
      case 'error':
        console.error('❌ Ошибка:', event.data);
        break;
    }
  });
}

/**
 * Настраивает хуки для вывода в консоль
 */
function setupConsoleHooks(config: ConsiliumConfig, silent: boolean): void {
  if (silent) return;

  config.hooks = {
    ...config.hooks,
    onExpertStart: (expert: string) => {
      console.log(`⏳ [${expert}] Запуск...`);
    },
    onExpertEnd: (result) => {
      if (result.success) {
        console.log(`✅ [${result.agent}] Готово (${result.text.length} симв.)`);
      }
    },
    onChairEnd: (result) => {
      if (result.success) {
        console.log(`✅ [${result.agent}] Синтез завершён`);
      }
    }
  };
}

/**
 * Выводит финальный результат
 */
function printResult(result: ConsiliumResult, format: string, silent: boolean): void {
  if (silent) {
    console.log(result.text);
    return;
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📋 ИТОГОВЫЙ ПЛАН КОНСИЛИУМА');
  console.log('═'.repeat(50) + '\n');

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.text);
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`⏱️ Время: ${(result.totalTime / 1000).toFixed(1)}с`);
  console.log(`📊 Экспертов: ${result.experts.filter(e => e.success).length}/${result.experts.length}`);

  if (!result.success) {
    console.log(`⚠️ Председатель: неуспешно`);
  }
}

/**
 * Главная функция CLI
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);

  // Обработка служебных команд
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    printVersion();
    process.exit(0);
  }

  if (options.init) {
    initConfig();
    process.exit(0);
  }

  // Проверяем OpenCode
  if (!(await checkOpenCodeAvailable())) {
    console.error('❌ OpenCode CLI не найден.');
    console.error('   Установите: npm install -g opencode-cli');
    process.exit(1);
  }

  // Загружаем конфигурацию
  const { config, warnings } = loadConfig(options.config);

  if (warnings.length > 0 && !options.silent) {
    for (const warning of warnings) {
      console.warn(`⚠️ ${warning}`);
    }
  }

  // --list-agents
  if (options.listAgents) {
    await listAgents(config);
    process.exit(0);
  }

  // Проверяем задачу
  if (!options.task) {
    console.error('❌ Укажите задачу для консилиума.');
    console.error('   Пример: consilium "Оценить архитектуру"');
    process.exit(1);
  }

  // --dry-run
  if (options.dryRun) {
    dryRun(options.task, config);
    process.exit(0);
  }

  // Применяем CLI опции к конфигу
  if (options.experts) {
    const expertNames = options.experts.split(',').map(e => e.trim());
    config.experts = config.experts.filter(e => expertNames.includes(e.name));
  }

  if (options.expertTimeout) {
    config.timeouts.expert = options.expertTimeout;
  }

  if (options.chairTimeout) {
    config.timeouts.chair = options.chairTimeout;
  }

  if (options.retries !== undefined) {
    config.retry.expertRetries = options.retries;
    config.retry.chairRetries = options.retries;
  }

  if (options.format) {
    config.output.format = options.format;
  }

  if (options.logLevel) {
    config.output.logLevel = options.logLevel;
  }

  if (options.output !== undefined) {
    config.output.file = options.output;
  }

  // Настраиваем вывод
  setupConsoleHooks(config, options.silent || false);

  // Создаём и запускаем
  const consilium = new Consilium(config);
  setupProgressLogging(consilium, options.verbose || false);

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n⏹️ Отмена...');
    consilium.cancel();
    process.exit(130);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    const runOptions: RunOptions = {
      outputFile: options.output
    };
    if (options.chair) {
      runOptions.chair = options.chair;
    }
    
    const result = await consilium.run(options.task, runOptions);

    printResult(result, config.output.format, options.silent || false);

    if (config.output.file && !options.silent) {
      console.log(`💾 Сохранено: ${config.output.file}`);
    }

    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Ошибка:', (error as Error).message);
    process.exit(1);
  }
}

// Запуск
main().catch((error) => {
  console.error('💥 Критическая ошибка:', error);
  process.exit(1);
});
