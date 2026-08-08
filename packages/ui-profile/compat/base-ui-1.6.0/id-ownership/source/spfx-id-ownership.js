'use strict';

Object.defineProperty(exports, '__esModule', { value: true });
exports.BaseUiIdOwnershipProvider = BaseUiIdOwnershipProvider;
exports.useBaseUiIdRef = useBaseUiIdRef;
exports.useBaseUiKeyedChildId = useBaseUiKeyedChildId;
exports.useBaseUiOwnedRootId = useBaseUiOwnedRootId;
exports.useBaseUiRepeatedChildId = useBaseUiRepeatedChildId;

const React = require('react');

const BaseUiIdOwnershipContext = React.createContext(undefined);

function BaseUiIdOwnershipProvider(props) {
  const { deriveElementId, children } = props;
  if (typeof deriveElementId !== 'function') {
    throw new Error('Base UI ID ownership requires a host deriveElementId function');
  }
  const value = React.useMemo(() => ({ deriveElementId }), [deriveElementId]);
  return React.createElement(BaseUiIdOwnershipContext.Provider, { value }, children);
}

function useBaseUiOwnedRootId(rootId) {
  const { deriveElementId } = useBaseUiIdOwnership();
  const validatedRootId = validatedIdPart(rootId, 'root ID');
  React.useMemo(
    () => validatedDerivedId(deriveElementId(validatedRootId, 'base-ui:root-ownership-probe')),
    [deriveElementId, validatedRootId]
  );
  return validatedRootId;
}

function useBaseUiKeyedChildId(parentOwnedId, semanticPart) {
  const { deriveElementId } = useBaseUiIdOwnership();
  const parent = validatedIdPart(parentOwnedId, 'keyed child parent ID');
  const semantic = validatedIdPart(semanticPart, 'keyed child semantic part');
  return React.useMemo(
    () => validatedDerivedId(deriveElementId(parent, `base-ui:keyed:${encodeIdPart(semantic)}`)),
    [deriveElementId, parent, semantic]
  );
}

function useBaseUiRepeatedChildId(parentOwnedId, collectionKey, stableItemKey) {
  const { deriveElementId } = useBaseUiIdOwnership();
  const parent = validatedIdPart(parentOwnedId, 'repeated child parent ID');
  const collection = validatedIdPart(collectionKey, 'repeated child collection key');
  const item = validatedIdPart(stableItemKey, 'repeated child stable item key');
  return React.useMemo(
    () => validatedDerivedId(deriveElementId(parent, `base-ui:repeated:${encodeIdPart(collection)}:${encodeIdPart(item)}`)),
    [collection, deriveElementId, item, parent]
  );
}

function useBaseUiIdRef(parentOwnedId, targetSemanticPart) {
  return useBaseUiKeyedChildId(parentOwnedId, targetSemanticPart);
}

function useBaseUiIdOwnership() {
  const value = React.useContext(BaseUiIdOwnershipContext);
  if (!value) {
    throw new Error('Base UI ID ownership hooks must render inside BaseUiIdOwnershipProvider');
  }
  return value;
}

function validatedIdPart(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`Base UI ${label} must be a non-empty, trimmed string without control characters`);
  }
  const containsControlCharacter = Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || codePoint === 127;
  });
  if (value.length === 0 || value.trim() !== value || containsControlCharacter) {
    throw new Error(`Base UI ${label} must be a non-empty, trimmed string without control characters`);
  }
  return value;
}

function validatedDerivedId(value) {
  return validatedIdPart(value, 'host-derived ID');
}

function encodeIdPart(value) {
  return Array.from(value, (character) => character.codePointAt(0).toString(16)).join('-');
}
