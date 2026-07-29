const { MongoClient } = require('mongodb');

// 多连接管理：Map<connectionId, { client, uri }>
const connections = new Map();
const ACTIVE_KEY = '__active__';

function getClient(connectionId = ACTIVE_KEY) {
  const conn = connections.get(connectionId);
  if (!conn) throw new Error('未连接');
  return conn.client;
}

// ========== 连接管理 ==========

async function connect(connectionId = ACTIVE_KEY, uri = 'mongodb://localhost:27017') {
  // 关闭已有连接
  if (connections.has(connectionId)) {
    await connections.get(connectionId).client.close();
  }
  const client = new MongoClient(uri, {
    maxPoolSize: 5,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });
  await client.connect();
  connections.set(connectionId, { client, uri });
  return { connected: true, connectionId };
}

async function disconnect(connectionId = ACTIVE_KEY) {
  if (connections.has(connectionId)) {
    await connections.get(connectionId).client.close();
    connections.delete(connectionId);
  }
}

async function disconnectAll() {
  for (const [id] of connections) {
    await disconnect(id);
  }
}

/** 测试连接（不保存，用完即关） */
async function testConnection(uri) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });
  await client.connect();
  await client.close();
  return { success: true };
}

// ========== 数据库/集合操作 ==========

async function listDatabases(connectionId = ACTIVE_KEY) {
  const client = getClient(connectionId);
  const adminDb = client.db().admin();
  const result = await adminDb.listDatabases();
  return result.databases.map(db => ({ name: db.name, sizeOnDisk: db.sizeOnDisk }));
}

async function listCollections(connectionId = ACTIVE_KEY, dbName) {
  const client = getClient(connectionId);
  const db = client.db(dbName);
  // 使用 nameOnly: true 确保包含系统集合（如 system.users, system.roles 等）
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  return collections.map(c => ({ name: c.name, type: c.type }));
}

async function findDocuments(connectionId = ACTIVE_KEY, dbName, collectionName, filter = {}, options = {}) {
  const client = getClient(connectionId);
  const db = client.db(dbName);
  const { skip = 0, limit = 50, sort = { _id: -1 } } = options;

  const cursor = db
    .collection(collectionName)
    .find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit);

  const docs = await cursor.toArray();
  const total = await db.collection(collectionName).countDocuments(filter);

  // 将 ObjectId、Date 等 BSON 类型转为可读字符串
  const serialized = JSON.parse(JSON.stringify(docs, (key, value) => {
    if (value && typeof value === 'object' && value._bsontype) {
      if (value._bsontype === 'ObjectId') return value.toString();
      if (value._bsontype === 'Date') return value.toISOString();
      return value.toString();
    }
    // 处理 MongoDB 驱动返回的 EJSON 格式 {$date: "..."}
    if (value && typeof value === 'object' && value.$date) {
      return new Date(value.$date).toISOString();
    }
    return value;
  }));

  return { docs: serialized, total };
}

async function insertDocument(connectionId = ACTIVE_KEY, dbName, collectionName, doc) {
  const client = getClient(connectionId);
  const db = client.db(dbName);
  const result = await db.collection(collectionName).insertOne(doc);
  return { insertedId: result.insertedId.toString() };
}

async function updateDocument(connectionId = ACTIVE_KEY, dbName, collectionName, filter, update) {
  const client = getClient(connectionId);
  const db = client.db(dbName);
  const { ObjectId } = require('mongodb');
  if (filter._id && typeof filter._id === 'string') {
    filter._id = new ObjectId(filter._id);
  }
  const result = await db.collection(collectionName).updateOne(filter, { $set: update });
  return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
}

async function deleteDocument(connectionId = ACTIVE_KEY, dbName, collectionName, filter) {
  const client = getClient(connectionId);
  const db = client.db(dbName);
  const { ObjectId } = require('mongodb');
  if (filter._id && typeof filter._id === 'string') {
    filter._id = new ObjectId(filter._id);
  }
  const result = await db.collection(collectionName).deleteOne(filter);
  return { deletedCount: result.deletedCount };
}

async function createCollection(connectionId = ACTIVE_KEY, dbName, collectionName) {
  const client = getClient(connectionId);
  const db = client.db(dbName);
  await db.createCollection(collectionName);
  return { created: true };
}

async function dropCollection(connectionId = ACTIVE_KEY, dbName, collectionName) {
  const client = getClient(connectionId);
  const db = client.db(dbName);
  await db.collection(collectionName).drop();
  return { dropped: true };
}

async function dropDatabase(connectionId = ACTIVE_KEY, dbName) {
  const client = getClient(connectionId);
  const db = client.db(dbName);
  await db.dropDatabase();
  return { dropped: true };
}

// ========== Schema ==========

async function getCollectionSchema(connectionId = ACTIVE_KEY, dbName, collectionName) {
  const client = getClient(connectionId);
  const db = client.db(dbName);
  const info = await db.listCollections({ name: collectionName }).toArray();
  if (info.length === 0) throw new Error('集合不存在');
  const options = info[0].options || {};
  return {
    validator: options.validator || null,
    validationLevel: options.validationLevel || 'strict',
    validationAction: options.validationAction || 'error',
  };
}

async function setCollectionSchema(connectionId = ACTIVE_KEY, dbName, collectionName, validator) {
  const client = getClient(connectionId);
  const db = client.db(dbName);
  const cmd = {
    collMod: collectionName,
    validator: validator || {},
    validationLevel: 'strict',
    validationAction: 'error',
  };
  await db.command(cmd);
  return { success: true };
}

// ========== 索引 ==========

async function listIndexes(connectionId = ACTIVE_KEY, dbName, collectionName) {
  const client = getClient(connectionId);
  const db = client.db(dbName);
  const indexes = await db.collection(collectionName).indexes();
  return indexes.map(idx => ({
    name: idx.name,
    key: idx.key,
    unique: !!idx.unique,
    sparse: !!idx.sparse,
    background: !!idx.background,
    v: idx.v,
  }));
}

async function createIndex(connectionId = ACTIVE_KEY, dbName, collectionName, keys, options = {}) {
  const client = getClient(connectionId);
  const db = client.db(dbName);
  const result = await db.collection(collectionName).createIndex(keys, options);
  return { indexName: result };
}

async function dropIndex(connectionId = ACTIVE_KEY, dbName, collectionName, indexName) {
  const client = getClient(connectionId);
  const db = client.db(dbName);
  await db.collection(collectionName).dropIndex(indexName);
  return { success: true };
}

// ========== 导出 / 导入 ==========

async function exportCollection(connectionId = ACTIVE_KEY, dbName, collectionName, format = 'json') {
  const client = getClient(connectionId);
  const db = client.db(dbName);
  const docs = await db.collection(collectionName).find({}).toArray();
  const serialized = JSON.parse(JSON.stringify(docs, (key, value) => {
    if (value && typeof value === 'object' && value._bsontype) {
      if (value._bsontype === 'ObjectId') return value.toString();
      if (value._bsontype === 'Date') return value.toISOString();
      return value.toString();
    }
    return value;
  }));

  if (format === 'csv' && serialized.length > 0) {
    const keys = Object.keys(serialized[0]);
    const csvRows = [keys.join(',')];
    serialized.forEach(doc => {
      csvRows.push(keys.map(k => {
        const v = doc[k];
        if (v === null || v === undefined) return '';
        const str = String(v);
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(','));
    });
    return { data: csvRows.join('\n'), format: 'csv' };
  }

  return { data: JSON.stringify(serialized, null, 2), format: 'json' };
}

async function importCollection(connectionId = ACTIVE_KEY, dbName, collectionName, docs, clearFirst = false) {
  const client = getClient(connectionId);
  if (!Array.isArray(docs)) docs = [docs];
  const db = client.db(dbName);
  const { ObjectId } = require('mongodb');
  const collection = db.collection(collectionName);

  if (clearFirst) {
    await collection.deleteMany({});
  }

  let inserted = 0, replaced = 0;

  for (const doc of docs) {
    if (doc._id) {
      if (typeof doc._id === 'string' && /^[a-f\d]{24}$/i.test(doc._id)) {
        doc._id = new ObjectId(doc._id);
      } else if (doc._id === '' || doc._id === '_id') {
        delete doc._id;
      }
    }
    if (doc._id) {
      const existing = await collection.findOne({ _id: doc._id });
      if (existing) {
        await collection.replaceOne({ _id: doc._id }, doc);
        replaced++;
      } else {
        await collection.insertOne(doc);
        inserted++;
      }
    } else {
      await collection.insertOne(doc);
      inserted++;
    }
  }

  return { insertedCount: inserted, replacedCount: replaced };
}

// ========== 同步（跨连接/跨数据库） ==========

/**
 * 同步集合结构（索引 + schema 验证器）
 */
async function syncCollectionStructure(sourceConnId, sourceDb, sourceCollection, targetConnId, targetDb, targetCollection) {
  const sourceClient = getClient(sourceConnId);
  const targetClient = getClient(targetConnId);

  const result = { indexesCreated: 0, indexesDropped: 0, schemaApplied: false };

  // 1. 获取源集合索引
  const sourceIndexes = await sourceClient.db(sourceDb).collection(sourceCollection).indexes();

  // 2. 获取目标集合现有索引，删除非 _id_ 索引
  const targetColl = targetClient.db(targetDb).collection(targetCollection);
  const targetIndexes = await targetColl.indexes();
  for (const idx of targetIndexes) {
    if (idx.name !== '_id_') {
      try {
        await targetColl.dropIndex(idx.name);
        result.indexesDropped++;
      } catch (e) {
        // 忽略删除失败
      }
    }
  }

  // 3. 在目标集合上创建源集合的索引
  for (const idx of sourceIndexes) {
    if (idx.name !== '_id_') {
      const { key, name, unique, sparse, background, v, ...opts } = idx;
      try {
        await targetColl.createIndex(key, { name, unique, sparse, ...opts });
        result.indexesCreated++;
      } catch (e) {
        // 忽略创建失败
      }
    }
  }

  // 4. 复制 schema 验证器
  try {
    const sourceInfo = await sourceClient.db(sourceDb).listCollections({ name: sourceCollection }).toArray();
    const sourceOptions = sourceInfo[0]?.options || {};
    if (sourceOptions.validator) {
      await targetClient.db(targetDb).command({
        collMod: targetCollection,
        validator: sourceOptions.validator,
        validationLevel: sourceOptions.validationLevel || 'strict',
        validationAction: sourceOptions.validationAction || 'error',
      });
      result.schemaApplied = true;
    }
  } catch (e) {
    // schema 复制失败不影响整体结果
  }

  return result;
}

/**
 * 同步集合数据（文档复制）
 */
async function syncCollectionData(sourceConnId, sourceDb, sourceCollection, targetConnId, targetDb, targetCollection, options = {}) {
  const { dataMode = 'upsert', batchSize = 1000, onProgress = null } = options;
  const sourceClient = getClient(sourceConnId);
  const targetClient = getClient(targetConnId);
  const { ObjectId } = require('mongodb');

  const sourceColl = sourceClient.db(sourceDb).collection(sourceCollection);
  const targetColl = targetClient.db(targetDb).collection(targetCollection);

  // 确保目标集合存在
  const cols = await targetClient.db(targetDb).listCollections({ name: targetCollection }).toArray();
  if (cols.length === 0) {
    await targetClient.db(targetDb).createCollection(targetCollection);
  }

  const total = await sourceColl.countDocuments();
  if (onProgress) onProgress({ total, current: 0, status: 'reading' });

  let inserted = 0, replaced = 0, skipped = 0;
  const cursor = sourceColl.find({}).batchSize(batchSize);
  let batch = [];
  let count = 0;

  for await (const doc of cursor) {
    batch.push(doc);
    count++;

    if (batch.length >= batchSize) {
      const r = await writeBatch(targetColl, batch, dataMode);
      inserted += r.inserted; replaced += r.replaced; skipped += r.skipped;
      if (onProgress) onProgress({ total, current: count, status: 'syncing' });
      batch = [];
    }
  }

  if (batch.length > 0) {
    const r = await writeBatch(targetColl, batch, dataMode);
    inserted += r.inserted; replaced += r.replaced; skipped += r.skipped;
  }

  if (onProgress) onProgress({ total, current: total, status: 'done' });

  return { total, inserted, replaced, skipped };
}

async function writeBatch(collection, docs, dataMode) {
  const { ObjectId } = require('mongodb');
  let inserted = 0, replaced = 0, skipped = 0;

  for (const doc of docs) {
    if (doc._id && typeof doc._id === 'string' && /^[a-f\d]{24}$/i.test(doc._id)) {
      doc._id = new ObjectId(doc._id);
    }

    if (doc._id) {
      const existing = await collection.findOne({ _id: doc._id });
      if (existing) {
        if (dataMode === 'upsert') {
          await collection.replaceOne({ _id: doc._id }, doc);
          replaced++;
        } else if (dataMode === 'replace') {
          await collection.deleteOne({ _id: doc._id });
          await collection.insertOne(doc);
          replaced++;
        } else {
          // append 模式：跳过已有文档
          skipped++;
        }
      } else {
        await collection.insertOne(doc);
        inserted++;
      }
    } else {
      await collection.insertOne(doc);
      inserted++;
    }
  }

  return { inserted, replaced, skipped };
}

// ========== Shell ==========

async function executeShell(connectionId = ACTIVE_KEY, dbName, command) {
  const client = getClient(connectionId);
  const db = client.db(dbName);

  const shellDb = new Proxy(db, {
    get(target, prop) {
      if (prop === 'getCollectionNames') {
        return async () => {
          const cols = await target.listCollections().toArray();
          return cols.map(c => c.name);
        };
      }
      if (prop === 'getCollectionInfos') {
        return async () => {
          return await target.listCollections().toArray();
        };
      }
      if (prop in target && typeof target[prop] === 'function') {
        return target[prop].bind(target);
      }
      if (prop in target) return target[prop];
      return target.collection(prop);
    }
  });

  try {
    const fn = new Function('db', 'ObjectId', `
      try {
        const __result = ${command};
        return __result;
      } catch(e) {
        throw e;
      }
    `);

    let result = await fn(shellDb, require('mongodb').ObjectId);

    if (result && typeof result.toArray === 'function') {
      result = await result.toArray();
    }
    if (result && typeof result.hasNext === 'function') {
      result = await result.toArray();
    }

    const serialized = JSON.parse(JSON.stringify(result, (key, value) => {
      if (value && typeof value === 'object' && value._bsontype) {
        if (value._bsontype === 'ObjectId') return value.toString();
        if (value._bsontype === 'Date') return value.toISOString();
        return value.toString();
      }
      if (value && typeof value === 'object' && value.$date) {
        return new Date(value.$date).toISOString();
      }
      return value;
    }));

    return { success: true, data: serialized };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  // 连接管理
  connect,
  disconnect,
  disconnectAll,
  testConnection,
  getClient,

  // 数据库/集合操作
  listDatabases,
  listCollections,
  findDocuments,
  insertDocument,
  updateDocument,
  deleteDocument,
  createCollection,
  dropCollection,
  dropDatabase,

  // Schema
  getCollectionSchema,
  setCollectionSchema,

  // 索引
  listIndexes,
  createIndex,
  dropIndex,

  // 导出/导入
  exportCollection,
  importCollection,

  // 同步
  syncCollectionStructure,
  syncCollectionData,

  // Shell
  executeShell,
};