/**
 * 测试配置
 * 从 .dev.vars 文件读取配置，也支持环境变量覆盖
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDevVars() {
  try {
    const content = readFileSync(resolve(__dirname, '..', '.dev.vars'), 'utf-8');
    const vars = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      let value = trimmed.substring(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
      }
      vars[key] = value;
    }
    return vars;
  } catch {
    return {};
  }
}

const devVars = loadDevVars();

function readBoolEnv(value) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

// 注意：
// 1) 直接运行 `node tests/*.test.mjs --local` 时，argv 可见。
// 2) 使用 `node --test` 时，额外参数不会透传到测试文件；需配合 TEST_LOCAL=1。
const isLocal = process.argv.includes('--local') || readBoolEnv(process.env.TEST_LOCAL);

export const config = {
  /** 网关 Host 地址 */
  HOST: isLocal ? 'http://localhost:3000' : (process.env.HOST || devVars.HOST || 'http://localhost:3000'),
  /** 有效的网关 API Key */
  API_KEY: process.env.API_KEY || devVars.API_KEY || '',
  /** 下载 Providers 使用的订阅链接 */
  PROVIDERS_LINK: process.env.PROVIDERS_LINK || devVars.PROVIDERS_LINK || '',
  /** 管理后台密码 */
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || devVars.ADMIN_PASSWORD || '',
  /** 无效的 API Key，用于测试拒绝场景 */
  INVALID_API_KEY: 'sk-invalid-key-000000000000000000000000',
  
  // 新增：供应商与模型配置 (去除可能存在的引号)
  GOOGLE_OPENAI_COMPATIBLE_PROVIDER_NAME: (process.env.GOOGLE_OPENAI_COMPATIBLE_PROVIDER_NAME || devVars.GOOGLE_OPENAI_COMPATIBLE_PROVIDER_NAME || '').replace(/"/g, ''),
  GOOGLE_MODEL_ID: (process.env.GOOGLE_MODEL_ID || devVars.GOOGLE_MODEL_ID || '').replace(/"/g, ''),
  GOOGLE_OPENAI_COMPATIBLE_MODEL_ID: (process.env.GOOGLE_OPENAI_COMPATIBLE_MODEL_ID || devVars.GOOGLE_OPENAI_COMPATIBLE_MODEL_ID || '').replace(/"/g, ''),
  OPENAI_MODEL_ID: (process.env.OPENAI_MODEL_ID || devVars.OPENAI_MODEL_ID || '').replace(/"/g, ''),
  ANTHROPIC_MODEL_ID: (process.env.ANTHROPIC_MODEL_ID || devVars.ANTHROPIC_MODEL_ID || '').replace(/"/g, ''),
  /** 测试 key 层负载均衡的 model id */
  KEY_WEIGHTS_MODEL_ID: (process.env.KEY_WEIGHTS_MODEL_ID || devVars.KEY_WEIGHTS_MODEL_ID || '').replace(/"/g, ''),
  /** 测试 model 别名层的负载均衡的 model id */
  MODEL_ALIAS_MODEL_ID: (process.env.MODEL_ALIAS_MODEL_ID || devVars.MODEL_ALIAS_MODEL_ID || '').replace(/"/g, ''),
  /** 测试同 model id 多 type provider 的路由分流 */
  MULTI_TYPES_MODEL_ID: (process.env.MULTI_TYPES_MODEL_ID || devVars.MULTI_TYPES_MODEL_ID || '').replace(/"/g, ''),

  /** 测试 disabled entities */
  DISABLED_MODEL_ID: (process.env.DISABLED_MODEL_ID || devVars.DISABLED_MODEL_ID || '').replace(/"/g, ''),
  DISABLED_MODEL_ALIAS: (process.env.DISABLED_MODEL_ALIAS || devVars.DISABLED_MODEL_ALIAS || '').replace(/"/g, ''),
  DISABLED_GATEWAY_KEY: (process.env.DISABLED_GATEWAY_KEY || devVars.DISABLED_GATEWAY_KEY || '').replace(/"/g, ''),
  DISABLED_ALIAS_TARGET_MODEL_ID: (process.env.DISABLED_ALIAS_TARGET_MODEL_ID || devVars.DISABLED_ALIAS_TARGET_MODEL_ID || '').replace(/"/g, ''),

  /** 请求超时时间 (ms) */
  TIMEOUT: 30000,
};

/**
 * 打印当前测试配置（隐藏敏感信息）
 */
export function printConfig() {
  console.log('\n📋 测试配置:');
  console.log(`  HOST:           ${config.HOST}`);
  console.log(`  API_KEY:        ${config.API_KEY ? config.API_KEY.substring(0, 12) + '...' : '❌ 未配置'}`);
  console.log(`  PROVIDERS_LINK: ${config.PROVIDERS_LINK ? config.PROVIDERS_LINK.substring(0, 30) + '...' : '❌ 未配置'}`);
  console.log(`  ADMIN_PASSWORD: ${config.ADMIN_PASSWORD ? '✅ 已配置' : '❌ 未配置'}`);
  console.log('');
}
