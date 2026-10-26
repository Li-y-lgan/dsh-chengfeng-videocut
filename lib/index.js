/**
 * dsh-chengfeng-videocut：把 chengfeng-videocut 的 7 个剪辑技能装进 DeepSeek Harness。
 * 技能内容 vendored 自 Agentchengfeng/chengfeng-videocut-skills（Apache-2.0），
 * 本入口只提供包身份、技能名单、资源目录与自检工具，注册逻辑在 skill-bundle.js。
 */
import { fileURLToPath } from 'node:url';
import { createSkillBundle } from './skill-bundle.js';

export const name = 'chengfeng-videocut-skills';
export const inject = ['skills', 'tools'];

export const SKILL_NAMES = [
  'chengfeng-cut',
  'chengfeng-subtitle',
  'chengfeng-export',
  'chengfeng-visual',
  'chengfeng-report-bug',
  'chengfeng-check-updates',
  'chengfeng-videocut-workbench',
];

/** 本包内技能资源根目录的绝对路径。 */
export function bundledSkillsDir() {
  return fileURLToPath(new URL('../skills/', import.meta.url));
}

const bundle = createSkillBundle({
  plugin: 'dsh-chengfeng-videocut',
  healthTool: 'chengfeng_videocut_health',
  names: SKILL_NAMES,
  directory: bundledSkillsDir,
});

export function apply(ctx) {
  bundle.apply(ctx);
}