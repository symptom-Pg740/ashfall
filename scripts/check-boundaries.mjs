import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src');
const errors = [];
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
}
walk(root);

const importsOf = (file) => {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
};

const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const resolveLocal = (fromFile, spec) => {
  if (!spec.startsWith('.')) return null;
  const clean = spec.split('?')[0];
  let full = path.resolve(path.dirname(fromFile), clean);
  if (!full.endsWith('.js')) full += '.js';
  return fs.existsSync(full) ? full : null;
};

// 1. Core purity.
for (const file of files.filter((f) => f.startsWith(path.join(root, 'core')))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const spec of importsOf(file)) {
    if (!spec.startsWith('.')) {
      errors.push(`${path.relative(root, file)}: core may not import package "${spec}"`);
      continue;
    }
    const resolved = resolveLocal(file, spec);
    if (!resolved) {
      errors.push(`${path.relative(root, file)}: unresolved import "${spec}"`);
      continue;
    }
    if (!resolved.startsWith(path.join(root, 'core')) && !resolved.startsWith(path.join(root, 'shared'))) {
      errors.push(`${path.relative(root, file)}: core may only import core/shared (got ${spec})`);
    }
  }
  const code = stripComments(source);
  for (const token of ['window', 'document', 'localStorage', 'navigator', 'requestAnimationFrame']) {
    if (new RegExp(`\\b${token}\\b`).test(code)) {
      errors.push(`${path.relative(root, file)}: core may not reference ${token}`);
    }
  }
}

// 2. Cycles across src.
const graph = new Map();
for (const file of files) {
  const deps = [];
  for (const spec of importsOf(file)) {
    const resolved = resolveLocal(file, spec);
    if (resolved && resolved.startsWith(root)) deps.push(resolved);
  }
  graph.set(file, deps);
}
const state = new Map();
const stack = [];
const cycles = new Set();
function visit(file) {
  if (state.get(file) === 2) return;
  if (state.get(file) === 1) {
    const at = stack.indexOf(file);
    const cycle = stack.slice(at).concat(file).map((f) => path.relative(root, f));
    cycles.add(cycle.join(' -> '));
    return;
  }
  state.set(file, 1);
  stack.push(file);
  for (const dep of graph.get(file) || []) visit(dep);
  stack.pop();
  state.set(file, 2);
}
for (const file of files) visit(file);
for (const cycle of cycles) errors.push(`import cycle: ${cycle}`);

// 3. Feature internals (future-proofing).
for (const file of files) {
  const rel = path.relative(root, file);
  const m = rel.match(/^features\/([^/]+)\//);
  if (!m) continue;
  for (const spec of importsOf(file)) {
    const resolved = resolveLocal(file, spec);
    if (!resolved) continue;
    const target = path.relative(root, resolved);
    const other = target.match(/^features\/([^/]+)\//);
    if (other && other[1] !== m[1] && !target.endsWith('/index.js')) {
      errors.push(`${rel}: imports another feature's internals (${target})`);
    }
  }
}

if (errors.length) {
  console.error(`Boundary check failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`Boundary check OK: ${files.length} modules, core is pure, no import cycles.`);
