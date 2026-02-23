#!/usr/bin/env node

/**
 * @file Точка входа CLI для consilium
 */

import('../dist/cli.js').catch((error) => {
  console.error('❌ Ошибка запуска CLI:', error.message);
  process.exit(1);
});
