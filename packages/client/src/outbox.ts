/** Outbox: hàng đợi mutation chưa được host xác nhận, lưu IndexedDB để chịu mất mạng. */
import Dexie, { type Table } from 'dexie';
import type { Mutation } from '@cookafeast/core';

interface OutboxRow {
  clientMutationId: string;
  mutation: Mutation;
  createdAt: number;
}

class OutboxDB extends Dexie {
  mutations!: Table<OutboxRow, string>;
  constructor() {
    super('cookafeast-outbox');
    this.version(1).stores({ mutations: 'clientMutationId, createdAt' });
  }
}

const db = new OutboxDB();

export const outbox = {
  add: (m: Mutation) => db.mutations.put({ clientMutationId: m.clientMutationId, mutation: m, createdAt: Date.now() }),
  remove: (id: string) => db.mutations.delete(id),
  all: () => db.mutations.orderBy('createdAt').toArray(),
  count: () => db.mutations.count(),
};
