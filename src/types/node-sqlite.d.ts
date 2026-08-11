declare module "node:sqlite" {
  export type SQLInputValue = null | number | bigint | string | Uint8Array;

  export type StatementResultingChanges = {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };

  export class StatementSync {
    all(...anonymousParameters: SQLInputValue[]): Record<string, unknown>[];
    get(...anonymousParameters: SQLInputValue[]): Record<string, unknown> | undefined;
    run(...anonymousParameters: SQLInputValue[]): StatementResultingChanges;
  }

  export class DatabaseSync {
    constructor(location: string);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
