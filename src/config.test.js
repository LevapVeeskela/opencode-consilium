import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  loadConfig, 
  createMinimalConfig, 
  generateExampleConfig 
} from './config.js';

describe('config.ts', () => {
  describe('loadConfig', () => {
    it('должен загружать конфиг по умолчанию', () => {
      const result = loadConfig();
      
      assert.ok(result.config);
      assert.ok(result.config.experts);
      assert.ok(result.config.chair);
      assert.ok(Array.isArray(result.warnings));
    });

    it('должен возвращать массив warnings', () => {
      const result = loadConfig();
      
      assert.ok(Array.isArray(result.warnings));
    });

    it('должен содержать chair с агентом', () => {
      const result = loadConfig();
      
      assert.strictEqual(result.config.chair.agent, 'consilium');
    });
  });

  describe('createMinimalConfig', () => {
    it('должен создавать конфиг с дефолтными экспертами', () => {
      const config = createMinimalConfig();
      
      assert.ok(config.experts);
      assert.ok(config.experts.length > 0);
    });

    it('должен создавать конфиг с указанными экспертами', () => {
      const config = createMinimalConfig(['arch', 'sec']);
      
      assert.strictEqual(config.experts.length, 2);
      assert.strictEqual(config.experts[0].name, 'arch');
      assert.strictEqual(config.experts[1].name, 'sec');
    });

    it('должен создавать конфиг с дефолтными значениями', () => {
      const config = createMinimalConfig();
      
      assert.strictEqual(config.chair.agent, 'consilium');
      assert.ok(config.timeouts);
      assert.ok(config.retry);
      assert.ok(config.output);
    });
  });

  describe('generateExampleConfig', () => {
    it('должен генерировать валидный JSON', () => {
      const result = generateExampleConfig();
      
      assert.doesNotThrow(() => JSON.parse(result));
    });

    it('должен содержать ключевые поля', () => {
      const result = generateExampleConfig();
      const config = JSON.parse(result);
      
      assert.strictEqual(config.version, '1.0.0');
      assert.ok(config.experts);
      assert.ok(config.chair);
      assert.ok(config.timeouts);
      assert.ok(config.retry);
      assert.ok(config.output);
    });

    it('должен содержать четырех дефолтных экспертов', () => {
      const result = generateExampleConfig();
      const config = JSON.parse(result);
      
      assert.strictEqual(config.experts.length, 4);
    });
  });
});
