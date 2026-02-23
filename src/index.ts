/**
 * @fileoverview Основной API Consilium
 * @module opencode-consilium
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import type {
  ConsiliumConfig,
  ConsiliumResult,
  AgentResult,
  RunOptions,
  ProgressCallback,
  ProgressEvent,
  ConsiliumStatus,
  ConsiliumPlugin
} from './types.js';
import { loadConfig, createMinimalConfig } from './config.js';
import { 
  callExpertsParallel, 
  callChair, 
  checkOpenCodeAvailable,
  cancel,
  resetCancel,
  isCancelled
} from './agents.js';
import { DEFAULT_CONFIG } from './defaults.js';

/**
 * Класс Consilium - основной интерфейс для работы с консилиумом
 */
export class Consilium {
  private config: ConsiliumConfig;
  private status: ConsiliumStatus = 'idle';
  private progressCallbacks: Set<ProgressCallback> = new Set();
  private startTime: number = 0;

  constructor(config?: Partial<ConsiliumConfig> | string) {
    if (typeof config === 'string') {
      // Путь к файлу конфигурации
      const result = loadConfig(config);
      this.config = result.config;
      this.logWarnings(result.warnings);
    } else if (config) {
      // Частичный конфиг
      this.config = this.mergeConfig(config);
    } else {
      // Конфиг по умолчанию
      const result = loadConfig();
      this.config = result.config;
    }
  }

  /**
   * Получить текущую конфигурацию
   */
  getConfig(): ConsiliumConfig {
    return { ...this.config };
  }

  /**
   * Получить текущий статус
   */
  getStatus(): ConsiliumStatus {
    return this.status;
  }

  /**
   * Добавить callback для отслеживания прогресса
   */
  onProgress(callback: ProgressCallback): () => void {
    this.progressCallbacks.add(callback);
    return () => this.progressCallbacks.delete(callback);
  }

  /**
   * Зарегистрировать плагин
   */
  use(plugin: ConsiliumPlugin): this {
    if (plugin.hooks) {
      this.config.hooks = {
        ...this.config.hooks,
        ...plugin.hooks
      };
    }
    return this;
  }

  /**
   * Отменить текущий запуск
   */
  cancel(): void {
    cancel();
  }

  /**
   * Запустить консилиум
   */
  async run(task: string, options: RunOptions = {}): Promise<ConsiliumResult> {
    if (this.status !== 'idle') {
      throw new Error(`Consilium уже запущен (статус: ${this.status})`);
    }

    resetCancel();
    this.startTime = Date.now();
    this.status = 'running_experts';

    const mergedOptions = this.mergeOptions(options);

    // Проверяем доступность OpenCode
    if (!(await checkOpenCodeAvailable())) {
      throw new Error('OpenCode CLI не найден. Установите opencode-cli.');
    }

    // Объединяем хуки
    const hooks = this.mergeHooks(mergedOptions.hooks);

    try {
      // Хук onStart
      if (hooks?.onStart) {
        await hooks.onStart(task, this.config);
      }

      // Определяем экспертов
      const experts = mergedOptions.experts 
        ? this.config.experts.filter(e => mergedOptions.experts!.includes(e.name))
        : this.config.experts.filter(e => e.enabled !== false);

      if (experts.length === 0) {
        throw new Error('Нет активных экспертов для консилиума');
      }

      // Эмитим прогресс
      this.emitProgress({
        type: 'expert_start',
        status: 'running_experts',
        progress: 0,
        timestamp: Date.now()
      });

      // Запускаем экспертов параллельно
      const expertResults = await callExpertsParallel(experts, task, this.config);

      if (isCancelled()) {
        this.status = 'cancelled';
        return this.createCancelledResult(expertResults);
      }

      this.status = 'running_chair';

      this.emitProgress({
        type: 'chair_start',
        status: 'running_chair',
        progress: 50,
        timestamp: Date.now()
      });

      // Определяем председателя
      const chairAgent = mergedOptions.chair || this.config.chair.agent;

      // Временно переопределяем агента председателя
      const originalChairAgent = this.config.chair.agent;
      this.config.chair.agent = chairAgent;

      // Вызываем председателя
      const chairResult = await callChair(expertResults, task, this.config);

      this.config.chair.agent = originalChairAgent;

      if (isCancelled()) {
        this.status = 'cancelled';
        return this.createCancelledResult(expertResults, chairResult);
      }

      this.status = 'completed';

      const totalTime = Date.now() - this.startTime;
      const parallelTime = expertResults.reduce(
        (max, r) => Math.max(max, r.duration || 0),
        0
      );

      const result: ConsiliumResult = {
        text: chairResult.text,
        experts: expertResults,
        chair: chairResult,
        totalTime,
        parallelTime,
        success: chairResult.success,
        metadata: mergedOptions.metadata ?? undefined
      };

      // Сохраняем результат
      const outputPath = mergedOptions.outputFile;
      if (outputPath !== undefined && this.config.output.file) {
        await this.saveResult(result, outputPath);
      }

      // Хук onEnd
      if (hooks?.onEnd) {
        await hooks.onEnd(result);
      }

      this.emitProgress({
        type: 'chair_end',
        status: 'completed',
        progress: 100,
        timestamp: Date.now()
      });

      return result;

    } catch (error) {
      this.status = 'failed';

      if (hooks?.onError) {
        await hooks.onError(error as Error, { task, options: mergedOptions });
      }

      this.emitProgress({
        type: 'error',
        status: 'failed',
        progress: 0,
        timestamp: Date.now(),
        data: error
      });

      throw error;
    }
  }

  /**
   * Запустить консилиум и вернуть только текст
   */
  async runSimple(task: string, options: RunOptions = {}): Promise<string> {
    const result = await this.run(task, { ...options, silent: true });
    return result.text;
  }

  /**
   * Dry run - возвращает сформированные промпты без вызова агентов
   */
  dryRun(task: string): {
    expertPrompts: Array<{ agent: string; prompt: string }>;
    chairPromptTemplate: string;
  } {
    const experts = this.config.experts.filter(e => e.enabled !== false);

    const expertPrompts = experts.map(expert => ({
      agent: expert.name,
      prompt: typeof expert.prompt === 'function' 
        ? expert.prompt(task) 
        : (expert.prompt?.replace(/\$\{task\}/g, task) || task)
    }));

    const chairPromptTemplate = this.config.chair.promptTemplate
      ? this.config.chair.promptTemplate(task, [])
      : '';

    return {
      expertPrompts,
      chairPromptTemplate
    };
  }

  // Private methods

  private mergeConfig(partial: Partial<ConsiliumConfig>): ConsiliumConfig {
    return {
      ...DEFAULT_CONFIG,
      ...partial,
      timeouts: { ...DEFAULT_CONFIG.timeouts, ...partial.timeouts },
      retry: { ...DEFAULT_CONFIG.retry, ...partial.retry },
      output: { ...DEFAULT_CONFIG.output, ...partial.output }
    };
  }

  private mergeOptions(options: RunOptions): RunOptions {
    return {
      ...options,
      timeout: options.timeout ?? this.config.timeouts.expert
    };
  }

  private mergeHooks(extraHooks?: Partial<ConsiliumConfig['hooks']>): Partial<ConsiliumConfig['hooks']> {
    return {
      ...this.config.hooks,
      ...extraHooks
    };
  }

  private emitProgress(event: ProgressEvent): void {
    for (const callback of this.progressCallbacks) {
      try {
        callback(event);
      } catch {
        // Игнорируем ошибки в callback
      }
    }
  }

  private async saveResult(
    result: ConsiliumResult,
    outputPath?: string | false
  ): Promise<void> {
    // Определяем путь для сохранения
    let filePath: string | false;
    if (outputPath !== undefined && outputPath !== false) {
      filePath = outputPath;
    } else if (this.config.output.file !== false) {
      filePath = this.config.output.file;
    } else {
      return; // Сохранение отключено
    }

    const fullPath = resolve(process.cwd(), filePath);
    const dir = dirname(fullPath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    let content: string;

    switch (this.config.output.format) {
      case 'json':
        content = JSON.stringify(result, null, 2);
        break;
      case 'markdown':
        content = this.formatAsMarkdown(result);
        break;
      default:
        content = result.text;
    }

    writeFileSync(fullPath, content, 'utf-8');

    if (!this.config.output.progress) {
      console.log(`💾 Результат сохранён: ${fullPath}`);
    }
  }

  private formatAsMarkdown(result: ConsiliumResult): string {
    let md = `# Результат консилиума\n\n`;
    md += `**Время выполнения:** ${(result.totalTime / 1000).toFixed(1)}с\n\n`;
    md += `---\n\n`;
    md += result.text;
    md += `\n\n---\n\n`;
    md += `## Мнения экспертов\n\n`;

    for (const expert of result.experts) {
      md += `### ${expert.agent.toUpperCase()}\n`;
      md += `${expert.success ? '' : '⚠️ '}${expert.text}\n\n`;
    }

    return md;
  }

  private createCancelledResult(
    experts: AgentResult[],
    chair?: AgentResult
  ): ConsiliumResult {
    return {
      text: '[Консилиум отменён]',
      experts,
      chair: chair || { agent: this.config.chair.agent, text: '[Отменено]', success: false },
      totalTime: Date.now() - this.startTime,
      parallelTime: 0,
      success: false,
      metadata: { cancelled: true }
    };
  }

  private logWarnings(warnings: string[]): void {
    for (const warning of warnings) {
      console.warn(`⚠️ ${warning}`);
    }
  }
}

// Convenience exports

/**
 * Создать экземпляр Consilium
 */
export function createConsilium(config?: Partial<ConsiliumConfig> | string): Consilium {
  return new Consilium(config);
}

/**
 * Быстрый запуск консилиума
 */
export async function runConsilium(
  task: string,
  config?: Partial<ConsiliumConfig>
): Promise<ConsiliumResult> {
  const instance = new Consilium(config);
  return instance.run(task);
}

/**
 * Быстрый запуск с возвратом только текста
 */
export async function askConsilium(
  task: string,
  config?: Partial<ConsiliumConfig>
): Promise<string> {
  const instance = new Consilium(config);
  return instance.runSimple(task);
}

// Re-export types and utilities
export * from './types.js';
export * from './config.js';
export * from './agents.js';
export { DEFAULT_CONFIG } from './defaults.js';
