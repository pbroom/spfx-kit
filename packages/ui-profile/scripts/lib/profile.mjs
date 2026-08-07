import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const profileManifest = require('../../package.json');

export const PROFILE_ID = 'spfx-react17-base-nova-v1';
export const PROFILE_SCHEMA_VERSION = 1;
export const GENERATOR_VERSION = '1.0.0';
export const NORMALIZATION_CONTRACT_VERSION = 'react17-classic-jsx-v1';
export const REGISTRY_IDS = Object.freeze([
  'button',
  'input',
  'field',
  'textarea',
  'checkbox',
  'switch',
  'select',
  'combobox',
  'toggle-group',
  'tabs',
  'accordion',
  'dropdown-menu',
  'dialog',
  'sheet',
  'popover',
  'tooltip',
  'alert',
  'badge',
  'spinner',
  'label',
  'separator',
  'input-group',
  'toggle',
  'utils'
]);

// These wrappers are intentionally not exported by their registry modules, but they
// are still passed through as React components. React 17 therefore needs the same
// ref normalization as the exported primitive wrappers when their props are
// forwarded to Base UI.
const INTERNAL_REF_WRAPPER_NAMES = new Set(['ComboboxClear', 'SheetOverlay']);

export function assertRegistryIds(registryIds) {
  if (
    !Array.isArray(registryIds) ||
    registryIds.length !== REGISTRY_IDS.length ||
    registryIds.some((id, index) => id !== REGISTRY_IDS[index])
  ) {
    throw new Error('Registry allowlist differs from the pinned profile');
  }
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, 'en'))
        .map((key) => [key, sortJson(value[key])])
    );
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

export function outputPathForRegistrySource(registrySourcePath) {
  const normalized = registrySourcePath.replaceAll('\\', '/');
  const match = normalized.match(/^registry\/base-nova\/(ui|lib)\/([^/]+\.(?:ts|tsx))$/);
  if (!match) {
    throw new Error(`Unsupported Base Nova registry source path: ${registrySourcePath}`);
  }
  return match[1] === 'ui' ? `normalized/src/components/ui/${match[2]}` : `normalized/src/lib/${match[2]}`;
}

function relativeImport(fromOutputPath, targetOutputPath) {
  let relative = path.posix.relative(path.posix.dirname(fromOutputPath), targetOutputPath);
  relative = relative.replace(/\.(?:ts|tsx)$/, '');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function parsedSource(source, label) {
  const sourceFile = ts.createSourceFile(
    label,
    source,
    ts.ScriptTarget.Latest,
    true,
    label.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    throw new Error(`${label}: source could not be parsed for module-specifier normalization`);
  }
  return sourceFile;
}

function moduleSpecifierNodes(sourceFile) {
  assertSupportedRequireBindings(sourceFile, sourceFile.fileName);
  const specifiers = [];
  function visit(node) {
    let specifier = null;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifier = node.moduleSpecifier;
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifier = node.moduleReference.expression;
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      specifier = node.argument.literal;
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length >= 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.arguments.length === 1)
    ) {
      const expression = node.expression;
      const isDependencyCall =
        expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(expression) && expression.text === 'require') ||
        (ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.expression) &&
          expression.expression.text === 'require' &&
          expression.name.text === 'resolve');
      if (isDependencyCall) specifier = node.arguments[0];
    }
    if (specifier) specifiers.push(specifier);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

export function moduleSpecifiers(source, label) {
  const sourceFile = parsedSource(source, label);
  function rejectComputedDependency(node) {
    const dependency = dependencyCall(node);
    if (dependency?.kind === 'computed') {
      throw new Error(`${label}: non-literal dynamic dependency is not accepted`);
    }
    ts.forEachChild(node, rejectComputedDependency);
  }
  rejectComputedDependency(sourceFile);
  return moduleSpecifierNodes(sourceFile).map((specifier) => specifier.text);
}

function rewriteModuleSpecifiers(source, label, rewrite) {
  const sourceFile = parsedSource(source, label);
  const replacements = [];
  for (const specifier of moduleSpecifierNodes(sourceFile)) {
    const replacement = rewrite(specifier.text);
    if (replacement !== specifier.text) {
      replacements.push({ start: specifier.getStart(sourceFile) + 1, end: specifier.getEnd() - 1, replacement });
    }
  }
  let normalized = source;
  for (const replacement of replacements.reverse()) {
    normalized = `${normalized.slice(0, replacement.start)}${replacement.replacement}${normalized.slice(replacement.end)}`;
  }
  return { source: normalized, transformed: replacements.length > 0 };
}

function hasAppOwnedAliasSpecifier(source, label) {
  return moduleSpecifierNodes(parsedSource(source, label)).some((specifier) => specifier.text.startsWith('@/'));
}

function hasJsx(source) {
  const sourceFile = ts.createSourceFile('jsx-detection.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function hasReactBinding(source) {
  const sourceFile = ts.createSourceFile('react-binding.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return sourceFile.statements.some((statement) => {
    if (
      ts.isImportEqualsDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.name.text === 'React' &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      statement.moduleReference.expression &&
      ts.isStringLiteralLike(statement.moduleReference.expression)
    ) {
      return statement.moduleReference.expression.text === 'react';
    }
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'react'
    ) {
      return false;
    }
    const clause = statement.importClause;
    return Boolean(
      clause &&
        !clause.isTypeOnly &&
        (clause.name?.text === 'React' ||
          (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings) && clause.namedBindings.name.text === 'React'))
    );
  });
}

function hasTypeOnlyReactBinding(source) {
  const sourceFile = ts.createSourceFile('react-type-binding.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return sourceFile.statements.some((statement) => {
    if (
      ts.isImportEqualsDeclaration(statement) &&
      statement.isTypeOnly &&
      statement.name.text === 'React' &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      statement.moduleReference.expression &&
      ts.isStringLiteralLike(statement.moduleReference.expression)
    ) {
      return statement.moduleReference.expression.text === 'react';
    }
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'react' ||
      !statement.importClause
    ) {
      return false;
    }
    const clause = statement.importClause;
    if (clause.isTypeOnly) {
      return Boolean(
        clause.name?.text === 'React' ||
          (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings) && clause.namedBindings.name.text === 'React')
      );
    }
    return Boolean(
      clause.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.some((element) => element.isTypeOnly && element.name.text === 'React')
    );
  });
}

function hasReactRuntimeUse(source) {
  const sourceFile = ts.createSourceFile('react-runtime-use.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === 'React' && !isDeclarationOrPropertyName(node)) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function insertImport(source, declaration) {
  const preprocessed = ts.preProcessFile(source, true, true);
  const references = [
    ...preprocessed.referencedFiles,
    ...preprocessed.typeReferenceDirectives,
    ...preprocessed.libReferenceDirectives
  ];
  let offset = references.reduce((maximum, reference) => Math.max(maximum, reference.end), 0);
  if (offset > 0) {
    const lineEnd = source.indexOf('\n', offset);
    offset = lineEnd === -1 ? source.length : lineEnd + 1;
  }
  const sourceFile = parsedSource(source, 'import-insertion.tsx');
  const firstStatementIndex = sourceFile.statements.findIndex((statement) => statement.getStart(sourceFile) >= offset);
  for (const statement of sourceFile.statements.slice(Math.max(0, firstStatementIndex))) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    offset = statement.getEnd();
    const whitespace = /^(?:[\t ]*\r?\n)*/u.exec(source.slice(offset));
    offset += whitespace?.[0].length ?? 0;
  }
  const separator = offset > 0 && !source.slice(0, offset).endsWith('\n') ? '\n' : '';
  return `${source.slice(0, offset)}${separator}${declaration}\n${source.slice(offset)}`;
}

function resolveIconPlaceholders(source) {
  const sourceFile = parsedSource(source, 'icon-placeholder-normalization.tsx');
  const selectorNames = new Set(['lucide', 'tabler', 'hugeicons', 'phosphor', 'remixicon']);
  const placeholderImport = sourceFile.statements.find(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteralLike(statement.moduleSpecifier) &&
      /(?:^|\/)icon-placeholder$/u.test(statement.moduleSpecifier.text) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.length === 1 &&
      statement.importClause.namedBindings.elements.some(
        (element) => element.name.text === 'IconPlaceholder' && (element.propertyName?.text ?? element.name.text) === 'IconPlaceholder'
      )
  );
  if (!placeholderImport) return { source, transformed: false };

  let importEnd = placeholderImport.getEnd();
  const trailingLine = /^[\t ]*\r?\n/u.exec(source.slice(importEnd));
  importEnd += trailingLine?.[0].length ?? 0;
  const replacements = [{ start: placeholderImport.getStart(sourceFile), end: importEnd, replacement: '' }];
  const icons = new Set();
  function visit(node) {
    if (ts.isJsxElement(node) && ts.isIdentifier(node.openingElement.tagName) && node.openingElement.tagName.text === 'IconPlaceholder') {
      throw new Error('An unresolved IconPlaceholder remains');
    }
    if (ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName) && node.tagName.text === 'IconPlaceholder') {
      const selectors = node.attributes.properties.filter(
        (attribute) => ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name) && selectorNames.has(attribute.name.text)
      );
      const lucideSelectors = selectors.filter((attribute) => attribute.name.text === 'lucide');
      const lucide = lucideSelectors[0];
      if (lucideSelectors.length !== 1 || !lucide.initializer || !ts.isStringLiteralLike(lucide.initializer)) {
        throw new Error('IconPlaceholder does not declare a pinned Lucide icon');
      }
      const icon = lucide.initializer.text;
      if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(icon)) {
        throw new Error('IconPlaceholder does not declare a pinned Lucide icon');
      }
      icons.add(icon);
      if (selectors.length === node.attributes.properties.length) {
        replacements.push({ start: node.getStart(sourceFile), end: node.getEnd(), replacement: `<${icon} />` });
        return;
      }
      replacements.push({ start: node.tagName.getStart(sourceFile), end: node.tagName.getEnd(), replacement: icon });
      for (const selector of selectors) {
        if (!selector.initializer || !ts.isStringLiteralLike(selector.initializer)) {
          throw new Error('IconPlaceholder contains an unrecognized icon selector form');
        }
        let start = selector.getStart(sourceFile);
        while (start > node.tagName.getEnd() && /\s/u.test(source[start - 1])) start -= 1;
        replacements.push({ start, end: selector.getEnd(), replacement: '' });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (icons.size === 0) {
    throw new Error('An unresolved IconPlaceholder remains');
  }

  let normalized = source;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    normalized = `${normalized.slice(0, replacement.start)}${replacement.replacement}${normalized.slice(replacement.end)}`;
  }
  const declaration = `import { ${[...icons].sort().join(', ')} } from "lucide-react"`;
  return { source: insertImport(normalized, declaration), transformed: true };
}

function hasActualIconPlaceholderJsx(source, label) {
  const sourceFile = parsedSource(source, label);
  let found = false;
  function visit(node) {
    if (
      (ts.isJsxElement(node) && ts.isIdentifier(node.openingElement.tagName) && node.openingElement.tagName.text === 'IconPlaceholder') ||
      (ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName) && node.tagName.text === 'IconPlaceholder')
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function hasActualLegacyIconsReference(source, label) {
  const sourceFile = parsedSource(source, label);
  let found = false;
  function visit(node) {
    const receiver =
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && unwrapExpression(node.expression);
    let qualifiedRoot = ts.isQualifiedName(node) ? node : null;
    while (qualifiedRoot && ts.isQualifiedName(qualifiedRoot)) qualifiedRoot = qualifiedRoot.left;
    if (
      (receiver && ts.isIdentifier(receiver) && receiver.text === 'Icons') ||
      (qualifiedRoot && ts.isIdentifier(qualifiedRoot) && qualifiedRoot.text === 'Icons')
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function findMatching(source, openIndex, openCharacter, closeCharacter) {
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === openCharacter) depth += 1;
    if (character === closeCharacter) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function exportedNames(source) {
  const sourceFile = ts.createSourceFile('public-exports.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set();
  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isVariableStatement(statement)) &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
        }
      } else if (statement.name) {
        names.add(statement.name.text);
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        names.add((element.propertyName ?? element.name).text);
      }
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const expression = unwrapExpression(statement.expression);
      if (ts.isIdentifier(expression)) names.add(expression.text);
    }
  }
  return names;
}

const NON_REF_STRUCTURAL_TARGETS = new Set([
  'ComboboxPrimitive.Collection',
  'ComboboxPrimitive.Root',
  'ComboboxPrimitive.Value',
  'DialogPrimitive.Root',
  'DropdownMenuPrimitive.Root',
  'MenuPrimitive.Root',
  'MenuPrimitive.SubmenuRoot',
  'PopoverPrimitive.Root',
  'SelectPrimitive.Root',
  'SheetPrimitive.Root',
  'TooltipPrimitive.Provider',
  'TooltipPrimitive.Root'
]);

function propsBindingName(parameter) {
  if (!parameter) return null;
  if (ts.isIdentifier(parameter.name)) return parameter.name.text;
  if (!ts.isObjectBindingPattern(parameter.name)) return null;
  const rest = parameter.name.elements.find((element) => element.dotDotDotToken && ts.isIdentifier(element.name));
  return rest?.name.text ?? null;
}

function bindingNameContains(name, expected) {
  if (!name) return false;
  if (ts.isIdentifier(name)) return name.text === expected;
  return name.elements.some((element) => element && bindingNameContains(element.name, expected));
}

function scopeShadowsBinding(node, expected) {
  const statements = ts.isBlock(node)
    ? node.statements
    : ts.isCaseBlock(node)
      ? node.clauses.flatMap((clause) => clause.statements)
      : null;
  if (
    statements?.some((statement) => {
      if (ts.isVariableStatement(statement)) {
        return statement.declarationList.declarations.some((declaration) => bindingNameContains(declaration.name, expected));
      }
      return (
        (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === expected
      );
    })
  ) {
    return true;
  }
  if (ts.isCatchClause(node) && node.variableDeclaration) {
    return bindingNameContains(node.variableDeclaration.name, expected);
  }
  if (ts.isForStatement(node) && node.initializer && ts.isVariableDeclarationList(node.initializer)) {
    return node.initializer.declarations.some((declaration) => bindingNameContains(declaration.name, expected));
  }
  if ((ts.isForInStatement(node) || ts.isForOfStatement(node)) && ts.isVariableDeclarationList(node.initializer)) {
    return node.initializer.declarations.some((declaration) => bindingNameContains(declaration.name, expected));
  }
  return false;
}

function expressionReferencesBindings(expression, bindings) {
  let found = false;
  function inspect(node) {
    if (found) return;
    if (ts.isIdentifier(node) && bindings.has(node.text)) {
      const parent = node.parent;
      const isNonReferenceName =
        (ts.isPropertyAssignment(parent) && parent.name === node && !ts.isShorthandPropertyAssignment(parent)) ||
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isBindingElement(parent) && parent.name === node) ||
        (ts.isVariableDeclaration(parent) && parent.name === node);
      if (!isNonReferenceName) found = true;
    }
    if (!found) ts.forEachChild(node, inspect);
  }
  inspect(expression);
  return found;
}

function propsBindingAliases(declaration, propsBinding) {
  const candidates = [];
  const assignmentOperators = new Set([
    ts.SyntaxKind.EqualsToken,
    ts.SyntaxKind.AmpersandAmpersandEqualsToken,
    ts.SyntaxKind.BarBarEqualsToken,
    ts.SyntaxKind.QuestionQuestionEqualsToken
  ]);
  function candidateNames(node) {
    if (ts.isIdentifier(node)) return [node.text];
    if (ts.isBindingElement(node)) return candidateNames(node.name);
    if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) {
      return node.elements.flatMap((element) => (element ? candidateNames(element) : []));
    }
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.flatMap((element) => candidateNames(element));
    }
    if (ts.isObjectLiteralExpression(node)) {
      return node.properties.flatMap((property) => {
        if (ts.isShorthandPropertyAssignment(property)) return [property.name.text];
        if (ts.isPropertyAssignment(property)) return candidateNames(property.initializer);
        if (ts.isSpreadAssignment(property)) return candidateNames(property.expression);
        return [];
      });
    }
    const unwrapped = unwrapExpression(node);
    return unwrapped === node ? [] : candidateNames(unwrapped);
  }
  function visit(node) {
    if (
      node !== declaration.body &&
      (ts.isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node))
    ) {
      return;
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      for (const name of candidateNames(node.name)) candidates.push([name, node.initializer]);
    } else if (
      ts.isBinaryExpression(node) &&
      assignmentOperators.has(node.operatorToken.kind)
    ) {
      for (const name of candidateNames(node.left)) candidates.push([name, node.right]);
    }
    ts.forEachChild(node, visit);
  }
  visit(declaration.body);
  const aliases = new Set([propsBinding]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [alias, expression] of candidates) {
      if (!aliases.has(alias) && expressionReferencesBindings(expression, aliases)) {
        aliases.add(alias);
        changed = true;
      }
    }
  }
  return aliases;
}

function propsSpreadTargets(declaration, parameter, sourceFile) {
  const propsBinding = propsBindingName(parameter);
  if (!propsBinding || !declaration.body) return [];
  const propsAliases = propsBindingAliases(declaration, propsBinding);
  const parameterBindsRef =
    ts.isObjectBindingPattern(parameter.name) &&
    parameter.name.elements.some(
      (element) => !element.dotDotDotToken && !element.propertyName && ts.isIdentifier(element.name) && element.name.text === 'ref'
    );
  const bodyStart = ts.isBlock(declaration.body) ? declaration.body.getStart(sourceFile) + 1 : declaration.body.getStart(sourceFile);
  const targets = [];
  function visit(node, propsBindingIsShadowed = false, refBindingIsShadowed = false) {
    if (
      node !== declaration.body &&
      (ts.isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node))
    ) {
      return;
    }
    const bindingIsShadowed =
      propsBindingIsShadowed || (node !== declaration.body && scopeShadowsBinding(node, propsBinding));
    const refIsShadowed =
      refBindingIsShadowed || (node !== declaration.body && scopeShadowsBinding(node, 'ref'));
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const propsSpread = node.attributes.properties.find((attribute) => {
        if (!ts.isJsxSpreadAttribute(attribute)) return false;
        const expression = unwrapExpression(attribute.expression);
        return expressionReferencesBindings(expression, propsAliases);
      });
      if (propsSpread) {
        const spreadExpression = unwrapExpression(propsSpread.expression);
        const refAttributes = node.attributes.properties.filter(
          (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'ref'
        );
        const forwardsRef = parameterBindsRef && !refIsShadowed && refAttributes.some((attribute) => {
          if (!attribute.initializer || !ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) {
            return false;
          }
          const expression = unwrapExpression(attribute.initializer.expression);
          return ts.isIdentifier(expression) && expression.text === 'ref';
        });
        targets.push({
          name: node.tagName.getText(sourceFile),
          startOffset: node.getStart(sourceFile) - bodyStart,
          insertionOffset: node.tagName.end - bodyStart,
          bindingIsAliased: !(ts.isIdentifier(spreadExpression) && spreadExpression.text === propsBinding),
          bindingIsShadowed,
          forwardsRef,
          hasConflictingRef: refAttributes.length > (forwardsRef ? 1 : 0),
          hasConflictingSpread: node.attributes.properties.some(
            (attribute) => ts.isJsxSpreadAttribute(attribute) && attribute !== propsSpread
          )
        });
      }
    }
    ts.forEachChild(node, (child) => visit(child, bindingIsShadowed, refIsShadowed));
  }
  visit(declaration.body);
  return targets;
}

function targetAcceptsPublicRef(target) {
  return target && !NON_REF_STRUCTURAL_TARGETS.has(target.name) && !target.name.endsWith('.Portal');
}

function refElementType(target, propsType) {
  const intrinsicProps =
    /(?:React\.ComponentProps(?:WithRef|WithoutRef)?|useRender\.ComponentProps)<(["'][a-z][a-z0-9-]*["'])>/.exec(propsType);
  if (intrinsicProps) return `React.ElementRef<${intrinsicProps[1]}>`;
  if (/^(?:ButtonPrimitive|TogglePrimitive)$/.test(target)) return 'HTMLButtonElement';
  if (/(?:\.Trigger|\.Close|\.Clear|\.Tab)$/.test(target)) return 'HTMLButtonElement';
  if (/^(?:CheckboxPrimitive|SwitchPrimitive)\.Root$/.test(target)) return 'HTMLElement';
  if (/InputPrimitive$|\.Input$/.test(target)) return 'HTMLInputElement';
  if (/TextareaPrimitive$|\.Textarea$/.test(target)) return 'HTMLTextAreaElement';
  return /^[a-z]/.test(target) ? `React.ElementRef<"${target}">` : `React.ElementRef<typeof ${target}>`;
}

function isRefBearingPropsType(source, propsType) {
  if (!propsType.trim()) return false;
  const sourceFile = parsedSource(source, 'ref-bearing-props.tsx');
  const aliases = new Map();
  const importedBaseUiPropsTypes = new Set();
  const importedReactPropsHelpers = new Set();
  const addAlias = (name, type) => aliases.set(name, [...(aliases.get(name) ?? []), type]);
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteralLike(statement.moduleSpecifier) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (statement.moduleSpecifier.text === 'react' && /^ComponentProps(?:WithRef|WithoutRef)?$/u.test(importedName)) {
          importedReactPropsHelpers.add(element.name.text);
        }
        if (
          (statement.moduleSpecifier.text === '@base-ui/react' ||
            statement.moduleSpecifier.text.startsWith('@base-ui/react/')) &&
          /Props$/u.test(importedName)
        ) {
          importedBaseUiPropsTypes.add(element.name.text);
        }
      }
    } else if (ts.isTypeAliasDeclaration(statement)) {
      addAlias(statement.name.text, statement.type);
    } else if (ts.isInterfaceDeclaration(statement)) {
      for (const type of (statement.heritageClauses ?? []).flatMap((clause) => clause.types)) {
        addAlias(statement.name.text, type);
      }
    }
  }

  const syntheticFile = parsedSource(`type RefBearingProps = ${propsType}`, 'ref-bearing-props-input.tsx');
  const input = syntheticFile.statements.find(ts.isTypeAliasDeclaration)?.type;
  if (!input) return false;

  const visitedAliases = new Set();
  function isDirectRefPropsName(name) {
    const nameText = name.getText(name.getSourceFile());
    return (
      (ts.isQualifiedName(name) && name.right.text === 'Props') ||
      (ts.isIdentifier(name) && importedBaseUiPropsTypes.has(name.text)) ||
      (ts.isIdentifier(name) && importedReactPropsHelpers.has(name.text)) ||
      /^(?:React|useRender)\.ComponentProps(?:WithRef|WithoutRef)?$/u.test(nameText)
    );
  }
  function inspect(node) {
    if (ts.isTypeReferenceNode(node)) {
      if (isDirectRefPropsName(node.typeName)) return true;
      if (ts.isIdentifier(node.typeName) && aliases.has(node.typeName.text) && !visitedAliases.has(node.typeName.text)) {
        visitedAliases.add(node.typeName.text);
        if (aliases.get(node.typeName.text).some(inspect)) return true;
      }
      return (node.typeArguments ?? []).some(inspect);
    }
    if (ts.isImportTypeNode(node)) {
      if (
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteralLike(node.argument.literal) &&
        (node.argument.literal.text === '@base-ui/react' || node.argument.literal.text.startsWith('@base-ui/react/')) &&
        node.qualifier &&
        /(?:^|\.)[^.]*Props$/u.test(node.qualifier.getText(node.getSourceFile()))
      ) {
        return true;
      }
      if (node.qualifier && isDirectRefPropsName(node.qualifier)) return true;
      return (node.typeArguments ?? []).some(inspect);
    }
    if (ts.isExpressionWithTypeArguments(node)) {
      const expression = node.expression;
      const expressionName = expression.getText(node.getSourceFile());
      if (
        (ts.isPropertyAccessExpression(expression) && expression.name.text === 'Props') ||
        (ts.isIdentifier(expression) && importedBaseUiPropsTypes.has(expression.text)) ||
        (ts.isIdentifier(expression) && importedReactPropsHelpers.has(expression.text)) ||
        /^(?:React|useRender)\.ComponentProps(?:WithRef|WithoutRef)?$/u.test(expressionName)
      ) {
        return true;
      }
      if (ts.isIdentifier(expression) && aliases.has(expression.text) && !visitedAliases.has(expression.text)) {
        visitedAliases.add(expression.text);
        if (aliases.get(expression.text).some(inspect)) return true;
      }
      return (node.typeArguments ?? []).some(inspect);
    }
    let found = false;
    ts.forEachChild(node, (child) => {
      if (!found && inspect(child)) found = true;
    });
    return found;
  }
  return inspect(input);
}

function normalizePublicForwardRefs(source) {
  const exports = exportedNames(source);
  const sourceFile = parsedSource(source, 'public-forward-ref-wrappers.tsx');
  const candidates = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) continue;
    const name = statement.name.text;
    if (!exports.has(name) && !INTERNAL_REF_WRAPPER_NAMES.has(name)) continue;
    const modifiers = statement.modifiers ?? [];
    const parameter = statement.parameters[0];
    const hasOverloads = sourceFile.statements.filter(
      (candidate) => ts.isFunctionDeclaration(candidate) && candidate.name?.text === name
    ).length > 1;
    const isSupportedShape =
      !hasOverloads &&
      !statement.asteriskToken &&
      !statement.typeParameters?.length &&
      !modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) &&
      statement.parameters.length === 1 &&
      parameter &&
      ts.isObjectBindingPattern(parameter.name) &&
      !parameter.dotDotDotToken &&
      !parameter.initializer &&
      !parameter.questionToken &&
      parameter.type;
    if (!isSupportedShape) continue;
    candidates.push({
      bodyClose: statement.body.end - 1,
      bodyOpen: statement.body.getStart(sourceFile),
      declarationStart: statement.getStart(sourceFile),
      defaultExport: modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword),
      namedExport: modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
      name,
      parameter,
      spreadTargets: propsSpreadTargets(statement, parameter, sourceFile)
    });
  }

  let normalized = source;
  let transformed = false;
  for (const candidate of candidates.reverse()) {
    let destructuring = candidate.parameter.name.getText(sourceFile);
    const propsType = candidate.parameter.type.getText(sourceFile);
    if (!isRefBearingPropsType(normalized, propsType)) continue;
    destructuring = destructuring.replace(/(^|\n)(\s*)ref\s*,\s*(?=\n|})/m, '$1$2').replace(/{\s*ref\s*,/, '{');

    let body = normalized.slice(candidate.bodyOpen + 1, candidate.bodyClose);
    const publicSpreadTargets = candidate.spreadTargets.filter(targetAcceptsPublicRef);
    const safeSpreadTargets = publicSpreadTargets.filter(
      (candidateTarget) =>
        !candidateTarget.bindingIsAliased &&
        !candidateTarget.bindingIsShadowed &&
        !candidateTarget.hasConflictingRef &&
        !candidateTarget.hasConflictingSpread
    );
    let target = publicSpreadTargets.length === 1 && safeSpreadTargets.length === 1 ? safeSpreadTargets[0] : null;
    const useRender = /return\s+useRender\(\{\s*/.exec(body);
    if (publicSpreadTargets.length === 0 && useRender) {
      const tag = /useRender\.ComponentProps<(["'])([a-z][a-z0-9-]*)\1>/.exec(propsType);
      if (tag) target = { name: tag[2], useRender: true };
    }
    if (!targetAcceptsPublicRef(target)) continue;
    const targetName = target.name;
    if (target.useRender) {
      const insertion = useRender.index + useRender[0].length;
      body = `${body.slice(0, insertion)}ref,\n    ${body.slice(insertion)}`;
    } else if (!target.forwardsRef) {
      const lineStart = body.lastIndexOf('\n', target.startOffset) + 1;
      const indentation = /^\s*/.exec(body.slice(lineStart, target.startOffset))[0];
      body = `${body.slice(0, target.insertionOffset)}\n${indentation}  ref={ref}${body.slice(target.insertionOffset)}`;
    }
    const elementType = refElementType(targetName, propsType);
    const replacement =
      `${candidate.namedExport && !candidate.defaultExport ? 'export ' : ''}const ${candidate.name} = React.forwardRef<\n  ${elementType},\n  React.PropsWithoutRef<${propsType}>\n>(function ${candidate.name}(${destructuring}, ref) {${body}\n})` +
      (candidate.defaultExport ? `\nexport default ${candidate.name}` : '');
    normalized = `${normalized.slice(0, candidate.declarationStart)}${replacement}${normalized.slice(candidate.bodyClose + 1)}`;
    transformed = true;
  }
  return { source: normalized, transformed };
}

function exportedFunctionContract(source, name) {
  const sourceFile = parsedSource(source, 'normalized-function-wrapper.tsx');
  const declaration = sourceFile.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name && statement.body
  );
  if (!declaration) return null;
  const parameter = declaration.parameters.find(
    (candidate) => !ts.isIdentifier(candidate.name) || candidate.name.text !== 'this'
  );
  return {
    spreadTargets: propsSpreadTargets(declaration, parameter, sourceFile),
    propsType: parameter?.type?.getText(sourceFile) ?? '',
    body: declaration.body.getText(sourceFile).slice(1, -1)
  };
}

function reactWrapperBindings(sourceFile) {
  const namespaces = new Set();
  const namedMemo = new Set();
  const namedForwardRef = new Set();
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportEqualsDeclaration(statement) &&
      !statement.isTypeOnly &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      statement.moduleReference.expression?.text === 'react'
    ) {
      namespaces.add(statement.name.text);
      continue;
    }
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'react' ||
      !statement.importClause ||
      statement.importClause.isTypeOnly
    ) {
      continue;
    }
    if (statement.importClause.name) namespaces.add(statement.importClause.name.text);
    const bindings = statement.importClause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    } else if (bindings) {
      for (const specifier of bindings.elements) {
        const importedName = (specifier.propertyName ?? specifier.name).text;
        if (!specifier.isTypeOnly && importedName === 'memo') {
          namedMemo.add(specifier.name.text);
        } else if (!specifier.isTypeOnly && importedName === 'forwardRef') {
          namedForwardRef.add(specifier.name.text);
        }
      }
    }
  }
  let addedNamespace = true;
  while (addedNamespace) {
    addedNamespace = false;
    function collectNamespaceAliases(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const initializer = unwrapExpression(node.initializer);
        if (ts.isIdentifier(initializer) && namespaces.has(initializer.text) && !namespaces.has(node.name.text)) {
          namespaces.add(node.name.text);
          addedNamespace = true;
        }
      } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = unwrapExpression(node.left);
        const right = unwrapExpression(node.right);
        if (
          ts.isIdentifier(left) &&
          ts.isIdentifier(right) &&
          namespaces.has(right.text) &&
          !namespaces.has(left.text)
        ) {
          namespaces.add(left.text);
          addedNamespace = true;
        }
      }
      ts.forEachChild(node, collectNamespaceAliases);
    }
    collectNamespaceAliases(sourceFile);
  }
  return { namespaces, namedMemo, namedForwardRef };
}

function isConstVariableDeclaration(declaration) {
  return (declaration.parent.flags & ts.NodeFlags.Const) !== 0;
}

function contextualTypeTextsForExpression(expression, sourceFile) {
  const typeTexts = [];
  let current = expression;
  while (true) {
    if (ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isSatisfiesExpression(current)) {
      typeTexts.push(current.type.getText(sourceFile));
      current = current.expression;
      continue;
    }
    return typeTexts;
  }
}

function assignmentTargetContains(node, name) {
  const target = unwrapExpression(node);
  if (ts.isIdentifier(target)) return target.text === name;
  if (ts.isBinaryExpression(target) && target.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return assignmentTargetContains(target.left, name);
  }
  if (ts.isArrayLiteralExpression(target) || ts.isArrayBindingPattern(target)) {
    return target.elements.some((element) => element && assignmentTargetContains(element, name));
  }
  if (ts.isObjectLiteralExpression(target)) {
    return target.properties.some((property) => {
      if (ts.isShorthandPropertyAssignment(property)) return property.name.text === name;
      if (ts.isPropertyAssignment(property)) return assignmentTargetContains(property.initializer, name);
      if (ts.isSpreadAssignment(property)) return assignmentTargetContains(property.expression, name);
      return false;
    });
  }
  if (ts.isObjectBindingPattern(target)) {
    return target.elements.some((element) => assignmentTargetContains(element.name, name));
  }
  if (ts.isBindingElement(target)) return assignmentTargetContains(target.name, name);
  if (ts.isSpreadElement(target)) return assignmentTargetContains(target.expression, name);
  return false;
}

function assignmentPropertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
  return null;
}

function assignedExpressions(left, right, name) {
  const target = unwrapExpression(left);
  const value = unwrapExpression(right);
  if (ts.isIdentifier(target)) return target.text === name ? [right] : [];
  if (ts.isBinaryExpression(target) && target.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    if (!assignmentTargetContains(target.left, name)) return [];
    const assigned = assignedExpressions(target.left, right, name);
    return assigned === null ? null : [...assigned, target.right];
  }
  if (ts.isArrayLiteralExpression(target) || ts.isArrayBindingPattern(target)) {
    if (!assignmentTargetContains(target, name)) return [];
    if (!ts.isArrayLiteralExpression(value)) return null;
    const expressions = [];
    for (let index = 0; index < target.elements.length; index += 1) {
      const element = target.elements[index];
      if (!element || !assignmentTargetContains(element, name)) continue;
      const assigned = value.elements[index] && assignedExpressions(element, value.elements[index], name);
      if (assigned === null || !value.elements[index]) return null;
      expressions.push(...assigned);
    }
    return expressions;
  }
  if (ts.isObjectLiteralExpression(target)) {
    if (!assignmentTargetContains(target, name)) return [];
    if (!ts.isObjectLiteralExpression(value)) return null;
    const expressions = [];
    for (const property of target.properties) {
      const targetNode = ts.isShorthandPropertyAssignment(property)
        ? property.name
        : ts.isPropertyAssignment(property)
          ? property.initializer
          : ts.isSpreadAssignment(property)
            ? property.expression
            : null;
      if (!targetNode || !assignmentTargetContains(targetNode, name)) continue;
      if (ts.isSpreadAssignment(property)) return null;
      const key = assignmentPropertyName(property.name);
      if (key === null) return null;
      const sourceProperty = value.properties.find(
        (candidate) =>
          (ts.isPropertyAssignment(candidate) || ts.isShorthandPropertyAssignment(candidate)) &&
          assignmentPropertyName(candidate.name) === key
      );
      if (!sourceProperty) return null;
      const sourceValue = ts.isPropertyAssignment(sourceProperty) ? sourceProperty.initializer : sourceProperty.name;
      const assigned = assignedExpressions(targetNode, sourceValue, name);
      if (assigned === null) return null;
      expressions.push(...assigned);
    }
    return expressions;
  }
  return assignmentTargetContains(target, name) ? null : [];
}

function functionScopeHasVarBinding(node, name) {
  let found = false;
  function inspect(candidate) {
    if (found || (candidate !== node && ts.isFunctionLike(candidate))) return;
    if (
      ts.isVariableDeclarationList(candidate) &&
      !(candidate.flags & ts.NodeFlags.BlockScoped) &&
      candidate.declarations.some((declaration) => bindingNameContains(declaration.name, name))
    ) {
      found = true;
      return;
    }
    ts.forEachChild(candidate, inspect);
  }
  if (node.body) inspect(node.body);
  return found;
}

function writeScopeShadowsBinding(node, name) {
  if (ts.isFunctionLike(node)) {
    return (
      node.parameters.some((parameter) => bindingNameContains(parameter.name, name)) ||
      (node.name && ts.isIdentifier(node.name) && node.name.text === name) ||
      functionScopeHasVarBinding(node, name)
    );
  }
  const statements = ts.isBlock(node)
    ? node.statements
    : ts.isCaseBlock(node)
      ? node.clauses.flatMap((clause) => clause.statements)
      : null;
  if (
    statements?.some((statement) => {
      if (ts.isVariableStatement(statement)) {
        return (
          Boolean(statement.declarationList.flags & ts.NodeFlags.BlockScoped) &&
          statement.declarationList.declarations.some((declaration) => bindingNameContains(declaration.name, name))
        );
      }
      return (
        (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === name
      );
    })
  ) {
    return true;
  }
  if (ts.isCatchClause(node) && node.variableDeclaration) {
    return bindingNameContains(node.variableDeclaration.name, name);
  }
  if (ts.isForStatement(node) && node.initializer && ts.isVariableDeclarationList(node.initializer)) {
    return (
      Boolean(node.initializer.flags & ts.NodeFlags.BlockScoped) &&
      node.initializer.declarations.some((declaration) => bindingNameContains(declaration.name, name))
    );
  }
  if ((ts.isForInStatement(node) || ts.isForOfStatement(node)) && ts.isVariableDeclarationList(node.initializer)) {
    return (
      Boolean(node.initializer.flags & ts.NodeFlags.BlockScoped) &&
      node.initializer.declarations.some((declaration) => bindingNameContains(declaration.name, name))
    );
  }
  return false;
}

function bindingWrites(sourceFile, name) {
  const expressions = [];
  let hasUnsupportedWrite = false;
  const assignmentOperators = new Set([
    ts.SyntaxKind.EqualsToken,
    ts.SyntaxKind.PlusEqualsToken,
    ts.SyntaxKind.MinusEqualsToken,
    ts.SyntaxKind.AsteriskEqualsToken,
    ts.SyntaxKind.AsteriskAsteriskEqualsToken,
    ts.SyntaxKind.SlashEqualsToken,
    ts.SyntaxKind.PercentEqualsToken,
    ts.SyntaxKind.LessThanLessThanEqualsToken,
    ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
    ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
    ts.SyntaxKind.AmpersandEqualsToken,
    ts.SyntaxKind.BarEqualsToken,
    ts.SyntaxKind.CaretEqualsToken,
    ts.SyntaxKind.AmpersandAmpersandEqualsToken,
    ts.SyntaxKind.BarBarEqualsToken,
    ts.SyntaxKind.QuestionQuestionEqualsToken
  ]);
  function visit(node, shadowed = false) {
    if (node !== sourceFile && ts.isFunctionLike(node)) {
      const parameterShadowsBinding =
        shadowed ||
        node.parameters.some((parameter) => bindingNameContains(parameter.name, name)) ||
        Boolean(node.name && ts.isIdentifier(node.name) && node.name.text === name);
      for (const parameter of node.parameters) {
        if (parameter.initializer) visit(parameter.initializer, parameterShadowsBinding);
      }
      if (node.body) {
        visit(node.body, parameterShadowsBinding || functionScopeHasVarBinding(node, name));
      }
      return;
    }
    const bindingIsShadowed =
      shadowed ||
      (node !== sourceFile && writeScopeShadowsBinding(node, name));
    if (
      !bindingIsShadowed &&
      ts.isBinaryExpression(node) &&
      assignmentOperators.has(node.operatorToken.kind) &&
      assignmentTargetContains(node.left, name)
    ) {
      const assigned = assignedExpressions(node.left, node.right, name);
      if (assigned === null) hasUnsupportedWrite = true;
      else expressions.push(...assigned);
    } else if (
      !bindingIsShadowed &&
      (ts.isForInStatement(node) || ts.isForOfStatement(node))
    ) {
      const loopTarget = ts.isVariableDeclarationList(node.initializer)
        ? node.initializer.declarations.find(
            (declaration) => !(node.initializer.flags & ts.NodeFlags.BlockScoped) && assignmentTargetContains(declaration.name, name)
          )?.name
        : node.initializer;
      if (!loopTarget || !assignmentTargetContains(loopTarget, name)) {
        ts.forEachChild(node, (child) => visit(child, bindingIsShadowed));
        return;
      }
      if (ts.isForOfStatement(node) && ts.isArrayLiteralExpression(unwrapExpression(node.expression))) {
        for (const element of unwrapExpression(node.expression).elements) {
          const assigned = assignedExpressions(loopTarget, element, name);
          if (assigned === null) hasUnsupportedWrite = true;
          else expressions.push(...assigned);
        }
      } else {
        hasUnsupportedWrite = true;
      }
    }
    ts.forEachChild(node, (child) => visit(child, bindingIsShadowed));
  }
  visit(sourceFile);
  return { expressions, hasUnsupportedWrite };
}

function callableFromExportExpression(
  expression,
  sourceFile,
  seen = new Set(),
  memoized = false,
  contextualType = null
) {
  const contextualTypeTexts = [];
  if (typeof contextualType === 'string') contextualTypeTexts.push(contextualType);
  else if (contextualType) contextualTypeTexts.push(contextualType.getText(sourceFile));
  contextualTypeTexts.push(...contextualTypeTextsForExpression(expression, sourceFile));
  const unwrapped = unwrapExpression(expression);
  if (ts.isCommaListExpression(unwrapped)) {
    return callableFromExportExpression(
      unwrapped.elements[unwrapped.elements.length - 1],
      sourceFile,
      seen,
      memoized,
      contextualTypeTexts.join(' & ')
    );
  }
  if (ts.isBinaryExpression(unwrapped) && unwrapped.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    return callableFromExportExpression(
      unwrapped.right,
      sourceFile,
      seen,
      memoized,
      contextualTypeTexts.join(' & ')
    );
  }
  if (ts.isBinaryExpression(unwrapped) && unwrapped.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return callableFromExportExpression(
      unwrapped.right,
      sourceFile,
      seen,
      memoized,
      contextualTypeTexts.join(' & ')
    );
  }
  if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped)) {
    const kind = ts.isArrowFunction(unwrapped) ? 'arrow' : 'function-expression';
    return {
      declaration: unwrapped,
      kind: memoized ? `memoized ${kind}` : kind,
      contextualPropsType: contextualTypeTexts.join(' & ')
    };
  }
  if (ts.isConditionalExpression(unwrapped)) {
    const branches = [unwrapped.whenTrue, unwrapped.whenFalse]
      .map((branch) => callableFromExportExpression(branch, sourceFile, new Set(seen), memoized, contextualTypeTexts.join(' & ')))
      .filter(Boolean);
    if (branches.length === 0) return null;
    throw new Error('conditional exported callable wrappers are not accepted');
  }
  if (ts.isIdentifier(unwrapped)) {
    if (seen.has(unwrapped.text)) return null;
    seen.add(unwrapped.text);
    const functionDeclaration = sourceFile.statements.find(
      (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === unwrapped.text && statement.body
    );
    if (functionDeclaration) {
      throw new Error(`function-declaration exported callable alias ${unwrapped.text} is not accepted`);
    }
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      const declaration = statement.declarationList.declarations.find(
        (candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === unwrapped.text
      );
      if (declaration?.initializer) {
        if (!isConstVariableDeclaration(declaration)) {
          throw new Error(`mutable exported callable alias ${unwrapped.text} is not accepted`);
        }
        return callableFromExportExpression(
          declaration.initializer,
          sourceFile,
          seen,
          memoized,
          declaration.type ?? contextualTypeTexts.join(' & ')
        );
      }
    }
    return null;
  }
  if (!ts.isCallExpression(unwrapped) || unwrapped.arguments.length === 0) return null;
  const bindings = reactWrapperBindings(sourceFile);
  const callee = unwrapExpression(unwrapped.expression);
  const reactWrapperName = (() => {
    if (ts.isIdentifier(callee)) {
      if (bindings.namedMemo.has(callee.text)) return 'memo';
      if (bindings.namedForwardRef.has(callee.text)) return 'forwardRef';
      return null;
    }
    const receiver =
      (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) &&
      ts.isIdentifier(unwrapExpression(callee.expression))
        ? unwrapExpression(callee.expression).text
        : null;
    if (!receiver || !bindings.namespaces.has(receiver)) return null;
    if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
    return ts.isStringLiteralLike(callee.argumentExpression) ? callee.argumentExpression.text : null;
  })();
  if (reactWrapperName === 'forwardRef') return { forwarded: true };
  if (reactWrapperName !== 'memo') {
    if (memoized) throw new Error('unsupported React.memo wrapper argument is not accepted');
    return null;
  }
  const memoContextualTypes = [
    ...contextualTypeTexts,
    ...(unwrapped.typeArguments ?? []).map((typeArgument) => typeArgument.getText(sourceFile))
  ];
  const wrapped = callableFromExportExpression(
    unwrapped.arguments[0],
    sourceFile,
    seen,
    true,
    memoContextualTypes.join(' & ')
  );
  if (!wrapped) throw new Error('unsupported React.memo wrapper argument is not accepted');
  return wrapped;
}

function moduleVariableDeclarations(sourceFile, name) {
  const declarations = [];
  function visit(node) {
    if (
      node !== sourceFile &&
      (ts.isFunctionLike(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node) ||
        ts.isModuleDeclaration(node))
    ) {
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      ts.isVariableDeclarationList(node.parent)
    ) {
      const blockScoped = Boolean(node.parent.flags & ts.NodeFlags.BlockScoped);
      const directTopLevel = ts.isVariableStatement(node.parent.parent) && node.parent.parent.parent === sourceFile;
      if (!blockScoped || directTopLevel) declarations.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return declarations;
}

function expressionIsDefinitelyNonCallable(expression, sourceFile, seen = new Set()) {
  const unwrapped = unwrapExpression(expression);
  if (
    ts.isStringLiteralLike(unwrapped) ||
    ts.isNumericLiteral(unwrapped) ||
    ts.isBigIntLiteral(unwrapped) ||
    ts.isNoSubstitutionTemplateLiteral(unwrapped) ||
    unwrapped.kind === ts.SyntaxKind.TrueKeyword ||
    unwrapped.kind === ts.SyntaxKind.FalseKeyword ||
    unwrapped.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }
  if (ts.isObjectLiteralExpression(unwrapped) || ts.isArrayLiteralExpression(unwrapped)) return true;
  if (ts.isPrefixUnaryExpression(unwrapped) || ts.isPostfixUnaryExpression(unwrapped)) return true;
  if (ts.isConditionalExpression(unwrapped)) {
    return (
      expressionIsDefinitelyNonCallable(unwrapped.whenTrue, sourceFile, new Set(seen)) &&
      expressionIsDefinitelyNonCallable(unwrapped.whenFalse, sourceFile, new Set(seen))
    );
  }
  if (ts.isCommaListExpression(unwrapped)) {
    return expressionIsDefinitelyNonCallable(unwrapped.elements[unwrapped.elements.length - 1], sourceFile, seen);
  }
  if (ts.isBinaryExpression(unwrapped)) {
    if (unwrapped.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return expressionIsDefinitelyNonCallable(unwrapped.right, sourceFile, seen);
    }
    if (unwrapped.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      return expressionIsDefinitelyNonCallable(unwrapped.right, sourceFile, seen);
    }
    if (
      unwrapped.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      unwrapped.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      unwrapped.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      unwrapped.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
      unwrapped.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken ||
      unwrapped.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken
    ) {
      return (
        expressionIsDefinitelyNonCallable(unwrapped.left, sourceFile, new Set(seen)) &&
        expressionIsDefinitelyNonCallable(unwrapped.right, sourceFile, new Set(seen))
      );
    }
    return true;
  }
  if (ts.isIdentifier(unwrapped)) {
    if (seen.has(unwrapped.text)) return false;
    seen.add(unwrapped.text);
    const declarations = moduleVariableDeclarations(sourceFile, unwrapped.text);
    return (
      declarations.length === 1 &&
      isConstVariableDeclaration(declarations[0]) &&
      Boolean(declarations[0].initializer) &&
      expressionIsDefinitelyNonCallable(declarations[0].initializer, sourceFile, seen)
    );
  }
  return false;
}

function anonymousDefaultFunctionContracts(source) {
  const sourceFile = parsedSource(source, 'normalized-anonymous-default-wrapper.tsx');
  const contracts = [];
  const addContract = (declaration, kind) => {
    const parameter = declaration.parameters.find(
      (candidate) => !ts.isIdentifier(candidate.name) || candidate.name.text !== 'this'
    );
    contracts.push({
      kind,
      spreadTargets: propsSpreadTargets(declaration, parameter, sourceFile),
      propsType: parameter?.type?.getText(sourceFile) ?? '',
      body: ts.isBlock(declaration.body)
        ? declaration.body.getText(sourceFile).slice(1, -1)
        : `return ${declaration.body.getText(sourceFile)}`
    });
  };
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      !statement.name &&
      statement.body &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
      statement.modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      addContract(statement, 'function');
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      if (ts.isIdentifier(unwrapExpression(statement.expression))) continue;
      const callable = callableFromExportExpression(statement.expression, sourceFile);
      if (callable && !callable.forwarded) addContract(callable.declaration, callable.kind);
    }
  }
  return contracts;
}

function exportedVariableFunctionContracts(source, name) {
  const sourceFile = parsedSource(source, 'normalized-variable-wrapper.tsx');
  const contracts = [];
  const exportedDeclarations = moduleVariableDeclarations(sourceFile, name);
  if (exportedDeclarations.length === 0) return contracts;
  const exportedDeclaration = exportedDeclarations[0];
  const mutableBinding = exportedDeclarations.some((declaration) => !isConstVariableDeclaration(declaration));
  const declarationContext = exportedDeclarations
    .map((declaration) => declaration.type?.getText(sourceFile) ?? '')
    .filter(Boolean)
    .join(' & ');
  if (
    mutableBinding &&
    declarationContext &&
    isRefBearingPropsType(source, declarationContext)
  ) {
    throw new Error(`mutable exported callable binding ${name} is not accepted`);
  }
  const candidates = [];
  candidates.push(...exportedDeclarations.flatMap((declaration) => (declaration.initializer ? [declaration.initializer] : [])));
  const writes = bindingWrites(sourceFile, name);
  candidates.push(...writes.expressions);
  if (mutableBinding && writes.hasUnsupportedWrite) {
    throw new Error(`mutable exported callable binding ${name} is not accepted`);
  }
  for (const candidate of candidates) {
    const callable = callableFromExportExpression(
      candidate,
      sourceFile,
      new Set(),
      false,
      declarationContext
    );
    const expressionContext = contextualTypeTextsForExpression(candidate, sourceFile).join(' & ');
    if (
      !callable &&
      (declarationContext || expressionContext) &&
      isRefBearingPropsType(source, [declarationContext, expressionContext].filter(Boolean).join(' & '))
    ) {
      throw new Error(`unsupported contextually typed exported callable ${name} is not accepted`);
    }
    if (!callable && mutableBinding && !expressionIsDefinitelyNonCallable(candidate, sourceFile)) {
      throw new Error(`mutable exported callable binding ${name} is not accepted`);
    }
    if (!callable) continue;
    if (callable.forwarded) continue;
    if (mutableBinding) throw new Error(`mutable exported callable binding ${name} is not accepted`);
    const parameter = callable.declaration.parameters.find(
      (candidate) => !ts.isIdentifier(candidate.name) || candidate.name.text !== 'this'
    );
    if (!parameter) continue;
    contracts.push({
      kind: callable.kind,
      spreadTargets: propsSpreadTargets(callable.declaration, parameter, sourceFile),
      propsType: parameter.type?.getText(sourceFile) ?? callable.contextualPropsType ?? '',
      body: ts.isBlock(callable.declaration.body)
        ? callable.declaration.body.getText(sourceFile).slice(1, -1)
        : `return ${callable.declaration.body.getText(sourceFile)}`
    });
  }
  return contracts;
}

export function normalizeRegistrySource({ source, registrySourcePath }) {
  const outputPath = outputPathForRegistrySource(registrySourcePath);
  const transformations = ['normalize-line-endings'];
  let normalized = source.replace(/\r\n?/g, '\n');
  const sourceFile = ts.createSourceFile(outputPath, normalized, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assertSupportedJsxPragmas(sourceFile, outputPath);
  assertSupportedNormalizationDirectives(sourceFile, outputPath);

  if (registrySourcePath.endsWith('/combobox.tsx')) {
    const comboboxResult = rewriteModuleSpecifiers(normalized, registrySourcePath, (specifier) =>
      specifier === '@base-ui/react' ? '@base-ui/react/combobox' : specifier
    );
    if (comboboxResult.transformed) transformations.push('pin-base-ui-combobox-subpath');
    normalized = comboboxResult.source;
  }

  const aliasResult = rewriteModuleSpecifiers(normalized, registrySourcePath, (specifier) => {
    if (specifier === '@/registry/base-nova/lib/utils') {
      return relativeImport(outputPath, 'normalized/src/lib/utils.ts');
    }
    const component = /^@\/registry\/base-nova\/ui\/([a-z0-9-]+)$/u.exec(specifier)?.[1];
    return component ? relativeImport(outputPath, `normalized/src/components/ui/${component}.tsx`) : specifier;
  });
  if (aliasResult.transformed) transformations.push('rewrite-app-owned-aliases');
  normalized = aliasResult.source;

  const iconResult = resolveIconPlaceholders(normalized);
  if (iconResult.transformed) transformations.push('resolve-lucide-icon-placeholders');
  normalized = iconResult.source;

  if (registrySourcePath.endsWith('.tsx')) {
    const sourceRequiresReactRuntime = hasJsx(normalized) || hasReactRuntimeUse(normalized);
    const forwardRefResult = normalizePublicForwardRefs(normalized);
    const requiresReactBinding =
      (sourceRequiresReactRuntime || forwardRefResult.transformed) && !hasReactBinding(forwardRefResult.source);
    if (requiresReactBinding && hasTypeOnlyReactBinding(forwardRefResult.source)) {
      throw new Error(`${outputPath}: a type-only React binding cannot provide the classic React 17 runtime`);
    }
    if (requiresReactBinding) transformations.push('bind-react-namespace');
    if (forwardRefResult.transformed) transformations.push('react17-forward-ref-public-wrappers');
    normalized = forwardRefResult.source;
    if (requiresReactBinding) normalized = insertImport(normalized, 'import * as React from "react"');
  }

  normalized = `${normalized.replace(/\s+$/u, '')}\n`;
  assertReact17Source(normalized, outputPath);

  return {
    outputPath,
    source: normalized,
    transformations: [...new Set(transformations)]
  };
}

function declarationTarget(value) {
  if (typeof value === 'string') return value.endsWith('.d.ts') ? value : null;
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const target = declarationTarget(candidate);
      if (target) return target;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  if (Object.hasOwn(value, 'types')) return declarationTarget(value.types);
  if (Object.hasOwn(value, 'default')) return declarationTarget(value.default);
  for (const candidate of Object.values(value)) {
    const target = declarationTarget(candidate);
    if (target) return target;
  }
  return null;
}

function declarationFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.d.ts')) files.push(absolute);
    }
  }
  visit(root);
  return files.sort((left, right) => left.localeCompare(right, 'en'));
}

function hasDeclarationModuleSurface(declarationPath) {
  const program = ts.createProgram([declarationPath], {
    noEmit: true,
    skipLibCheck: true,
    types: []
  });
  const sourceFile = program.getSourceFile(declarationPath);
  const moduleSymbol = sourceFile && program.getTypeChecker().getSymbolAtLocation(sourceFile);
  return Boolean(sourceFile && sourceFile.parseDiagnostics.length === 0 && moduleSymbol && program.getTypeChecker().getExportsOfModule(moduleSymbol).length);
}

function declarationEntrypoints(typesPackageName, runtimePackageName) {
  const packageJsonPath = require.resolve(`${typesPackageName}/package.json`);
  const packageRoot = path.dirname(packageJsonPath);
  const manifest = require(packageJsonPath);
  const expectedVersion = profileManifest.devDependencies?.[typesPackageName];
  if (!expectedVersion || manifest.version !== expectedVersion) {
    throw new Error(
      `Resolved ${typesPackageName}@${manifest.version ?? 'unknown'} instead of the profile-pinned ${expectedVersion ?? 'missing'}`
    );
  }
  const entrypoints = new Map();
  const addEntrypoint = (entrypoint, declarationTargetPath) => {
    const declarationPath = path.resolve(packageRoot, declarationTargetPath);
    const relative = path.relative(packageRoot, declarationPath);
    if (relative.startsWith('..') || path.isAbsolute(relative) || entrypoints.has(entrypoint)) {
      throw new Error(`Unable to derive an exact React 17 declaration entrypoint inventory for ${typesPackageName}`);
    }
    entrypoints.set(entrypoint, declarationPath);
  };

  if (manifest.exports) {
    for (const [exportKey, exportTarget] of Object.entries(manifest.exports)) {
      if (exportKey.includes('*')) {
        throw new Error(`Wildcard React declaration exports are not accepted for ${typesPackageName}`);
      }
      const target = declarationTarget(exportTarget);
      if (!target) continue;
      const entrypoint = exportKey === '.' ? runtimePackageName : `${runtimePackageName}/${exportKey.slice(2)}`;
      addEntrypoint(entrypoint, target);
    }
  } else {
    for (const declarationPath of declarationFiles(packageRoot).filter(hasDeclarationModuleSurface)) {
      const relative = path.relative(packageRoot, declarationPath).replaceAll(path.sep, '/');
      const subpath = relative.replace(/(?:^|\/)index\.d\.ts$/u, '').replace(/\.d\.ts$/u, '');
      addEntrypoint(subpath ? `${runtimePackageName}/${subpath}` : runtimePackageName, relative);
    }
  }

  if (!entrypoints.has(runtimePackageName)) {
    throw new Error(`The root React 17 declaration entrypoint is missing for ${typesPackageName}`);
  }
  return entrypoints;
}

function compilerSurface(declarationPath) {
  const program = ts.createProgram([declarationPath], {
    noEmit: true,
    skipLibCheck: true,
    types: []
  });
  const sourceFile = program.getSourceFile(declarationPath);
  const checker = program.getTypeChecker();
  const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
  if (!sourceFile || sourceFile.parseDiagnostics.length > 0 || !moduleSymbol) {
    throw new Error(`Unable to derive the pinned React 17 compiler surface from ${declarationPath}`);
  }
  const exportedSymbols = checker.getExportsOfModule(moduleSymbol);
  if (exportedSymbols.length === 0) {
    throw new Error(`The pinned React 17 compiler surface is empty in ${declarationPath}`);
  }
  return Object.freeze({
    exports: new Set(exportedSymbols.map((symbol) => symbol.getName())),
    values: new Set(
      exportedSymbols.filter((symbol) => (symbol.flags & ts.SymbolFlags.Value) !== 0).map((symbol) => symbol.getName())
    )
  });
}

const REACT_COMPILER_SURFACES = new Map();
for (const [typesPackageName, runtimePackageName] of [
  ['@types/react', 'react'],
  ['@types/react-dom', 'react-dom']
]) {
  for (const [entrypoint, declarationPath] of declarationEntrypoints(typesPackageName, runtimePackageName)) {
    if (REACT_COMPILER_SURFACES.has(entrypoint)) {
      throw new Error(`Duplicate pinned React 17 declaration entrypoint: ${entrypoint}`);
    }
    REACT_COMPILER_SURFACES.set(entrypoint, compilerSurface(declarationPath));
  }
}

function reactCompilerSurface(moduleName, label) {
  if (
    moduleName !== 'react' &&
    !moduleName.startsWith('react/') &&
    moduleName !== 'react-dom' &&
    !moduleName.startsWith('react-dom/')
  ) {
    return null;
  }
  if (moduleName.endsWith('.js')) {
    const canonicalModuleName = moduleName.slice(0, -3);
    if (REACT_COMPILER_SURFACES.has(canonicalModuleName)) {
      throw new Error(
        `${label}: ${moduleName} is a non-canonical React 17 entrypoint; use ${canonicalModuleName} without the .js suffix`
      );
    }
  }
  if (/^react\/jsx-(?:dev-)?runtime$/u.test(moduleName)) {
    throw new Error(`${label}: automatic JSX runtime output is not accepted`);
  }
  const surface = REACT_COMPILER_SURFACES.get(moduleName);
  if (!surface) {
    throw new Error(`${label}: ${moduleName} is outside the pinned React 17 declaration entrypoint inventory`);
  }
  return surface;
}

function assertCompilerSurfaceMember({ label, member, moduleName, operation, valueOnly = false }) {
  const surface = REACT_COMPILER_SURFACES.get(moduleName);
  if (!surface) {
    throw new Error(`${label}: ${moduleName} is outside the pinned React 17 declaration entrypoint inventory`);
  }
  const accepted = valueOnly ? surface.values : surface.exports;
  if (!accepted.has(member)) {
    throw new Error(`${label}: ${member} ${operation} ${moduleName} is outside the pinned React 17 compiler surface`);
  }
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function unwrapDependencyExpression(node) {
  let current = unwrapExpression(node);
  while (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    current = unwrapExpression(current.right);
  }
  return current;
}

export function dependencyCall(node) {
  const current = unwrapDependencyExpression(node);
  if (!ts.isCallExpression(current)) return null;
  const expression = unwrapDependencyExpression(current.expression);
  const isDynamicImport = expression.kind === ts.SyntaxKind.ImportKeyword;
  const isRequire = ts.isIdentifier(expression) && expression.text === 'require';
  const isRequireResolve =
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'require' &&
    expression.name.text === 'resolve';
  if (!isDynamicImport && !isRequire && !isRequireResolve) return null;
  if (
    current.arguments.length < 1 ||
    !ts.isStringLiteralLike(current.arguments[0]) ||
    (!isDynamicImport && current.arguments.length !== 1)
  ) {
    return { kind: 'computed', moduleName: null };
  }
  return {
    kind: isDynamicImport ? 'dynamic-import' : isRequireResolve ? 'require-resolve' : 'require',
    moduleName: current.arguments[0].text
  };
}

const unsupportedCommonJsGlobals = new Set(['module', 'exports', '__dirname', '__filename']);

function isDeclarationOrPropertyName(node) {
  const parent = node.parent;
  if (
    ((ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isImportClause(parent) ||
      ts.isImportEqualsDeclaration(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isExportSpecifier(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeParameterDeclaration(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isClassExpression(parent)) &&
      parent.name === node) ||
    ((ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyAssignment(parent)) &&
      parent.name === node)
  ) {
    return true;
  }
  for (let current = parent; current; current = current.parent) {
    if (ts.isTypeNode(current)) return true;
    if (ts.isExpression(current) || ts.isStatement(current)) break;
  }
  return false;
}

function staticPropertyName(node) {
  const current = unwrapExpression(node);
  if (ts.isStringLiteralLike(current)) return current.text;
  if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticPropertyName(current.left);
    const right = staticPropertyName(current.right);
    if (left !== null && right !== null) return left + right;
  }
  return null;
}

function isSupportedRequireCallUse(node) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (
      (ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isTypeAssertionExpression(parent) ||
        ts.isNonNullExpression(parent) ||
        ts.isSatisfiesExpression(parent)) &&
      parent.expression === current
    ) {
      current = parent;
      continue;
    }
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.CommaToken && parent.right === current) {
      current = parent;
      continue;
    }
    if (ts.isPropertyAccessExpression(parent) && parent.expression === current && parent.name.text === 'resolve') {
      current = parent;
      continue;
    }
    return ts.isCallExpression(parent) && parent.expression === current && dependencyCall(parent) !== null;
  }
  return false;
}

export function assertSupportedRequireBindings(sourceFile, label) {
  function visit(node) {
    if (
      ts.isElementAccessExpression(node) &&
      node.argumentExpression &&
      staticPropertyName(node.argumentExpression) === 'require'
    ) {
      throw new Error(`${label}: indirect or unsupported require binding use is not accepted`);
    }
    if (
      ts.isIdentifier(node) &&
      node.text === 'require' &&
      !isDeclarationOrPropertyName(node) &&
      !isSupportedRequireCallUse(node)
    ) {
      throw new Error(`${label}: indirect or unsupported require binding use is not accepted`);
    }
    if (
      ts.isIdentifier(node) &&
      unsupportedCommonJsGlobals.has(node.text) &&
      !isDeclarationOrPropertyName(node) &&
      !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
    ) {
      throw new Error(`${label}: CommonJS global ${node.text} is not accepted in generated ESM source`);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

export function assertSupportedJsxPragmas(sourceFile, label) {
  if (sourceFile.pragmas.has('jsx') || sourceFile.pragmas.has('jsxfrag')) {
    throw new Error(`${label}: custom JSX factory pragmas are not accepted in generated profile source`);
  }
  const jsxRuntimePragma = sourceFile.pragmas.get('jsxruntime');
  for (const pragma of jsxRuntimePragma ? (Array.isArray(jsxRuntimePragma) ? jsxRuntimePragma : [jsxRuntimePragma]) : []) {
    const runtime = pragma.arguments?.factory;
    if (runtime !== 'classic') {
      throw new Error(
        `${label}: JSX runtime pragma ${JSON.stringify(runtime)} is not accepted; generated source must use the classic React 17 runtime`
      );
    }
  }
  if (sourceFile.pragmas.has('jsximportsource')) {
    throw new Error(`${label}: JSX import source pragmas are not accepted in generated profile source`);
  }
}

function assertSupportedNormalizationDirectives(sourceFile, label) {
  if (sourceFile.amdDependencies.length > 0 || sourceFile.moduleName) {
    throw new Error(`${label}: AMD directives are not accepted in generated profile source`);
  }
  if (ts.preProcessFile(sourceFile.text, true, true).isLibFile) {
    throw new Error(`${label}: no-default-lib directives are not accepted in generated profile source`);
  }
}
function bindingPropertyName(element) {
  const property = element.propertyName ?? element.name;
  if (ts.isIdentifier(property) || ts.isStringLiteralLike(property)) return property.text;
  return null;
}

function assertReact17AstSource(source, label) {
  const sourceFile = ts.createSourceFile(
    label,
    source,
    ts.ScriptTarget.Latest,
    true,
    label.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    throw new Error(`${label}: source could not be parsed for React 17 compatibility`);
  }
  assertSupportedRequireBindings(sourceFile, label);
  assertSupportedJsxPragmas(sourceFile, label);

  const namespaceBindings = new Map();
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportEqualsDeclaration(statement) &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      statement.moduleReference.expression &&
      ts.isStringLiteralLike(statement.moduleReference.expression)
    ) {
      const moduleName = statement.moduleReference.expression.text;
      const surface = reactCompilerSurface(moduleName, label);
      if (surface && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        throw new Error(`${label}: exported ${moduleName} ImportEqualsDeclaration namespaces are not accepted`);
      }
      if (surface) {
        namespaceBindings.set(statement.name.text, moduleName);
      }
      continue;
    }
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteralLike(statement.moduleSpecifier)
    ) {
      const moduleName = statement.moduleSpecifier.text;
      const surface = reactCompilerSurface(moduleName, label);
      if (ts.isExportDeclaration(statement) && surface) {
        if (!statement.exportClause || ts.isNamespaceExport(statement.exportClause)) {
          throw new Error(`${label}: React namespace re-exports are not accepted`);
        }
        for (const element of statement.exportClause.elements) {
          const exported = (element.propertyName ?? element.name).text;
          assertCompilerSurfaceMember({ label, member: exported, moduleName, operation: 're-exported from' });
        }
      }
    }
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)) continue;
    const moduleName = statement.moduleSpecifier.text;
    const surface = reactCompilerSurface(moduleName, label);
    if (!surface) continue;
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) namespaceBindings.set(clause.name.text, moduleName);
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      namespaceBindings.set(clause.namedBindings.name.text, moduleName);
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        const imported = (element.propertyName ?? element.name).text;
        assertCompilerSurfaceMember({ label, member: imported, moduleName, operation: 'imported from' });
      }
    }
  }

  let addedBinding = true;
  while (addedBinding) {
    addedBinding = false;
    function collectAliases(node) {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const initializer = unwrapExpression(node.initializer);
        const moduleName = ts.isIdentifier(initializer) ? namespaceBindings.get(initializer.text) : null;
        if (moduleName && ts.isIdentifier(node.name) && !namespaceBindings.has(node.name.text)) {
          namespaceBindings.set(node.name.text, moduleName);
          addedBinding = true;
        }
        if (moduleName && ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (element.dotDotDotToken) {
              throw new Error(`${label}: React namespace rest destructuring is not accepted`);
            }
            const imported = bindingPropertyName(element);
            if (!imported) throw new Error(`${label}: computed React namespace destructuring is not accepted`);
            assertCompilerSurfaceMember({
              label,
              member: imported,
              moduleName,
              operation: 'read from',
              valueOnly: true
            });
          }
        }
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const right = unwrapExpression(node.right);
        const moduleName = ts.isIdentifier(right) ? namespaceBindings.get(right.text) : null;
        if (moduleName) {
          const left = unwrapExpression(node.left);
          if (!ts.isIdentifier(left)) {
            throw new Error(`${label}: unsupported ${moduleName} namespace assignment is not accepted`);
          }
          if (!namespaceBindings.has(left.text)) {
            namespaceBindings.set(left.text, moduleName);
            addedBinding = true;
          }
        }
      }
      ts.forEachChild(node, collectAliases);
    }
    collectAliases(sourceFile);
  }

  function inspect(node) {
    if (ts.isExportSpecifier(node)) {
      const localName = (node.propertyName ?? node.name).text;
      if (namespaceBindings.has(localName)) {
        throw new Error(`${label}: local ${namespaceBindings.get(localName)} namespace re-exports are not accepted`);
      }
    }

    const dependency = dependencyCall(node);
    if (dependency) {
      if (dependency.kind === 'computed') {
        throw new Error(`${label}: non-literal dynamic dependency is not accepted`);
      }
      if (reactCompilerSurface(dependency.moduleName, label)) {
        throw new Error(`${label}: ${dependency.kind} React dependency forms are not accepted`);
      }
    }

    if (ts.isPropertyAccessExpression(node)) {
      const expression = unwrapExpression(node.expression);
      const moduleName = ts.isIdentifier(expression) ? namespaceBindings.get(expression.text) : null;
      if (moduleName) {
        assertCompilerSurfaceMember({
          label,
          member: node.name.text,
          moduleName,
          operation: 'namespace API on',
          valueOnly: true
        });
      }
    }
    if (ts.isElementAccessExpression(node)) {
      const expression = unwrapExpression(node.expression);
      const moduleName = ts.isIdentifier(expression) ? namespaceBindings.get(expression.text) : null;
      if (moduleName) {
        if (!node.argumentExpression || !ts.isStringLiteralLike(node.argumentExpression)) {
          throw new Error(`${label}: computed ${moduleName} namespace access is not accepted`);
        }
        assertCompilerSurfaceMember({
          label,
          member: node.argumentExpression.text,
          moduleName,
          operation: 'namespace API on',
          valueOnly: true
        });
      }
    }
    if (ts.isQualifiedName(node) && ts.isIdentifier(node.left)) {
      const moduleName = namespaceBindings.get(node.left.text);
      if (moduleName) {
        assertCompilerSurfaceMember({
          label,
          member: node.right.text,
          moduleName,
          operation: 'namespace type on'
        });
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(unwrapExpression(node.expression)) &&
      ['_jsx', '_jsxs', '_jsxDEV'].includes(unwrapExpression(node.expression).text)
    ) {
      throw new Error(`${label}: automatic JSX runtime output is not accepted`);
    }
    if (ts.isIdentifier(node) && namespaceBindings.has(node.text)) {
      const parent = node.parent;
      const isImportBinding =
        ts.isImportClause(parent) ||
        ts.isNamespaceImport(parent) ||
        ts.isImportSpecifier(parent) ||
        ts.isImportEqualsDeclaration(parent) ||
        ts.isExportSpecifier(parent);
      const isNamespaceAccess =
        ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === node) ||
        (ts.isQualifiedName(parent) && parent.left === node);
      const isControlledAlias = ts.isVariableDeclaration(parent) && parent.initializer && unwrapExpression(parent.initializer) === node;
      const isControlledAssignment =
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        unwrapExpression(parent.right) === node;
      const isBindingDefinition =
        (ts.isVariableDeclaration(parent) && parent.name === node) ||
        (ts.isBinaryExpression(parent) &&
          parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          unwrapExpression(parent.left) === node);
      const isControlledDestructure =
        ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name) && unwrapExpression(parent.initializer) === node;
      if (
        !isImportBinding &&
        !isNamespaceAccess &&
        !isControlledAlias &&
        !isControlledAssignment &&
        !isBindingDefinition &&
        !isControlledDestructure
      ) {
        throw new Error(`${label}: ${namespaceBindings.get(node.text)} namespace escapes are not accepted`);
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(sourceFile);
}

export function assertReact17Source(source, label) {
  assertReact17AstSource(source, label);
  if (
    hasAppOwnedAliasSpecifier(source, label) ||
    hasActualIconPlaceholderJsx(source, label) ||
    hasActualLegacyIconsReference(source, label)
  ) {
    throw new Error(`${label}: unresolved alias or icon placeholder remains after normalization`);
  }
  if (label.endsWith('.tsx') && hasJsx(source) && !hasReactBinding(source)) {
    throw new Error(`${label}: JSX source does not bind the React namespace`);
  }
  for (const anonymousDefault of anonymousDefaultFunctionContracts(source)) {
    const refProps = isRefBearingPropsType(source, anonymousDefault.propsType);
    const useRenderWrapper = /return\s+useRender\(\{/.test(anonymousDefault.body);
    if (
      refProps &&
      (anonymousDefault.spreadTargets.some(targetAcceptsPublicRef) || useRenderWrapper)
    ) {
      throw new Error(
        `${label}: anonymous default-exported ref-bearing ${anonymousDefault.kind} wrapper is not normalized with React.forwardRef`
      );
    }
  }
  for (const name of exportedNames(source)) {
    const ordinary = exportedFunctionContract(source, name);
    const refProps = ordinary && isRefBearingPropsType(source, ordinary.propsType);
    const useRenderWrapper = ordinary && /return\s+useRender\(\{/.test(ordinary.body);
    if (
      ordinary &&
      refProps &&
      (ordinary.spreadTargets.some(targetAcceptsPublicRef) || useRenderWrapper)
    ) {
      throw new Error(`${label}: public ref-bearing wrapper ${name} is not normalized with React.forwardRef`);
    }
    for (const variableFunction of exportedVariableFunctionContracts(source, name)) {
      const variableRefProps = isRefBearingPropsType(source, variableFunction.propsType);
      const variableUseRenderWrapper = /return\s+useRender\(\{/.test(variableFunction.body);
      if (
        variableRefProps &&
        (variableFunction.spreadTargets.some(targetAcceptsPublicRef) || variableUseRenderWrapper)
      ) {
        throw new Error(
          `${label}: public ref-bearing ${variableFunction.kind} wrapper ${name} is not normalized with React.forwardRef`
        );
      }
    }
  }
}

export function externalImports(source) {
  const imports = new Set();
  const addSpecifier = (specifier) => {
    if (specifier.startsWith('.') || specifier.startsWith('/')) return;
    imports.add(specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);
  };
  for (const specifier of moduleSpecifierNodes(parsedSource(source, 'dependency-inventory.tsx'))) {
    addSpecifier(specifier.text);
  }
  return [...imports].sort();
}
