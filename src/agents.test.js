import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { 
  parseJsonOutput, 
  cancel,
  resetCancel,
  isCancelled,
  checkOpenCodeAvailable
} from './agents.js';

describe('agents.ts', () => {
  describe('parseJsonOutput', () => {
    it('должен парсить JSON строки с типом text', () => {
      const output = `{"type":"text","part":{"text":"Hello world"}}
{"type":"text","part":{"text":" Second part"}}`;
      
      const result = parseJsonOutput(output);
      assert.strictEqual(result, 'Hello world Second part');
    });

    it('должен игнорировать не-JSON строки', () => {
      const output = `Some plain text
{"type":"text","part":{"text":"JSON text"}}
More plain text`;
      
      const result = parseJsonOutput(output);
      assert.strictEqual(result, 'JSON text');
    });

    it('должен возвращать пустую строку для пустого вывода', () => {
      assert.strictEqual(parseJsonOutput(''), '');
      assert.strictEqual(parseJsonOutput('   '), '');
    });

    it('должен обрабатывать вывод без type text', () => {
      const output = `{"type":"other","data":"test"}
{"type":"text","part":{"text":"Valid"}}`;
      
      const result = parseJsonOutput(output);
      assert.strictEqual(result, 'Valid');
    });
  });

  describe('cancel/resetCancel/isCancelled', () => {
    beforeEach(() => {
      resetCancel();
    });

    it('должен сбрасывать флаг отмены', () => {
      cancel();
      assert.strictEqual(isCancelled(), true);
      
      resetCancel();
      assert.strictEqual(isCancelled(), false);
    });

    it('isCancelled должен возвращать false по умолчанию', () => {
      assert.strictEqual(isCancelled(), false);
    });
  });

  describe('checkOpenCodeAvailable', () => {
    it('должен проверять доступность opencode', async () => {
      const available = await checkOpenCodeAvailable();
      assert.strictEqual(typeof available, 'boolean');
    });
  });
});
