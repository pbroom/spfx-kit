declare module '@babel/standalone' {
  export interface BabelFileResult {
    code?: string;
  }

  export function transform(code: string, options: Record<string, unknown>): BabelFileResult;
}
