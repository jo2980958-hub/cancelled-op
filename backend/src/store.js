// One DynamoDB item per case (pk = CASE#<id>); optimistic locking on `version`.
// A memory store with identical semantics is used by the tests and the local dev server.
export class ConflictError extends Error { constructor() { super('version conflict'); this.name = 'ConflictError'; } }

export function memoryStore() {
  const m = new Map(); const logs = [];
  return {
    kind: 'memory',
    async get(id) { const v = m.get(id); return v ? structuredClone(v) : null; },
    async list() { return [...m.values()].map((v) => structuredClone(v)); },
    async put(c, { create = false } = {}) {
      const cur = m.get(c.id);
      if (create && cur) throw new ConflictError();
      if (!create && cur && cur.version !== c.version) throw new ConflictError();
      const next = structuredClone(c); next.version = (cur?.version || 0) + 1; m.set(c.id, next);
      return structuredClone(next);
    },
    async del(id) { m.delete(id); },
    async putLog(e) { logs.push(structuredClone(e)); },
    async getLogs() { return structuredClone(logs); },
  };
}

export async function dynamoStore(table = process.env.TABLE_NAME || 'cancelled-op') {
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }), { marshallOptions: { removeUndefinedValues: true } });
  const key = (id) => `CASE#${id}`;
  return {
    kind: 'dynamodb',
    async get(id) { const r = await doc.send(new GetCommand({ TableName: table, Key: { pk: key(id) } })); return r.Item?.doc || null; },
    async list() {
      const out = []; let ExclusiveStartKey;
      do { const r = await doc.send(new ScanCommand({ TableName: table, ExclusiveStartKey })); out.push(...r.Items.filter((i) => i.pk.startsWith('CASE#')).map((i) => i.doc)); ExclusiveStartKey = r.LastEvaluatedKey; } while (ExclusiveStartKey);
      return out;
    },
    async put(c, { create = false } = {}) {
      const next = { ...c, version: (c.version || 0) + 1 };
      try {
        await doc.send(new PutCommand({
          TableName: table, Item: { pk: key(c.id), doc: next, updatedAt: new Date().toISOString() },
          ...(create ? { ConditionExpression: 'attribute_not_exists(pk)' } : { ConditionExpression: 'attribute_not_exists(pk) OR #d.#v = :v', ExpressionAttributeNames: { '#d': 'doc', '#v': 'version' }, ExpressionAttributeValues: { ':v': c.version || 0 } }),
        }));
      } catch (e) { if (e.name === 'ConditionalCheckFailedException') throw new ConflictError(); throw e; }
      return next;
    },
    async del(id) { await doc.send(new DeleteCommand({ TableName: table, Key: { pk: key(id) } })); },
    async putLog(e) { await doc.send(new PutCommand({ TableName: table, Item: { pk: `LOG#${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, entry: e, ttl: Math.floor(Date.now() / 1000) + 14 * 86400 } })); },
    async getLogs() { const out = []; let k; do { const r = await doc.send(new ScanCommand({ TableName: table, ExclusiveStartKey: k })); out.push(...r.Items.filter((i) => i.pk.startsWith('LOG#')).map((i) => i.entry)); k = r.LastEvaluatedKey; } while (k); return out; },
  };
}
