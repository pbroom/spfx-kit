import * as React from 'react';

export interface BaseUiIdOwnershipProviderProps {
  deriveElementId(parentOwnedId: string, semanticPart: string): string;
  children?: React.ReactNode;
}

export declare function BaseUiIdOwnershipProvider(props: BaseUiIdOwnershipProviderProps): React.ReactElement;
export declare function useBaseUiOwnedRootId(rootId: string | undefined): string;
export declare function useBaseUiKeyedChildId(parentOwnedId: string | undefined, semanticPart: string): string;
export declare function useBaseUiRepeatedChildId(
  parentOwnedId: string | undefined,
  collectionKey: string,
  stableItemKey: string
): string;
export declare function useBaseUiIdRef(parentOwnedId: string | undefined, targetSemanticPart: string): string;
