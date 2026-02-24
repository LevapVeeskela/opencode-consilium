# opencode-consilium

> 通过 OpenCode CLI 实现 AI 专家协商会 — 并行代理轮询与响应合成

[![npm version](https://badge.fury.io/js/opencode-consilium.svg)](https://badge.fury.io/js/opencode-consilium)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 特性

- 🚀 **并行轮询** — 所有专家同时运行
- 🔧 **完整配置** — 配置文件、CLI 选项、程序化 API
- 🔌 **插件和钩子** — 通过生命周期钩子扩展功能
- 🔄 **重试机制** — 错误时自动重试
- 📊 **多种格式** — text、markdown、json
- 🛡️ **优雅关闭** — Ctrl+C 正确取消
- 📦 **TypeScript** — 开箱即用的完整类型定义

## 安装

```bash
# npm
npm install opencode-consilium

# yarn
yarn add opencode-consilium

# 全局安装（用于 CLI）
npm install -g opencode-consilium
```

## 快速开始

### CLI

```bash
# 基本运行
consilium "评估项目架构"

# 选择性专家
consilium -e arch,sec "检查 API 安全性"

# 超时和格式
consilium --expert-timeout 120000 -f json "任务"
```

### 程序化 API

```typescript
import { Consilium, runConsilium, askConsilium } from 'opencode-consilium';

// 快速运行
const result = await runConsilium('评估迁移到 React 19');
console.log(result.text);

// 仅文本
const answer = await askConsilium('需要 Docker 吗？');

// 完整配置
const consilium = new Consilium({
  experts: ['arch', 'sec'],
  chair: 'consilium',
  timeouts: {
    expert: 180000,
    chair: 300000
  },
  hooks: {
    onExpertEnd: (result) => console.log(`✅ ${result.agent}`),
    onEnd: (result) => console.log(`完成时间: ${result.totalTime}ms`)
  }
});

const result = await consilium.run('您的任务');
```

## CLI 选项

```
用法:
  consilium [选项] <任务>

选项:
  -h, --help              显示帮助
  -v, --version           显示版本
  -V, --verbose           详细输出
  -s, --silent            静默模式

  -c, --config <文件>     配置文件路径
  -e, --experts <列表>    专家列表逗号分隔 (arch,ux,ba,sec)
  --chair <代理>           主席代理

  --expert-timeout <毫秒>  专家超时（默认: 300000）
  --chair-timeout <毫秒>   主席超时（默认: 600000）

  -o, --output <文件>     输出文件（默认: consilium_result.txt）
  -f, --format <格式>     输出格式: text, markdown, json
  -l, --log-level <级别>   日志级别: silent, error, warn, info, debug

  -r, --retries <数字>     重试次数

命令:
  --init                  创建示例配置文件
  --list-agents           显示可用代理列表
  --dry-run               显示提示词而不调用
```

## 配置

### 配置文件

创建 `consilium.config.json`:

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
    "timeout": 600000,
    "maxExpertTextLength": 3000
  },
  "timeouts": {
    "expert": 300000,
    "chair": 600000,
    "shutdown": 5000
  },
  "retry": {
    "expertRetries": 1,
    "chairRetries": 1,
    "delay": 1000,
    "exponentialBackoff": true
  },
  "output": {
    "file": "consilium_result.md",
    "format": "markdown",
    "progress": true,
    "logLevel": "info"
  },
  "autoDiscoverAgents": true,
  "opencodeConfigPath": "opencode.json"
}
```

### 自定义提示词

```typescript
const consilium = new Consilium({
  experts: [
    {
      name: 'arch',
      prompt: (task) => `作为架构师分析: ${task}。
        包含: 1) 优点 2) 缺点 3) 建议。`
    },
    {
      name: 'custom_expert',
      prompt: '你是 ${task} 方面的专家。给出简短回答。'
    }
  ]
});
```

### 自定义主席

```typescript
const consilium = new Consilium({
  chair: {
    agent: 'consilium',
    promptTemplate: (task, experts) => {
      let prompt = `任务: ${task}\n\n意见:\n`;
      for (const e of experts) {
        prompt += `${e.agent}: ${e.text}\n\n`;
      }
      prompt += `制定最终优先计划。`;
      return prompt;
    },
    maxExpertTextLength: 2000
  }
});
```

## 生命周期钩子

```typescript
const consilium = new Consilium({
  hooks: {
    // 启动前
    onStart: (task, config) => {
      console.log(`启动协商会: ${task}`);
    },

    // 专家
    onExpertStart: (expert, task) => {
      console.log(`⏳ ${expert} 分析中...`);
    },
    onExpertEnd: (result) => {
      console.log(`✅ ${result.agent}: ${result.text.length} 字符`);
    },
    onExpertError: (result) => {
      console.error(`❌ ${result.agent}: ${result.errorCode}`);
    },

    // 主席
    onChairStart: (task, experts) => {
      console.log(`🧠 合成 ${experts.length} 条意见...`);
    },
    onChairEnd: (result) => {
      console.log(`📋 完成`);
    },

    // 完成
    onEnd: (result) => {
      console.log(`时间: ${result.totalTime}ms`);
      // 发送到 Slack、保存到数据库等
    },

    // 错误
    onError: (error, context) => {
      console.error('错误:', error, context);
    }
  }
});
```

## 插件

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

## API 参考

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

### 函数

```typescript
// 创建实例
function createConsilium(config?: Partial<ConsiliumConfig> | string): Consilium;

// 快速运行
function runConsilium(task: string, config?: Partial<ConsiliumConfig>): Promise<ConsiliumResult>;

// 仅文本
function askConsilium(task: string, config?: Partial<ConsiliumConfig>): Promise<string>;

// 加载配置
function loadConfig(path?: string): ConfigLoadResult;

// 创建最小配置
function createMinimalConfig(experts?: string[]): ConsiliumConfig;

// 生成示例配置
function generateExampleConfig(): string;
```

### 类型

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
  // ... 见 types.ts
}
```

## 要求

- Node.js >= 18.0.0
- OpenCode CLI >= 1.0.0

## 开发

```bash
# 克隆
git clone https://github.com/LevapVeeskela/opencode-consilium.git

# 安装依赖
npm install

# 构建
npm run build

# 测试
npm test
```

## 许可证

MIT © LevapVeeskela
