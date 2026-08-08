import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

import { assertSupportedJsxPragmas, assertSupportedRequireBindings, dependencyCall } from './profile.mjs';

export const PROFILE_EXTERNAL_MODULE_SUBPATHS = Object.freeze([
  '@base-ui/react/accordion',
  '@base-ui/react/button',
  '@base-ui/react/checkbox',
  '@base-ui/react/combobox',
  '@base-ui/react/dialog',
  '@base-ui/react/input',
  '@base-ui/react/menu',
  '@base-ui/react/merge-props',
  '@base-ui/react/popover',
  '@base-ui/react/select',
  '@base-ui/react/separator',
  '@base-ui/react/spfx-id-ownership',
  '@base-ui/react/switch',
  '@base-ui/react/tabs',
  '@base-ui/react/toggle',
  '@base-ui/react/toggle-group',
  '@base-ui/react/tooltip',
  '@base-ui/react/use-render'
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSafeEmittedPath(outputPath) {
  assert(
    typeof outputPath === 'string' &&
      outputPath.startsWith('normalized/') &&
      !path.posix.isAbsolute(outputPath) &&
      !outputPath.includes('\\') &&
      path.posix.normalize(outputPath) === outputPath,
    `Unsafe generated normalized output path: ${String(outputPath)}`
  );
  return outputPath;
}

async function filesUnder(root, relativeDirectory) {
  const directoryRoot = path.join(root, relativeDirectory);
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll(path.sep, '/'));
      else throw new Error(`${relativeDirectory}: generated inventory contains a non-file entry ${path.relative(root, absolute)}`);
    }
  }
  await visit(directoryRoot);
  return files.sort();
}

function sourceDependencies(source, label) {
  const sourceFile = ts.createSourceFile(
    label,
    source,
    ts.ScriptTarget.Latest,
    true,
    label.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  assert(sourceFile.parseDiagnostics.length === 0, `${label}: generated source could not be parsed for module closure`);
  assertSupportedRequireBindings(sourceFile, label);
  assertSupportedJsxPragmas(sourceFile, label);
  const moduleSpecifiers = new Set();
  const addNode = (node) => {
    if (node && ts.isStringLiteralLike(node)) moduleSpecifiers.add(node.text);
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addNode(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression
    ) {
      addNode(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addNode(node.argument.literal);
    } else if (ts.isModuleDeclaration(node) && ts.isStringLiteralLike(node.name)) {
      addNode(node.name);
    }
    const dependency = dependencyCall(node);
    if (dependency) {
      assert(dependency.moduleName !== null, `${label}: non-literal dynamic dependency is not accepted`);
      moduleSpecifiers.add(dependency.moduleName);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const preprocessed = ts.preProcessFile(source, true, true);
  assert(!preprocessed.isLibFile, `${label}: no-default-lib directives are not accepted`);
  assert(!sourceFile.moduleName, `${label}: named AMD module directives are not accepted`);
  return {
    moduleSpecifiers: [...moduleSpecifiers].sort(),
    referencedPaths: preprocessed.referencedFiles.map((reference) => reference.fileName),
    typeDirectives: preprocessed.typeReferenceDirectives.map((reference) => reference.fileName),
    libDirectives: preprocessed.libReferenceDirectives.map((reference) => reference.fileName),
    amdDependencies: sourceFile.amdDependencies.map((dependency) => dependency.path)
  };
}

function externalPackageName(specifier) {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
}

function assertExternalModuleSpecifier(specifier, outputPath, allowedExternalPackages, allowedExternalSubpaths) {
  const segments = specifier.split('/');
  assert(
    !specifier.includes('\\') &&
      !specifier.includes('%') &&
      !segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..') &&
      /^@?[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(segments[0]) &&
      segments.slice(1).every((segment) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(segment)),
    `${outputPath}: external module specifier ${JSON.stringify(specifier)} contains an unsafe package path`
  );
  const packageName = externalPackageName(specifier);
  assert(allowedExternalPackages.has(packageName), `${outputPath}: undeclared external import ${packageName}`);
  assert(
    specifier === packageName || allowedExternalSubpaths.has(specifier),
    `${outputPath}: external module subpath ${JSON.stringify(specifier)} is not accepted by the pinned profile`
  );
}

function assertModuleSpecifierResolves(
  specifier,
  outputPath,
  emittedPaths,
  allowedExternalPackages,
  allowedExternalSubpaths
) {
  assert(
    !path.posix.isAbsolute(specifier) && !path.win32.isAbsolute(specifier),
    `${outputPath}: absolute module specifier ${JSON.stringify(specifier)} is outside the generated profile`
  );
  if (!specifier.startsWith('.')) {
    assertExternalModuleSpecifier(specifier, outputPath, allowedExternalPackages, allowedExternalSubpaths);
    return;
  }
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(outputPath), specifier));
  const withinNormalizedTree = target === 'normalized' || target.startsWith('normalized/');
  const candidates = [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`, `${target}/index.tsx`];
  assert(
    withinNormalizedTree && candidates.some((candidate) => emittedPaths.has(candidate)),
    `${outputPath}: relative import ${JSON.stringify(specifier)} does not resolve to an emitted normalized output`
  );
}

function assertDependenciesResolve(
  source,
  outputPath,
  emittedPaths,
  allowedExternalPackages,
  allowedExternalSubpaths,
  allowedTypeDirectives
) {
  const dependencies = sourceDependencies(source, outputPath);
  for (const specifier of [...dependencies.moduleSpecifiers, ...dependencies.amdDependencies]) {
    assertModuleSpecifierResolves(
      specifier,
      outputPath,
      emittedPaths,
      allowedExternalPackages,
      allowedExternalSubpaths
    );
  }
  for (const specifier of dependencies.referencedPaths) {
    assertModuleSpecifierResolves(specifier, outputPath, emittedPaths, new Set(), new Set());
  }
  for (const directive of dependencies.typeDirectives) {
    assert(
      allowedTypeDirectives.has(directive),
      `${outputPath}: type reference directive ${JSON.stringify(directive)} is not pinned by the profile`
    );
  }
  for (const directive of dependencies.libDirectives) {
    assert(
      ts.libMap.has(directive.toLowerCase()),
      `${outputPath}: lib reference directive ${JSON.stringify(directive)} is not supplied by pinned TypeScript`
    );
  }
}

export function pinnedTypeDirectiveNames(dependencies) {
  return Object.keys(dependencies ?? {})
    .filter((name) => name.startsWith('@types/'))
    .map((name) => name.slice('@types/'.length));
}

function assertNoDuplicateDependencies(values, label) {
  assert(new Set(values).size === values.length, `Generated profile ${label} contains duplicates`);
}

function normalizedDependencyPolicy({ allowedExternalPackages, allowedExternalSubpaths, allowedTypeDirectives }) {
  allowedExternalPackages = [...allowedExternalPackages];
  allowedExternalSubpaths = [...allowedExternalSubpaths];
  allowedTypeDirectives = [...allowedTypeDirectives];
  assertNoDuplicateDependencies(allowedExternalPackages, 'external package policy');
  assertNoDuplicateDependencies(allowedExternalSubpaths, 'external subpath policy');
  assertNoDuplicateDependencies(allowedTypeDirectives, 'type directive policy');
  return {
    allowedExternalPackages: new Set(allowedExternalPackages),
    allowedExternalSubpaths: new Set(allowedExternalSubpaths),
    allowedTypeDirectives: new Set(allowedTypeDirectives)
  };
}

export async function assertGeneratedTreeClosure({
  outputRoot,
  profile,
  allowedExternalPackages = [],
  allowedExternalSubpaths = PROFILE_EXTERNAL_MODULE_SUBPATHS,
  allowedTypeDirectives = []
}) {
  ({ allowedExternalPackages, allowedExternalSubpaths, allowedTypeDirectives } = normalizedDependencyPolicy({
    allowedExternalPackages,
    allowedExternalSubpaths,
    allowedTypeDirectives
  }));
  assert(typeof outputRoot === 'string' && path.isAbsolute(outputRoot), 'Generated tree root must be absolute');
  assert(profile && typeof profile === 'object' && Array.isArray(profile.items), 'Generated profile items are missing');
  const emittedPaths = new Set();
  for (const ownedSource of profile.ownedSources ?? []) {
    const outputPath = assertSafeEmittedPath(ownedSource.output?.path);
    assert(!emittedPaths.has(outputPath), `Duplicate owned normalized path ${outputPath}`);
    emittedPaths.add(outputPath);
  }
  for (const item of profile.items) {
    assert(Array.isArray(item.normalized), `${item.id}: normalized sources are missing`);
    for (const output of item.normalized) {
      const outputPath = assertSafeEmittedPath(output.path);
      assert(!emittedPaths.has(outputPath), `${item.id}: duplicate normalized path ${outputPath}`);
      emittedPaths.add(outputPath);
    }
  }

  const actualPaths = await filesUnder(outputRoot, 'normalized');
  const expectedPaths = [...emittedPaths].sort();
  assert(
    JSON.stringify(actualPaths) === JSON.stringify(expectedPaths),
    'Generated normalized source inventory differs from its manifest'
  );

  for (const outputPath of expectedPaths) {
    const source = await readFile(path.join(outputRoot, ...outputPath.split('/')), 'utf8');
    assertDependenciesResolve(
      source,
      outputPath,
      emittedPaths,
      allowedExternalPackages,
      allowedExternalSubpaths,
      allowedTypeDirectives
    );
  }
  return { emittedPaths };
}
