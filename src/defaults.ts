/**
 * @fileoverview Конфигурация по умолчанию
 * @module opencode-consilium
 */

import type { ConsiliumConfig, ExpertConfig, ChairConfig } from './types.js';

/**
 * Промпты экспертов по умолчанию
 */
export const DEFAULT_EXPERT_PROMPTS: Record<string, string | ((task: string) => string)> = {
  arch: (task: string) => `Как архитектор, оцени задачу кратко (3-5 предложений): ${task}`,
  ux: (task: string) => `Как UX-специалист, оцени задачу кратко (3-5 предложений): ${task}`,
  ba: (task: string) => `Как бизнес-аналитик, оцени задачу кратко (3-5 предложений): ${task}`,
  sec: (task: string) => `Как эксперт по безопасности, оцени задачу кратко (3-5 предложений): ${task}`,
  default: (task: string) => `Проанализируй задачу как эксперт (кратко, 3-5 предложений): ${task}`
};

/**
 * Шаблон промпта для председателя по умолчанию
 */
export const DEFAULT_CHAIR_PROMPT_TEMPLATE = (
  task: string,
  experts: Array<{ agent: string; text: string }>
): string => {
  let prompt = `Синтезируй мнения экспертов и составь итоговый план.\n\n`;
  prompt += `## Задача\n${task}\n\n`;
  prompt += `## Мнения экспертов\n`;
  
  for (const { agent, text } of experts) {
    const cleanText = text.substring(0, 3000);
    prompt += `### ${agent.toUpperCase()}\n${cleanText}\n\n`;
  }
  
  prompt += `## Требования к ответу\n`;
  prompt += `1. **Резюме** (1-2 предложения)\n`;
  prompt += `2. **Топ-3 приоритетных действия** с обоснованием\n`;
  prompt += `3. **Главный риск** и митигация\n`;
  prompt += `4. **Оценка трудозатрат** (если применимо)`;
  
  return prompt;
};

/**
 * Эксперты по умолчанию
 */
export const DEFAULT_EXPERTS: ExpertConfig[] = [
  { name: 'arch', enabled: true, priority: 1 },
  { name: 'ux', enabled: true, priority: 2 },
  { name: 'ba', enabled: true, priority: 3 },
  { name: 'sec', enabled: true, priority: 4 }
];

/**
 * Председатель по умолчанию
 */
export const DEFAULT_CHAIR: ChairConfig = {
  agent: 'consilium',
  promptTemplate: DEFAULT_CHAIR_PROMPT_TEMPLATE,
  maxExpertTextLength: 3000
};

/**
 * Агенты, исключённые из списка экспертов
 */
export const EXCLUDED_AGENTS = [
  'build',
  'plan', 
  'compaction',
  'summary',
  'title',
  'explore',
  'general',
  'consilium'
];

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_CONFIG: ConsiliumConfig = {
  version: '1.0.0',
  experts: DEFAULT_EXPERTS,
  chair: DEFAULT_CHAIR,
  excludedAgents: EXCLUDED_AGENTS,
  timeouts: {
    expert: 300000,      // 5 минут
    chair: 600000,       // 10 минут
    shutdown: 5000       // 5 секунд на graceful shutdown
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
};

/**
 * Имя файла конфигурации
 */
export const CONFIG_FILE_NAMES = [
  'consilium.config.json',
  'consilium.json',
  '.consiliumrc',
  '.consiliumrc.json'
];
