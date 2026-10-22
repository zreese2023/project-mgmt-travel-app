import { vi } from 'vitest';
import type { Queryable } from '../../src/lib/db.js';

interface MockResult {
  rows: readonly object[];
  rowCount: number;
  command: string;
  oid: number;
  fields: never[];
}

/** A Queryable that returns canned rows in order, for unit tests that must not touch a DB. */
export function mockDb(...responses: ReadonlyArray<readonly object[]>) {
  const queue = [...responses];
  const query = vi.fn<(...args: unknown[]) => Promise<MockResult>>(async () => {
    const rows = queue.shift() ?? [];
    return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
  });
  return { db: { query } as unknown as Queryable, query };
}
