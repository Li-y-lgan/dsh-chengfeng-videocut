/**
 * 可移植技能包注册实现：校验 SKILL.md frontmatter，把技能注册进 ctx.skills，
 * 并挂一个只读自检工具（不修改注册表）。注册签名对齐 DeepSeek Harness 的
 * skill-bundle 约定（ctx.skills.register / ctx.tools.register）。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import YAML from 'yaml';

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const message = (e) => (e instanceof Error ? e.message : String(e));

function analyze(text) {
  const fm = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  const parsed = { name: '', description: '', content: fm ? text.slice(fm[0].length).trimStart() : text };
  if (!fm) return { parsed, error: '缺少 YAML frontmatter（--- 分隔行）' };
  try {
    const doc = YAML.parseDocument(fm[1], { prettyErrors: false, uniqueKeys: true });
    if (doc.errors.length || doc.warnings.length)
      throw new Error([...doc.errors, ...doc.warnings].map((e) => e.message).join('; '));
    const v = doc.toJS({ maxAliasCount: 100 });
    if (v === null || typeof v !== 'object' || Array.isArray(v))
      return { parsed, error: 'frontmatter 必须是 YAML 对象' };
    if (typeof v.name === 'string') parsed.name = v.name;
    if (typeof v.description === 'string') parsed.description = v.description;
  } catch (e) {
    return { parsed, error: 'frontmatter YAML 无效：' + message(e) };
  }
  if (!SKILL_NAME.test(parsed.name)) return { parsed, error: 'name 必须是小写 kebab-case' };
  if (!parsed.description.trim()) return { parsed, error: 'description 不能为空' };
  if (!parsed.content.trim()) return { parsed, error: '技能正文不能为空' };
  return { parsed };
}

function inspect(directory, name) {
  const file = join(directory, name, 'SKILL.md');
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    return { check: { name, file, ok: false, code: 'unreadable', detail: 'SKILL.md 不可读：' + message(e) } };
  }
  const result = analyze(text);
  const error = result.error ?? (result.parsed.name === name ? undefined : 'frontmatter name 与目录名不一致：' + result.parsed.name);
  if (error) return { check: { name, file, ok: false, code: 'invalid', detail: error } };
  return {
    check: { name, file, ok: true, code: 'valid', detail: file },
    parsed: result.parsed,
    fingerprint: createHash('sha256').update(text).digest('hex'),
  };
}

function matches(actual, expected) {
  return actual !== undefined && actual.name === expected.name && actual.description === expected.description
    && actual.content === expected.content && actual.resourceBase?.kind === 'directory'
    && resolve(actual.resourceBase.path) === resolve(expected.resourceBase.path);
}

export function createSkillBundle(options) {
  const names = [...options.names];
  if (new Set(names).size !== names.length || names.some((n) => !SKILL_NAME.test(n)))
    throw new Error('技能清单必须唯一且是小写 kebab-case');
  const inspectAll = () => names.map((n) => inspect(resolve(options.directory()), n));

  return {
    checkFiles() { return inspectAll().map((r) => r.check); },
    apply(ctx) {
      const registrations = new Map();
      const disposers = [];
      let disposed = false;
      const warn = (d) => {
        const t = '[' + options.plugin + '] ' + d;
        if (ctx.logger?.warn) ctx.logger.warn(t);
        else console.warn(t);
      };
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        for (const remove of disposers.splice(0).reverse()) {
          try { remove(); } catch (e) { warn('卸载失败：' + message(e)); }
        }
      };
      ctx.on?.('dispose', dispose);

      for (const result of inspectAll()) {
        const registration = {};
        registrations.set(result.check.name, registration);
        if (!result.parsed || !result.fingerprint) { warn(result.check.name + '：' + result.check.detail); continue; }
        const definition = {
          ...result.parsed,
          resourceBase: { kind: 'directory', path: join(resolve(options.directory()), result.check.name) },
          source: 'runtime',
        };
        try {
          const remove = ctx.skills.register(definition);
          if (typeof remove !== 'function') throw new Error('skills.register 未返回卸载函数');
          disposers.push(remove);
          registration.definition = definition;
          registration.fingerprint = result.fingerprint;
        } catch (e) {
          registration.error = message(e);
          warn(result.check.name + ' 注册失败：' + registration.error);
        }
      }

      const health = async () => {
        const skills = [];
        for (const result of inspectAll()) {
          const registration = registrations.get(result.check.name);
          let registered = false;
          let registryError;
          if (!disposed && registration.definition && typeof ctx.skills.get === 'function') {
            try {
              registered = matches(await ctx.skills.get(result.check.name), registration.definition);
            } catch (e) {
              registryError = message(e);
            }
          }
          let code = 'ready';
          let detail = result.check.file;
          let reloadRequired = false;
          if (disposed) { code = 'disposed'; registered = false; detail = '插件已卸载'; reloadRequired = true; }
          else if (!result.check.ok) { code = result.check.code; detail = result.check.detail; }
          else if (registration.error) { code = 'registration_failed'; detail = '加载时注册失败：' + registration.error; reloadRequired = true; }
          else if (!registration.definition) { code = 'not_registered'; detail = '文件现有效但加载时未注册，请重载插件'; reloadRequired = true; }
          else if (result.fingerprint !== registration.fingerprint) { code = 'changed'; detail = '文件已变化，当前注册仍是加载时版本，请重载插件'; reloadRequired = true; }
          else if (registryError) { code = 'registry_unavailable'; detail = registryError; }
          else if (!registered) { code = 'inactive'; detail = '宿主注册表缺失或已被替代，请重载插件'; reloadRequired = true; }
          skills.push({ ...result.check, ok: code === 'ready', code, detail, registered, reloadRequired });
        }
        return { ok: !disposed && skills.every((s) => s.ok), plugin: options.plugin, skills };
      };

      if (typeof ctx.tools?.register === 'function') {
        try {
          const remove = ctx.tools.register({
            name: options.healthTool,
            description: options.plugin + ' 自检：重新验证 7 个剪辑/字幕/导出技能的文件与宿主注册状态，文件变化或修复后提示重载；自检不修改注册表。',
            parameters: { type: 'object', properties: {} },
            output: {
              schema: { type: 'object', additionalProperties: true },
              render(_args, value) {
                const lines = [options.plugin + ' 自检' + (value.ok ? '：技能资源完整且已注册。' : '：发现技能文件或注册状态异常。')];
                for (const s of value.skills)
                  lines.push('- ' + s.name + '：' + (s.ok ? '✅' : '❌ ' + s.detail));
                return [{ type: 'text', text: lines.join('\n') }];
              },
            },
            execute: health,
          });
          if (typeof remove !== 'function') throw new Error('tools.register 未返回卸载函数');
          disposers.push(remove);
        } catch (e) {
          dispose();
          throw e;
        }
      }
    },
  };
}