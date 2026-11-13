import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.env.TYPED_ROUTER_ROOT ?? path.join(scriptRoot, '..'));
const routesRoot = path.join(root, 'src/routes');
const output = path.join(root, 'src/routeTree.gen.ts');

const fail = (file, message) => {
  throw new Error(`[typed-router] ${path.relative(root, file)}: ${message}`);
};
const sortedEntries = dir => fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));

if (!fs.existsSync(path.join(routesRoot, '__root.tsx'))) {
  fail(routesRoot, 'missing required __root.tsx root route');
}

const records = [];
const consumedFiles = new Set();
const scanFolder = (folder, parentId, segments) => {
  for (const entry of sortedEntries(folder)) {
    if (entry.isDirectory()) {
      const routeFile = path.join(folder, entry.name, 'route.tsx');
      let parentFile = routeFile;
      if (!fs.existsSync(routeFile)) {
        // A folder named like a sibling route file (e.g. `$nestId/` next to `$nestId.tsx`)
        // nests under that file's route instead of requiring its own route.tsx.
        const sibling = path.join(folder, `${entry.name}.tsx`);
        if (fs.existsSync(sibling)) parentFile = sibling;
        else fail(routeFile, `folder "${entry.name}" has child routes but no route.tsx parent`);
      }
      const segment = entry.name;
      if (!/^(?:\$[A-Za-z][A-Za-z0-9_]*|[A-Za-z0-9._~-]+)$/.test(segment) || segment === '.' || segment === '..') {
        fail(parentFile, `invalid route folder name "${segment}"`);
      }
      const item = addRecord(parentFile, [...segments, segment], parentId, 'route');
      consumedFiles.add(parentFile);
      scanFolder(path.join(folder, entry.name), item.id, item.segments);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.tsx') || entry.name === '__root.tsx' || entry.name === 'route.tsx') continue;
    if (consumedFiles.has(path.join(folder, entry.name))) continue;
    if (entry.name === 'index.tsx') {
      addRecord(path.join(folder, entry.name), segments, parentId, 'index');
      continue;
    }
    if (!entry.name.endsWith('.tsx')) continue;
    const raw = entry.name.slice(0, -4);
    if (raw === '$') {
      addRecord(path.join(folder, entry.name), [...segments, '$'], parentId, 'wildcard');
    } else {
      if (raw.startsWith('$')) {
        if (!/^\$[A-Za-z][A-Za-z0-9_]*$/.test(raw)) fail(path.join(folder, entry.name), `invalid dynamic segment "${raw}"; use $name`);
      } else if (!/^[A-Za-z0-9._~-]+$/.test(raw) || raw === '.' || raw === '..') {
        fail(path.join(folder, entry.name), `invalid route filename "${entry.name}"`);
      }
      addRecord(path.join(folder, entry.name), [...segments, raw], parentId, 'route');
    }
  }
};

const addRecord = (file, segments, parentId, kind) => {
  const routeId = kind === 'root' ? '__root__' : kind === 'index' ? (segments.length ? `/${segments.join('/')}/` : '/') : `/${segments.join('/')}`;
  const source = fs.readFileSync(file, 'utf8');
  const escapedId = routeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declaration = new RegExp(`export\\s+const\\s+Route\\s*=\\s*createFileRoute\\(\\s*(['\"])${escapedId}\\1\\s*\\)`);
  if (!declaration.test(source)) fail(file, `expected export const Route = createFileRoute('${routeId}')({...})`);
  if (kind === 'wildcard' && segments.at(-1) !== '$') fail(file, 'wildcard must be terminal');
  if (segments.slice(0, -1).includes('$')) fail(file, 'routes cannot be nested below a wildcard');
  const record = { id: routeId, segments, parentId, kind, file };
  records.push(record);
  return record;
};

const rootRecord = addRecord(path.join(routesRoot, '__root.tsx'), [], null, 'root');
scanFolder(routesRoot, rootRecord.id, []);

const idSet = new Set();
const pathSet = new Map();
for (const route of records) {
  if (idSet.has(route.id)) fail(route.file, `duplicate route ID "${route.id}"`);
  idSet.add(route.id);
  const urlPath = route.kind === 'wildcard' ? `/${route.segments.slice(0, -1).map(s => s.startsWith('$') ? ':' + s.slice(1) : s).join('/')}${route.segments.length > 1 ? '/' : ''}*` : `/${route.segments.map(s => s.startsWith('$') ? ':' + s.slice(1) : s).join('/')}`;
  route.path = urlPath.replace(/\/+/g, '/') || '/';
  const normalized = route.path.replace(/:[^/]+/g, ':param').replace(/\/+$/, '') || '/';
  const previous = pathSet.get(normalized);
  if (previous && route.kind !== 'index' && previous.kind !== 'index') {
    fail(route.file, `route path conflicts with ${path.relative(root, previous.file)} ("${normalized}")`);
  }
  const dynamicNames = route.segments.filter(s => s.startsWith('$') && s !== '$').map(s => s.slice(1));
  if (new Set(dynamicNames).size !== dynamicNames.length) fail(route.file, 'dynamic parameter names must be unique within a route');
  if (!previous) pathSet.set(normalized, route);
}

const byId = new Map(records.map(record => [record.id, record]));
const children = new Map(records.map(record => [record.id, []]));
for (const route of records) {
  if (route.kind === 'root') continue;
  const parent = byId.get(route.parentId);
  if (!parent) fail(route.file, `missing parent route "${route.parentId}"`);
  children.get(parent.id).push(route);
}
for (const list of children.values()) list.sort((a, b) => a.id.localeCompare(b.id, 'en'));

const imports = records.map((route, index) => {
  const relative = './' + path.relative(path.dirname(output), route.file).replaceAll(path.sep, '/').replace(/\.tsx$/, '');
  return `import { Route as r${index} } from ${JSON.stringify(relative)};`;
});
const indexById = new Map(records.map((route, index) => [route.id, index]));
const emitNode = route => `{ ...r${indexById.get(route.id)}, path: ${JSON.stringify(route.path)}, children: [${children.get(route.id).map(emitNode).join(', ')}] }`;
const ids = records.map(route => JSON.stringify(route.id)).join(' | ') || 'never';
const generated = `// This file is generated by scripts/generate-routes.mjs. Do not edit.\n${imports.join('\n')}\n\nexport type RouteId = ${ids};\nexport const routeTree = ${emitNode(rootRecord)};\n`;
if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== generated) fs.writeFileSync(output, generated);
console.log(`[typed-router] generated ${records.length} routes -> ${path.relative(root, output)}`);
