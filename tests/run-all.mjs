/**
 * 运行所有测试
 */
import { spawnSync } from 'child_process';
import { readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(__dirname).filter(f => f.endsWith('.test.mjs')).sort();
const cliArgs = process.argv.slice(2);
const useLocal = cliArgs.includes('--local');
const passthroughArgs = cliArgs.filter((arg) => arg !== '--local');

console.log(`🚀 开始运行所有测试 (${files.length} 个文件)...\n`);

let failed = false;

for (const file of files) {
  console.log(`--------------------------------------------------`);
  console.log(`运行测试: ${file}`);
  console.log(`--------------------------------------------------`);
  
  const args = ['--test', resolve(__dirname, file), ...passthroughArgs];
  const env = useLocal ? { ...process.env, TEST_LOCAL: '1' } : process.env;
  const result = spawnSync('node', args, { stdio: 'inherit', env });
  
  if (result.status !== 0) {
    failed = true;
  }
}

console.log(`\n--------------------------------------------------`);
if (failed) {
  console.log('❌ 测试结束：部分测试未通过');
  process.exit(1);
} else {
  console.log('✅ 测试结束：所有测试全部通过！');
}
