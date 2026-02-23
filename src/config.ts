/**
 * @fileoverview Загрузчик конфигурации
 * @module opencode-consilium
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { 
  ConsiliumConfig, 
  ExpertConfig
} from './types.js';
import { 
  DEFAULT_CONFIG, 
  DEFAULT_EXPERT_PROMPTS,
  CONFIG_FILE_NAMES,
  EXCLUDED_AGENTS
} from './defaults.js';

/**
 * Результат загрузки конфигурации
 */
export interface ConfigLoadResult {
  config: ConsiliumConfig;
  configPath: string | null;
  warnings: string[];
}

/**
 * Загружает opencode.json для автоопределения агентов
 */
function loadOpenCodeConfig(configPath: string = 'opencode.json'): Record<string, unknown> | null {
  try {
    if (!existsSync(configPath)) {
      return null;
    }
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Извлекает агентов из opencode.json
 */
function extractAgentsFromOpenCode(
  openCodeConfig: Record<string, unknown> | null,
  excludedAgents: string[]
): ExpertConfig[] {
  if (!openCodeConfig || typeof openCodeConfig !== 'object') {
    return [];
  }

  const agentSection = openCodeConfig.agent;
  if (!agentSection || typeof agentSection !== 'object') {
    return [];
  }

  const agents = Object.keys(agentSection as Record<string, unknown>);
  
  return agents
    .filter(name => !excludedAgents.includes(name))
    .map((name, index) => ({
      name,
      enabled: true,
      priority: index + 1,
      prompt: DEFAULT_EXPERT_PROMPTS[name] ?? DEFAULT_EXPERT_PROMPTS.default ?? ((task: string) => task)
    }));
}

/**
 * Валидирует конфигурацию
 */
function validateConfig(config: ConsiliumConfig): string[] {
  const warnings: string[] = [];

  // Проверка экспертов
  if (config.experts && config.experts.length === 0) {
    warnings.push('Список экспертов пуст. Добавьте хотя бы одного эксперта.');
  }

  // Проверка дубликатов экспертов
  if (config.experts) {
    const names = config.experts.map(e => e.name);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    if (duplicates.length > 0) {
      warnings.push(`Обнаружены дубликаты экспертов: ${duplicates.join(', ')}`);
    }
  }

  // Проверка таймаутов
  if (config.timeouts.expert < 10000) {
    warnings.push('Таймаут эксперта слишком маленький (< 10 сек). Возможны ложные таймауты.');
  }
  if (config.timeouts.chair < 30000) {
    warnings.push('Таймаут председателя слишком маленький (< 30 сек). Возможны ложные таймауты.');
  }

  // Проверка председателя
  if (!config.chair.agent) {
    warnings.push('Не указан агент-председатель. Используется значение по умолчанию.');
  }

  return warnings;
}

/**
 * Глубокое слияние объектов
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target } as Record<string, unknown>;

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue !== undefined &&
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== undefined &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue;
      }
    }
  }

  return result as T;
}

/**
 * Находит файл конфигурации
 */
function findConfigFile(explicitPath?: string): string | null {
  if (explicitPath) {
    const resolved = resolve(process.cwd(), explicitPath);
    return existsSync(resolved) ? resolved : null;
  }

  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = resolve(process.cwd(), fileName);
    if (existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

/**
 * Парсит промпт из конфига
 */
function parsePromptConfig(
  promptConfig: unknown,
  expertName: string
): string | ((task: string) => string) {
  if (typeof promptConfig === 'string') {
    return promptConfig;
  }
  
  if (typeof promptConfig === 'function') {
    return promptConfig as (task: string) => string;
  }

  return DEFAULT_EXPERT_PROMPTS[expertName] ?? DEFAULT_EXPERT_PROMPTS.default ?? ((task: string) => task);
}

/**
 * Загружает конфигурацию из файла
 */
export function loadConfig(explicitPath?: string): ConfigLoadResult {
  const warnings: string[] = [];
  const configPath = findConfigFile(explicitPath);

  let userConfig: Partial<ConsiliumConfig> = {};

  // Загружаем пользовательский конфиг
  if (configPath) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      userConfig = JSON.parse(content) as Partial<ConsiliumConfig>;
    } catch (error) {
      warnings.push(`Ошибка при чтении ${configPath}: ${(error as Error).message}`);
    }
  }

  // Автоопределение агентов из opencode.json
  if (userConfig.autoDiscoverAgents !== false && DEFAULT_CONFIG.autoDiscoverAgents) {
    const opencodeConfig = loadOpenCodeConfig(
      userConfig.opencodeConfigPath || DEFAULT_CONFIG.opencodeConfigPath
    );
    
    if (opencodeConfig) {
      const excludedAgents = [
        ...EXCLUDED_AGENTS,
        ...(userConfig.excludedAgents || [])
      ];
      
      const discoveredAgents = extractAgentsFromOpenCode(opencodeConfig, excludedAgents);
      
      if (discoveredAgents.length > 0 && !userConfig.experts) {
        userConfig.experts = discoveredAgents;
      }
    }
  }

  // Обработка промптов экспертов
  if (userConfig.experts) {
    userConfig.experts = userConfig.experts.map(expert => ({
      ...expert,
      prompt: parsePromptConfig(expert.prompt, expert.name)
    }));
  }

  // Слияние с дефолтным конфигом
  const mergedConfig = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    userConfig as unknown as Record<string, unknown>
  ) as unknown as ConsiliumConfig;

  // Валидация
  const validationWarnings = validateConfig(mergedConfig);
  warnings.push(...validationWarnings);

  return {
    config: mergedConfig,
    configPath,
    warnings
  };
}

/**
 * Создаёт минимальный конфиг
 */
export function createMinimalConfig(experts: string[] = []): ConsiliumConfig {
  const expertConfigs: ExpertConfig[] = experts.length > 0
    ? experts.map((name, index) => ({
        name,
        enabled: true,
        priority: index + 1,
        prompt: DEFAULT_EXPERT_PROMPTS[name] ?? DEFAULT_EXPERT_PROMPTS.default ?? ((task: string) => task)
      }))
    : DEFAULT_CONFIG.experts;

  return {
    ...DEFAULT_CONFIG,
    experts: expertConfigs
  };
}

/**
 * Генерирует пример конфигурационного файла
 */
export function generateExampleConfig(): string {
  return JSON.stringify(
    {
      version: '1.0.0',
      experts: [
        {
          name: 'arch',
          enabled: true,
          priority: 1,
          timeout: 300000,
          retries: 1,
          prompt: 'Как архитектор, проанализируй: ${task}'
        },
        {
          name: 'ux',
          enabled: true,
          priority: 2
        },
        {
          name: 'ba',
          enabled: true,
          priority: 3
        },
        {
          name: 'sec',
          enabled: true,
          priority: 4
        }
      ],
      chair: {
        agent: 'consilium',
        timeout: 600000,
        maxExpertTextLength: 3000
      },
      excludedAgents: ['build', 'plan', 'consilium'],
      timeouts: {
        expert: 300000,
        chair: 600000,
        shutdown: 5000
      },
      retry: {
        expertRetries: 1,
        chairRetries: 1,
        delay: 1000,
        exponentialBackoff: true
      },
      output: {
        file: 'consilium_result.txt',
        format: 'markdown',
        progress: true,
        logLevel: 'info'
      },
      autoDiscoverAgents: true,
      opencodeConfigPath: 'opencode.json'
    } as ConsiliumConfig,
    null,
    2
  );
}
