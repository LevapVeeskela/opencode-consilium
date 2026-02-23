/**
 * @fileoverview TypeScript типы для Consilium API
 * @module opencode-consilium
 */

/**
 * Результат выполнения агента
 */
export interface AgentResult {
  /** Имя агента */
  agent: string;
  /** Текстовый ответ */
  text: string;
  /** Успешность выполнения */
  success: boolean;
  /** Время выполнения в мс */
  duration?: number;
  /** Код ошибки (если есть) */
  errorCode?: 'TIMEOUT' | 'EMPTY_RESPONSE' | 'SPAWN_ERROR' | 'PARSE_ERROR';
  /** Попытка выполнения */
  attempt?: number;
}

/**
 * Результат консилиума
 */
export interface ConsiliumResult {
  /** Итоговый текст председателя */
  text: string;
  /** Результаты всех экспертов */
  experts: AgentResult[];
  /** Результат председателя */
  chair: AgentResult;
  /** Общее время выполнения в мс */
  totalTime: number;
  /** Время параллельного опроса экспертов в мс */
  parallelTime: number;
  /** Успешность всего консилиума */
  success: boolean;
  /** Метаданные */
  metadata?: Record<string, unknown>;
}

/**
 * Конфигурация эксперта
 */
export interface ExpertConfig {
  /** Имя эксперта */
  name: string;
  /** Промпт для эксперта (может быть строкой или функцией) */
  prompt?: string | ((task: string) => string);
  /** Таймаут для эксперта (переопределяет глобальный) */
  timeout?: number;
  /** Количество повторных попыток */
  retries?: number;
  /** Приоритет (для будущей сортировки) */
  priority?: number;
  /** Включён/выключен */
  enabled?: boolean;
}

/**
 * Конфигурация председателя
 */
export interface ChairConfig {
  /** Имя агента-председателя */
  agent: string;
  /** Таймаут для председателя */
  timeout?: number;
  /** Кастомный промпт (функция принимает мнения экспертов) */
  promptTemplate?: (task: string, experts: AgentResult[]) => string;
  /** Максимальная длина ответа эксперта для включения в промпт */
  maxExpertTextLength?: number;
}

/**
 * Хуки жизненного цикла
 */
export interface ConsiliumHooks {
  /** Вызывается перед стартом консилиума */
  onStart?: (task: string, config: ConsiliumConfig) => void | Promise<void>;
  /** Вызывается перед опросом каждого эксперта */
  onExpertStart?: (expert: string, task: string) => void | Promise<void>;
  /** Вызывается после ответа эксперта */
  onExpertEnd?: (result: AgentResult) => void | Promise<void>;
  /** Вызывается при ошибке эксперта */
  onExpertError?: (result: AgentResult) => void | Promise<void>;
  /** Вызывается перед синтезом председателя */
  onChairStart?: (task: string, experts: AgentResult[]) => void | Promise<void>;
  /** Вызывается после ответа председателя */
  onChairEnd?: (result: AgentResult) => void | Promise<void>;
  /** Вызывается при ошибке председателя */
  onChairError?: (result: AgentResult) => void | Promise<void>;
  /** Вызывается по завершении консилиума */
  onEnd?: (result: ConsiliumResult) => void | Promise<void>;
  /** Вызывается при критической ошибке */
  onError?: (error: Error, context?: unknown) => void | Promise<void>;
  /** Вызывается при логировании */
  onLog?: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => void;
}

/**
 * Настройки таймаутов
 */
export interface TimeoutConfig {
  /** Таймаут для экспертов по умолчанию (мс) */
  expert: number;
  /** Таймаут для председателя (мс) */
  chair: number;
  /** Буфер для graceful shutdown (мс) */
  shutdown: number;
}

/**
 * Настройки повторных попыток
 */
export interface RetryConfig {
  /** Количество попыток для экспертов */
  expertRetries: number;
  /** Количество попыток для председателя */
  chairRetries: number;
  /** Задержка между попытками (мс) */
  delay: number;
  /** Экспоненциальная задержка */
  exponentialBackoff: boolean;
}

/**
 * Настройки вывода
 */
export interface OutputConfig {
  /** Файл для сохранения результата */
  file: string | false;
  /** Формат вывода: text, markdown, json */
  format: 'text' | 'markdown' | 'json';
  /** Выводить прогресс в консоль */
  progress: boolean;
  /** Уровень логирования */
  logLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug';
}

/**
 * Полная конфигурация консилиума
 */
export interface ConsiliumConfig {
  /** Версия конфигурации */
  version?: string;
  /** Список экспертов */
  experts: ExpertConfig[];
  /** Конфигурация председателя */
  chair: ChairConfig;
  /** Агенты, исключённые из списка экспертов */
  excludedAgents?: string[];
  /** Настройки таймаутов */
  timeouts: TimeoutConfig;
  /** Настройки повторных попыток */
  retry: RetryConfig;
  /** Настройки вывода */
  output: OutputConfig;
  /** Хуки жизненного цикла */
  hooks?: ConsiliumHooks;
  /** Рабочая директория */
  cwd?: string;
  /** Путь к opencode CLI */
  opencodePath?: string;
  /** Дополнительные аргументы для opencode CLI */
  opencodeArgs?: string[];
  /** Автоопределение экспертов из opencode.json */
  autoDiscoverAgents?: boolean;
  /** Путь к opencode.json */
  opencodeConfigPath?: string;
  /** Плагины (функции-расширения) */
  plugins?: ConsiliumPlugin[];
}

/**
 * Плагин консилиума
 */
export interface ConsiliumPlugin {
  /** Имя плагина */
  name: string;
  /** Версия плагина */
  version?: string;
  /** Функция инициализации */
  init?: (config: ConsiliumConfig) => ConsiliumConfig | Promise<ConsiliumConfig>;
  /** Расширение хуков */
  hooks?: Partial<ConsiliumHooks>;
}

/**
 * Опции запуска консилиума (для API)
 */
export interface RunOptions {
  /** Переопределение экспертов */
  experts?: string[];
  /** Переопределение председателя */
  chair?: string;
  /** Переопределение таймаута */
  timeout?: number;
  /** Переопределение выходного файла */
  outputFile?: string;
  /** Silent режим (без вывода в консоль) */
  silent?: boolean;
  /** Дополнительные хуки для этого запуска */
  hooks?: Partial<ConsiliumHooks>;
  /** Метаданные (передаются в результат) */
  metadata?: Record<string, unknown>;
}

/**
 * Статус консилиума
 */
export type ConsiliumStatus = 
  | 'idle'
  | 'running_experts'
  | 'running_chair'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Событие прогресса
 */
export interface ProgressEvent {
  type: 'expert_start' | 'expert_end' | 'chair_start' | 'chair_end' | 'error';
  agent?: string;
  status: ConsiliumStatus;
  progress: number; // 0-100
  timestamp: number;
  data?: unknown;
}

/**
 * Callback для отслеживания прогресса
 */
export type ProgressCallback = (event: ProgressEvent) => void;

/**
 * Опции CLI
 */
export interface CLIOptions {
  /** Задача */
  task: string;
  /** Файл конфигурации */
  config?: string;
  /** Эксперты через запятую */
  experts?: string;
  /** Председатель */
  chair?: string;
  /** Таймаут экспертов */
  expertTimeout?: number;
  /** Таймаут председателя */
  chairTimeout?: number;
  /** Выходной файл */
  output?: string;
  /** Формат вывода */
  format?: 'text' | 'markdown' | 'json';
  /** Уровень логирования */
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug';
  /** Количество повторных попыток */
  retries?: number;
  /** Silent режим */
  silent?: boolean;
  /** Показать помощь */
  help?: boolean;
  /** Показать версию */
  version?: boolean;
  /** Верbose режим */
  verbose?: boolean;
  /** Список доступных агентов */
  listAgents?: boolean;
  /** Инициализация конфига */
  init?: boolean;
  /** Dry run (без реального вызова) */
  dryRun?: boolean;
}
