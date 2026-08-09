import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const requireFromRoot = createRequire(path.join(moduleRoot, 'package.json'));
const postcss = requireFromRoot('postcss');
const selectorParser = requireFromRoot('postcss-selector-parser');
const valueParser = requireFromRoot('postcss-value-parser');

export const SCOPE_ATTRIBUTE = 'data-spfx-ui-scope';

const ASSET_FUNCTIONS = new Set(['url', 'image', 'image-set', '-webkit-image-set', 'cross-fade', 'element', 'paint']);
const SEMANTIC_PROPERTY_REPLACEMENTS = new Map([
  ['--foreground', '--spfx-ui-color-foreground'],
  ['--secondary', '--spfx-ui-color-secondary'],
  ['--radius', '--spfx-ui-radius-lg'],
  ['--radius-md', '--spfx-ui-radius-md'],
  ['--spacing', '--skui-spacing']
]);
const RUNTIME_PROPERTIES = new Set([
  '--accordion-panel-height',
  '--anchor-width',
  '--available-height',
  '--available-width',
  '--transform-origin',
  '--gap',
  '--radix-accordion-content-height',
  '--bits-accordion-content-height',
  '--reka-accordion-content-height',
  '--kb-accordion-content-height',
  '--ngp-accordion-content-height'
]);
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isAbsoluteFilesystemPath(value) {
  if (value === '/' || value === '\\') return false;
  return path.posix.isAbsolute(value) || path.win32.isAbsolute(value);
}

function scopeSelector(scopeValue) {
  assert(/^skui-[a-f0-9]{16}$/u.test(scopeValue), 'CSS scope value is not digest-derived');
  return `[${SCOPE_ATTRIBUTE}="${scopeValue}"]`;
}

function insideKeyframes(rule) {
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && /^(?:-webkit-)?keyframes$/iu.test(parent.name)) return true;
  }
  return false;
}

function scopeBoundaryParams(scopeValue) {
  const scope = scopeSelector(scopeValue);
  const anyScope = `[${SCOPE_ATTRIBUTE}]`;
  return `(${scope}) to (${anyScope}:not(${scope}))`;
}

function scopeSelfPseudo() {
  return selectorParser().astSync(':where(:scope)').nodes[0].nodes[0].clone();
}

function scopeOneSelector(selector) {
  let nestingFound = false;
  selector.walkNesting(() => {
    nestingFound = true;
  });
  assert(!nestingFound, `Nested selectors are not accepted: ${selector}`);
  assert(!selectorHasExplicitScopeAttribute(selector), `Source selector owns ${SCOPE_ATTRIBUTE}: ${selector}`);

  const rootPseudos = [];
  selector.walkPseudos((pseudo) => {
    assert(pseudo.value.toLowerCase() !== ':scope', `Source selector owns :scope: ${selector}`);
    if ([':root', ':host'].includes(pseudo.value.toLowerCase())) rootPseudos.push(pseudo);
  });
  if (rootPseudos.length > 0) {
    assert(rootPseudos.length === 1, `Selector contains multiple root pseudos: ${selector}`);
    const rootPseudo = rootPseudos[0];
    assert(
      rootPseudo.parent === selector && !rootPseudo.nodes?.length,
      `Nested or functional root selector is not accepted: ${selector}`
    );
    assert(selector.nodes.length === 1, `Root selector must be the complete selector: ${selector}`);
    rootPseudo.replaceWith(selectorParser.pseudo({ value: ':scope' }));
    return null;
  }

  assert(selector.first?.type !== 'combinator', `Leading combinators are not accepted: ${selector}`);
  const selfSelector = selector.clone();
  const selfScope = scopeSelfPseudo();
  if (['tag', 'universal'].includes(selfSelector.first?.type)) {
    selfSelector.insertAfter(selfSelector.first, selfScope);
  }
  else {
    selfSelector.first.spaces.before = '';
    selfSelector.prepend(selfScope);
  }
  return selfSelector;
}

function propertyFallbacks(root) {
  const values = new Map();
  const record = (name, value) => {
    assert(name.startsWith('--') && !name.includes('\\'), `Unsafe fallback property name: ${name}`);
    if (values.has(name)) assert(values.get(name) === value, `Conflicting fallback property value: ${name}`);
    else values.set(name, value);
  };

  root.walkAtRules((atRule) => {
    const name = atRule.name.toLowerCase();
    if (name === 'layer' && atRule.params.trim().toLowerCase() === 'properties') {
      atRule.walkDecls((declaration) => {
        if (declaration.prop.startsWith('--')) record(declaration.prop, declaration.value);
      });
    }
    if (name === 'property') {
      const initialValue = atRule.nodes?.find(
        (node) => node.type === 'decl' && node.prop.toLowerCase() === 'initial-value'
      );
      if (initialValue && !values.has(atRule.params.trim())) record(atRule.params.trim(), initialValue.value);
    }
  });
  return values;
}

function removeAndFlattenGlobalAtRules(root) {
  const fallbacks = propertyFallbacks(root);
  root.walkAtRules((atRule) => {
    const name = atRule.name.toLowerCase();
    if (name === 'property') {
      atRule.remove();
      return;
    }
    if (name !== 'layer') return;
    const layer = atRule.params.trim();
    if (['base', 'properties'].includes(layer.toLowerCase())) {
      atRule.remove();
      return;
    }
    if (!['theme', 'components', 'utilities'].includes(layer)) return;
    if (atRule.nodes?.length) atRule.replaceWith(...atRule.nodes);
    else atRule.remove();
  });

  if (fallbacks.size > 0) {
    const fallbackRule = postcss.rule({ selector: ':root,:host,*,:before,:after,::backdrop' });
    for (const [property, value] of [...fallbacks].sort(([left], [right]) => left.localeCompare(right))) {
      fallbackRule.append(postcss.decl({ prop: property, value }));
    }
    root.prepend(fallbackRule);
  }
  return fallbacks.size;
}

function transformValue(value, transformWord) {
  assert(!isAbsoluteFilesystemPath(value.trim()), `Absolute filesystem path is not accepted: ${value.trim()}`);
  const parsed = valueParser(value);
  parsed.walk((node) => {
    if (node.type === 'string') {
      assert(
        !isAbsoluteFilesystemPath(node.value),
        `Absolute filesystem path is not accepted: ${node.value}`
      );
    }
    if (node.type === 'function') {
      assert(!node.value.includes('\\'), `Escaped CSS function is not accepted: ${node.value}`);
      assert(!ASSET_FUNCTIONS.has(node.value.toLowerCase()), `CSS asset function is not accepted: ${node.value}`);
    }
    if (node.type !== 'word') return;
    assert(
      !isAbsoluteFilesystemPath(node.value),
      `Absolute filesystem path is not accepted: ${node.value}`
    );
    if (node.value.startsWith('--')) {
      assert(!node.value.includes('\\'), `Escaped custom property is not accepted: ${node.value}`);
    }
    node.value = transformWord(node.value);
  });
  return parsed.toString();
}

function namespaceTailwindPropertyName(name, scopeValue) {
  if (name === '--tw') return `--${scopeValue}-tw-sentinel`;
  if (name.startsWith('--tw-')) return `--${scopeValue}-tw-${name.slice('--tw-'.length)}`;
  return name;
}

function namespaceTailwindProperties(root, scopeValue) {
  root.walkDecls((declaration) => {
    if (declaration.prop.startsWith('--')) {
      assert(!declaration.prop.includes('\\'), `Escaped custom property is not accepted: ${declaration.prop}`);
      declaration.prop = namespaceTailwindPropertyName(declaration.prop, scopeValue);
    }
    declaration.value = transformValue(declaration.value, (word) => namespaceTailwindPropertyName(word, scopeValue));
  });
  root.walkAtRules((atRule) => {
    if (/^(?:-webkit-)?keyframes$/iu.test(atRule.name) || atRule.name.toLowerCase() === 'container') return;
    atRule.params = transformValue(atRule.params, (word) => namespaceTailwindPropertyName(word, scopeValue));
  });
}

function rewriteSemanticProperties(root) {
  root.walkDecls((declaration) => {
    declaration.value = transformValue(declaration.value, (word) => SEMANTIC_PROPERTY_REPLACEMENTS.get(word) ?? word);
  });
  root.walkAtRules((atRule) => {
    atRule.params = transformValue(atRule.params, (word) => SEMANTIC_PROPERTY_REPLACEMENTS.get(word) ?? word);
  });
}

function namespaceContainers(root, scopeValue) {
  const replacements = new Map();
  const register = (name) => {
    if (['none', 'normal'].includes(name.toLowerCase())) return;
    assert(/^[-_a-z][-_a-z0-9]*$/iu.test(name), `Unsupported container identifier: ${name}`);
    if (!replacements.has(name)) replacements.set(name, `${scopeValue}-container-${name}`);
  };

  root.walkDecls((declaration) => {
    const property = declaration.prop.toLowerCase();
    if (!['container', 'container-name'].includes(property)) return;
    const words = [];
    valueParser(declaration.value).walk((node) => {
      if (node.type === 'word') words.push(node.value);
    });
    if (property === 'container') {
      if (words[0]) register(words[0]);
    } else {
      for (const word of words) register(word);
    }
  });

  root.walkDecls((declaration) => {
    if (!['container', 'container-name'].includes(declaration.prop.toLowerCase())) return;
    declaration.value = transformValue(declaration.value, (word) => replacements.get(word) ?? word);
  });
  root.walkAtRules((atRule) => {
    if (atRule.name.toLowerCase() !== 'container') return;
    const parsed = valueParser(atRule.params);
    const firstWord = parsed.nodes.find((node) => node.type === 'word');
    if (firstWord) {
      assert(replacements.has(firstWord.value), `@container references an undeclared container: ${firstWord.value}`);
      firstWord.value = replacements.get(firstWord.value);
      atRule.params = parsed.toString();
    }
  });
  return replacements;
}

function replaceKeyframeWords(value, replacements) {
  const parsed = valueParser(value);
  parsed.walk((node) => {
    if (node.type === 'word' && replacements.has(node.value)) node.value = replacements.get(node.value);
  });
  return parsed.toString();
}

function namespaceKeyframes(root, scopeValue) {
  const replacements = new Map();
  root.walkAtRules((atRule) => {
    if (!/^(?:-webkit-)?keyframes$/iu.test(atRule.name)) return;
    const original = atRule.params.trim();
    assert(/^[-_a-z][-_a-z0-9]*$/iu.test(original), `Unsupported keyframe identifier: ${original}`);
    assert(!replacements.has(original), `Duplicate keyframe identifier: ${original}`);
    const replacement = `${scopeValue}-${original}`;
    replacements.set(original, replacement);
    atRule.params = replacement;
  });
  root.walkDecls((declaration) => {
    const property = declaration.prop.toLowerCase();
    if (
      ['animation', 'animation-name', '-webkit-animation', '-webkit-animation-name'].includes(property) ||
      declaration.prop.startsWith('--skui-animate-')
    ) {
      declaration.value = replaceKeyframeWords(declaration.value, replacements);
    }
  });
  return replacements;
}

function selectorHasExplicitScopeAttribute(selector) {
  let found = false;
  selector.walkAttributes((attribute) => {
    if (attribute.attribute.toLowerCase() === SCOPE_ATTRIBUTE) found = true;
  });
  return found;
}

function assertGeneratedScopePseudo(selector) {
  const scopePseudos = [];
  selector.walkPseudos((pseudo) => {
    if (pseudo.value.toLowerCase() === ':scope') scopePseudos.push(pseudo);
  });
  assert(scopePseudos.length <= 1, `Selector contains multiple :scope pseudos: ${selector}`);
  if (scopePseudos.length === 0) return { kind: 'descendant', base: selector.toString().trim() };

  const scopePseudo = scopePseudos[0];
  let carrier = scopePseudo;
  if (scopePseudo.parent?.type === 'selector' && scopePseudo.parent.parent?.type === 'pseudo') {
    carrier = scopePseudo.parent.parent;
    assert(carrier.value.toLowerCase() === ':where' && carrier.toString() === ':where(:scope)', `Selector contains unsupported :scope shape: ${selector}`);
  }
  assert(carrier.parent === selector, `Selector nests :scope outside its leading compound: ${selector}`);
  for (const node of selector.nodes) {
    if (node === carrier) break;
    assert(node.type !== 'combinator', `Selector nests :scope outside its leading compound: ${selector}`);
  }
  if (carrier === scopePseudo) {
    assert(selector.nodes.length === 1, `Bare :scope must be the complete selector: ${selector}`);
    return { kind: 'root' };
  }
  const unguarded = selector.clone();
  unguarded.walkPseudos((pseudo) => {
    if (pseudo.value.toLowerCase() === ':where' && pseudo.toString() === ':where(:scope)') pseudo.remove();
  });
  return { kind: 'self', base: unguarded.toString().trim() };
}

function insideNegation(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'pseudo' && parent.value.toLowerCase() === ':not') return true;
  }
  return false;
}

function valueSegments(value) {
  const segments = [[]];
  for (const node of valueParser(value).nodes) {
    if (node.type === 'div' && node.value === ',') segments.push([]);
    else if (node.type !== 'space' && node.type !== 'comment') segments.at(-1).push(node);
  }
  return segments;
}

function assertAnimationValue(value, { keyframes, animationVariables, allowVariable }) {
  for (const segment of valueSegments(value)) {
    assert(segment.length > 0, `Empty animation value segment is not accepted: ${value}`);
    const first = segment[0];
    if (first.type === 'word') {
      if (['none', 'initial', 'inherit', 'unset', 'revert', 'revert-layer'].includes(first.value.toLowerCase())) {
        assert(segment.length === 1, `Ambiguous animation shorthand is not accepted: ${value}`);
      } else {
        assert(keyframes.has(first.value), `Animation uses an unscoped or missing keyframe: ${first.value}`);
      }
      continue;
    }
    if (allowVariable && first.type === 'function' && first.value.toLowerCase() === 'var') {
      assert(!first.nodes.some((node) => node.type === 'div' && node.value === ','), `Animation variable fallbacks are not accepted: ${value}`);
      const variable = first.nodes.find((node) => node.type === 'word')?.value;
      assert(variable && animationVariables.has(variable), `Animation uses an unowned variable: ${variable ?? value}`);
      continue;
    }
    throw new Error(`Ambiguous animation shorthand is not accepted: ${value}`);
  }
}

function isAllowedExternalProperty(property) {
  return (
    property.startsWith('--spfx-ui-') ||
    RUNTIME_PROPERTIES.has(property) ||
    /^--skui-[a-f0-9]{16}-tw-sentinel$/u.test(property)
  );
}

function assertVariableClosure(root) {
  const declared = new Set();
  const referenced = new Set();
  root.walkDecls((declaration) => {
    if (declaration.prop.startsWith('--')) declared.add(declaration.prop);
    valueParser(declaration.value).walk((node) => {
      if (node.type !== 'function' || node.value.toLowerCase() !== 'var') return;
      const property = node.nodes.find((child) => child.type === 'word')?.value;
      assert(property?.startsWith('--'), `Invalid custom property reference: ${declaration.value}`);
      referenced.add(property);
    });
  });
  root.walkAtRules((atRule) => {
    valueParser(atRule.params).walk((node) => {
      if (node.type === 'word' && node.value.startsWith('--')) referenced.add(node.value);
    });
  });
  for (const property of referenced) {
    assert(declared.has(property) || isAllowedExternalProperty(property), `Undefined custom property reference: ${property}`);
  }
}

export function auditScopedTailwindCss({ css, scopeValue, candidates = [], allowedClasses = candidates }) {
  const root = postcss.parse(css, { from: undefined });
  const scope = scopeSelector(scopeValue);
  const boundary = scopeBoundaryParams(scopeValue);
  const emittedCandidates = new Set();
  const allowedClassSet = new Set(allowedClasses);
  const keyframes = new Set();
  const referencedKeyframes = new Set();
  const animationVariables = new Map();
  const containers = new Set();

  root.walkAtRules((atRule) => {
    const name = atRule.name.toLowerCase();
    assert(
      ['media', 'supports', 'container', 'scope', 'keyframes', '-webkit-keyframes'].includes(name),
      `Forbidden CSS at-rule remains: @${atRule.name}`
    );
    if (name === 'scope') assert(atRule.params === boundary, `CSS scope boundary differs: ${atRule.params}`);
    if (/^(?:-webkit-)?keyframes$/u.test(name)) {
      assert(atRule.params.startsWith(`${scopeValue}-`), `Unnamespaced keyframe remains: ${atRule.params}`);
      assert(!keyframes.has(atRule.params), `Duplicate scoped keyframe remains: ${atRule.params}`);
      keyframes.add(atRule.params);
    }
    if (name === 'container') {
      const firstWord = valueParser(atRule.params).nodes.find((node) => node.type === 'word')?.value;
      if (firstWord) {
        assert(firstWord.startsWith(`${scopeValue}-container-`), `Unnamespaced container remains: ${firstWord}`);
        containers.add(firstWord);
      }
    }
    transformValue(atRule.params, (word) => {
      assert(
        !['--tw', '--foreground', '--secondary', '--radius', '--radius-md', '--spacing'].includes(word),
        `Generic property reference remains: ${word}`
      );
      return word;
    });
  });

  root.walkRules((rule) => {
    if (insideKeyframes(rule)) return;
    const scopeBoundaries = [];
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && parent.name.toLowerCase() === 'scope') {
        scopeBoundaries.push(parent);
      }
    }
    assert(scopeBoundaries.length === 1, `Selector must have exactly one nested-scope boundary: ${rule.selector}`);
    assert(scopeBoundaries[0].params === boundary, `CSS scope boundary differs: ${scopeBoundaries[0].params}`);
    const parsed = selectorParser().astSync(rule.selector);
    const descendantSelectors = new Set();
    const selfSelectors = new Set();
    for (const selector of parsed.nodes) {
      assert(!selectorHasExplicitScopeAttribute(selector), `Selector redundantly prefixes ${scope}: ${selector}`);
      const scopeShape = assertGeneratedScopePseudo(selector);
      if (scopeShape.kind === 'descendant') descendantSelectors.add(scopeShape.base);
      if (scopeShape.kind === 'self') selfSelectors.add(scopeShape.base);
      selector.walkPseudos((pseudo) => {
        assert(![':root', ':host'].includes(pseudo.value.toLowerCase()), `Page root selector remains: ${selector}`);
      });
      selector.walkTags((tag) => {
        assert(!['html', 'body'].includes(tag.value.toLowerCase()), `Page selector remains: ${selector}`);
      });
      selector.walkClasses((className) => {
        assert(allowedClassSet.has(className.value), `Unexpected emitted CSS class: ${className.value}`);
        if (!insideNegation(className)) emittedCandidates.add(className.value);
      });
    }
    for (const selector of descendantSelectors) {
      assert(selfSelectors.has(selector), `Selector lacks its :where(:scope) self variant: ${selector}`);
    }
    for (const selector of selfSelectors) {
      assert(descendantSelectors.has(selector), `Selector lacks its descendant variant: ${selector}`);
    }
  });

  root.walkDecls((declaration) => {
    if (declaration.prop.startsWith('--skui-animate-')) {
      const values = animationVariables.get(declaration.prop) ?? [];
      values.push(declaration.value);
      animationVariables.set(declaration.prop, values);
    }
    if (['container', 'container-name'].includes(declaration.prop.toLowerCase())) {
      valueParser(declaration.value).walk((node) => {
        if (node.type !== 'word' || ['none', 'normal', 'inline-size', 'size'].includes(node.value.toLowerCase())) return;
        assert(node.value.startsWith(`${scopeValue}-container-`), `Unnamespaced container declaration: ${node.value}`);
        containers.add(node.value);
      });
    }
  });
  for (const values of animationVariables.values()) {
    for (const value of values) assertAnimationValue(value, { keyframes, animationVariables, allowVariable: false });
  }

  root.walkDecls((declaration) => {
    assert(!declaration.prop.includes('\\'), `Escaped declaration property is not accepted: ${declaration.prop}`);
    assert(!['--tw', '--foreground', '--secondary', '--radius', '--radius-md', '--spacing'].includes(declaration.prop), `Generic property remains: ${declaration.prop}`);
    transformValue(declaration.value, (word) => {
      assert(!['--tw', '--foreground', '--secondary', '--radius', '--radius-md', '--spacing'].includes(word), `Generic property reference remains: ${word}`);
      return word;
    });
    if (['animation', 'animation-name', '-webkit-animation', '-webkit-animation-name'].includes(declaration.prop.toLowerCase())) {
      assertAnimationValue(declaration.value, { keyframes, animationVariables, allowVariable: true });
    }
    valueParser(declaration.value).walk((node) => {
      if (node.type === 'word' && node.value.startsWith(`${scopeValue}-`)) referencedKeyframes.add(node.value);
    });
  });
  assertVariableClosure(root);
  assert(!css.includes('\r'), 'Generated CSS contains non-canonical line endings');
  assert(!/\\/u.test(css.match(/(?:url|image-set)\s*\(/giu)?.join('') ?? ''), 'Generated CSS retains an escaped asset function');
  assert(!/\b(?:https?|file):/iu.test(css), 'Generated CSS retains an external or local URL');

  for (const reference of referencedKeyframes) {
    if (reference.includes('-container-') || reference.includes('-tw-')) continue;
    assert(keyframes.has(reference), `Animation references a missing scoped keyframe: ${reference}`);
  }
  for (const keyframe of keyframes) {
    assert(referencedKeyframes.has(keyframe), `Scoped keyframe is not referenced: ${keyframe}`);
  }
  for (const candidate of candidates) {
    assert(emittedCandidates.has(candidate), `Tailwind candidate did not emit a positive selector: ${candidate}`);
  }
  return { candidateCount: candidates.length, keyframeCount: keyframes.size, containerCount: containers.size };
}

export function scopeTailwindCss({ rawCss, scopeValue, candidates = [], allowedClasses = candidates }) {
  const root = postcss.parse(rawCss.replace(/\r\n?/gu, '\n'), { from: undefined });
  root.walkComments((comment) => comment.remove());
  root.walkAtRules((atRule) => {
    assert(atRule.name.toLowerCase() !== 'scope', 'Source CSS must not own an @scope boundary');
  });
  const fallbackPropertyCount = removeAndFlattenGlobalAtRules(root);

  const scope = scopeSelector(scopeValue);
  const scopedRules = [];
  root.walkRules((rule) => {
    if (insideKeyframes(rule)) return;
    rule.selector = selectorParser((selectors) => {
      for (const selector of [...selectors.nodes]) {
        const selfSelector = scopeOneSelector(selector);
        if (selfSelector) selectors.insertAfter(selector, selfSelector);
      }
      const seen = new Set();
      for (const selector of [...selectors.nodes]) {
        const serialized = selector.toString();
        if (seen.has(serialized)) selector.remove();
        else seen.add(serialized);
      }
    }).processSync(rule.selector);
    scopedRules.push(rule);
  });
  for (const rule of scopedRules) {
    const boundary = postcss.atRule({ name: 'scope', params: scopeBoundaryParams(scopeValue) });
    rule.replaceWith(boundary);
    boundary.append(rule);
  }
  namespaceTailwindProperties(root, scopeValue);
  rewriteSemanticProperties(root);
  const containers = namespaceContainers(root, scopeValue);
  const keyframes = namespaceKeyframes(root, scopeValue);
  const css = `${root.toString().trim()}\n`;
  const audit = auditScopedTailwindCss({ css, scopeValue, candidates, allowedClasses });
  assert(audit.containerCount === containers.size, 'Container namespace inventory differs');
  return { css, keyframes, fallbackPropertyCount, ...audit };
}
