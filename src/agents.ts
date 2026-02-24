/**
 * @fileoverview Управление агентами OpenCode
 * @module opencode-consilium
 */

import { spawn, ChildProcess } from 'child_process';
import type { AgentResult, ConsiliumConfig, ExpertConfig } from './types.js';
import { DEFAULT_EXPERT_PROMPTS, DEFAULT_CHAIR_PROMPT_TEMPLATE } from './defaults.js';

/**
 * Активные процессы для graceful shutdown
 */
const activeProcesses: Set<ChildProcess> = new Set();

/**
 * Флаг отмены
 */
let cancelled = false;

/**
 * Устанавливает флаг отмены и убивает все активные процессы
 */
export function cancel(): void {
  cancelled = true;
  for (const proc of activeProcesses) {
    try {
      proc.kill('SIGTERM');
    } catch {
      // Игнорируем ошибки при kill
    }
  }
  activeProcesses.clear();
}

/**
 * Сбрасывает флаг отмены
 */
export function resetCancel(): void {
  cancelled = false;
}

/**
 * Проверяет, отменён ли запуск
 */
export function isCancelled(): boolean {
  return cancelled;
}

/**
 * Парсит JSON-вывод OpenCode CLI
 */
export function parseJsonOutput(output: string): string {
  const lines = output.trim().split('\n');
  const textParts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const event = JSON.parse(trimmed);
      if (event.type === 'text' && event.part?.text) {
        textParts.push(event.part.text);
      }
    } catch {
      // Игнорируем не-JSON строки
    }
  }

  return textParts.join('');
}

/**
 * Вычисляет задержку для retry
 */
function calculateRetryDelay(
  attempt: number,
  baseDelay: number,
  exponentialBackoff: boolean
): number {
  if (!exponentialBackoff) {
    return baseDelay;
  }
  return baseDelay * Math.pow(2, attempt);
}

/**
 * Формирует промпт для эксперта
 */
function buildPrompt(
  expert: ExpertConfig,
  task: string
): string {
  if (expert.prompt) {
    if (typeof expert.prompt === 'function') {
      return expert.prompt(task);
    }
    // Заменяем ${task} в строке
    return expert.prompt.replace(/\$\{task\}/g, task);
  }

  const defaultPrompt = DEFAULT_EXPERT_PROMPTS[expert.name] ?? DEFAULT_EXPERT_PROMPTS.default;
  return typeof defaultPrompt === 'function' ? defaultPrompt(task) : task;
}

/**
 * Вызывает одного агента с retry
 */
export async function callAgent(
  agentName: string,
  prompt: string,
  config: ConsiliumConfig,
  options: {
    timeout?: number;
    retries?: number;
    isChair?: boolean;
  } = {}
): Promise<AgentResult> {
  const {
    timeout = config.timeouts.expert,
    retries = config.retry.expertRetries,
    isChair = false
  } = options;

  const maxAttempts = retries + 1;
  let lastError: AgentResult | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (cancelled) {
      return {
        agent: agentName,
        text: '[Отменено]',
        success: false,
        errorCode: 'TIMEOUT',
        attempt
      };
    }

    // Задержка перед retry
    if (attempt > 0) {
      const delay = calculateRetryDelay(
        attempt - 1,
        config.retry.delay,
        config.retry.exponentialBackoff
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const startTime = Date.now();
    const result = await callAgentOnce(agentName, prompt, timeout, attempt);

    if (result.success) {
      result.duration = Date.now() - startTime;
      return result;
    }

    lastError = result;

    // Вызываем хук ошибки если есть
    if (config.hooks) {
      const errorHook = isChair ? config.hooks.onChairError : config.hooks.onExpertError;
      if (errorHook) {
        await errorHook(result);
      }
    }
  }

  return lastError || {
    agent: agentName,
    text: '[Все попытки исчерпаны]',
    success: false,
    errorCode: 'TIMEOUT'
  };
}

/**
 * Выполняет один вызов агента
 */
async function callAgentOnce(
  agentName: string,
  prompt: string,
  timeoutMs: number,
  attempt: number
): Promise<AgentResult> {
  return new Promise((resolve) => {
    const args = [
      'run',
      '--format', 'json',
      '--port', '0',
      prompt
    ];

    // Добавляем --agent только если это не subagent
    // Примечание: subagent'ы нельзя вызвать напрямую через CLI
    // const args = ['run', '--dir', '.', '--format', 'json', '--agent', agentName, prompt];

    const child = spawn('opencode', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: process.platform === 'win32'
    });

    activeProcesses.add(child);

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timeoutId = setTimeout(() => {
      if (finished) return;
      finished = true;
      activeProcesses.delete(child);

      try {
        child.kill('SIGTERM');
      } catch {
        // Игнорируем
      }

      resolve({
        agent: agentName,
        text: `[Таймаут ${agentName}]`,
        success: false,
        errorCode: 'TIMEOUT',
        attempt
      });
    }, timeoutMs);

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code: number | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      activeProcesses.delete(child);

      const text = parseJsonOutput(stdout);

      if (!text) {
        const errorDetails = stderr ? ` stderr: ${stderr.substring(0, 500)}` : '';
        resolve({
          agent: agentName,
          text: `[Агент ${agentName} не вернул текст]${errorDetails}`,
          success: false,
          errorCode: 'EMPTY_RESPONSE',
          attempt
        });
        return;
      }

      resolve({
        agent: agentName,
        text,
        success: true,
        attempt
      });
    });

    child.on('error', (err: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      activeProcesses.delete(child);

      resolve({
        agent: agentName,
        text: `[Ошибка: ${err.message}]`,
        success: false,
        errorCode: 'SPAWN_ERROR',
        attempt
      });
    });
  });
}

/**
 * Параллельно вызывает всех экспертов
 */
export async function callExpertsParallel(
  experts: ExpertConfig[],
  task: string,
  config: ConsiliumConfig
): Promise<AgentResult[]> {
  const enabledExperts = experts.filter(e => e.enabled !== false);

  const promises = enabledExperts.map(async (expert) => {
    const prompt = buildPrompt(expert, task);

    // Вызываем хук начала эксперта
    if (config.hooks?.onExpertStart) {
      await config.hooks.onExpertStart(expert.name, task);
    }

    const result = await callAgent(expert.name, prompt, config, {
      timeout: expert.timeout || config.timeouts.expert,
      retries: expert.retries ?? config.retry.expertRetries,
      isChair: false
    });

    // Вызываем хук окончания эксперта
    if (config.hooks?.onExpertEnd) {
      await config.hooks.onExpertEnd(result);
    }

    return result;
  });

  return Promise.all(promises);
}

/**
 * Вызывает председателя с результатами экспертов
 */
export async function callChair(
  expertResults: AgentResult[],
  task: string,
  config: ConsiliumConfig
): Promise<AgentResult> {
  // Формируем промпт
  let prompt: string;

  if (config.chair.promptTemplate) {
    prompt = config.chair.promptTemplate(task, expertResults);
  } else {
    prompt = DEFAULT_CHAIR_PROMPT_TEMPLATE(task, expertResults);
  }

  // Вызываем хук начала председателя
  if (config.hooks?.onChairStart) {
    await config.hooks.onChairStart(task, expertResults);
  }

  const result = await callAgent(config.chair.agent, prompt, config, {
    timeout: config.chair.timeout || config.timeouts.chair,
    retries: config.retry.chairRetries,
    isChair: true
  });

  // Вызываем хук окончания председателя
  if (config.hooks?.onChairEnd) {
    await config.hooks.onChairEnd(result);
  }

  return result;
}

/**
 * Проверяет доступность OpenCode CLI
 */
export async function checkOpenCodeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('opencode', ['--version'], {
      stdio: 'ignore',
      windowsHide: true,
      shell: process.platform === 'win32'
    });

    child.on('close', (code) => {
      resolve(code === 0);
    });

    child.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Получает список доступных агентов из opencode.json
 */
export async function getAvailableAgents(): Promise<string[]> {
  const { loadConfig } = await import('./config.js');
  const { config } = loadConfig();
  return config.experts.map(e => e.name);
}
