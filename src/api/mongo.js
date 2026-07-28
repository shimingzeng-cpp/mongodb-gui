const { MongoClient } = require('mongodb');

let client = null;
let currentDb = null;

async function connect(uri = 'mongodb://localhost:27017') {
  if (client) {
    await client.close();
  }
  client = new MongoClient(uri, {
    maxPoolSize: 5,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });
  await client.connect();
  return { connected: true };
}

async function disconnect() {
  if (client) {
    await client.close();
    client = null;
    currentDb = null;
  }
}

async function listDatabases() {
  if (!client) throw new Error('未连接');
  const adminDb = client.db().admin();
  const result = await adminDb.listDatabases();
  return result.databases.map(db => ({ name: db.name, sizeOnDisk: db.sizeOnDisk }));
}

async function listCollections(dbName) {
  if (!client) throw new Error('未连接');
  const db = client.db(dbName);
  const collections = await db.listCollections().toArray();
  return collections.map(c => ({ name: c.name, type: c.type }));
}

async function findDocuments(dbName, collectionName, filter = {}, options = {}) {
  if (!client) throw new Error('未连接');
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

  // 将 ObjectId 等 BSON 类型转为字符串
  const serialized = JSON.parse(JSON.stringify(docs, (key, value) => {
    if (value && value._bsontype === 'ObjectId') return value.toString();
    if (value && typeof value === 'object' && value._bsontype) return value.toString();
    return value;
  }));

  return { docs: serialized, total };
}

async function insertDocument(dbName, collectionName, doc) {
  if (!client) throw new Error('未连接');
  const db = client.db(dbName);
  const result = await db.collection(collectionName).insertOne(doc);
  return { insertedId: result.insertedId.toString() };
}

async function updateDocument(dbName, collectionName, filter, update) {
  if (!client) throw new Error('未连接');
  const db = client.db(dbName);
  const { ObjectId } = require('mongodb');
  // 转换字符串 _id 为 ObjectId
  if (filter._id && typeof filter._id === 'string') {
    filter._id = new ObjectId(filter._id);
  }
  const result = await db.collection(collectionName).updateOne(filter, { $set: update });
  return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
}

async function deleteDocument(dbName, collectionName, filter) {
  if (!client) throw new Error('未连接');
  const db = client.db(dbName);
  const { ObjectId } = require('mongodb');
  if (filter._id && typeof filter._id === 'string') {
    filter._id = new ObjectId(filter._id);
  }
  const result = await db.collection(collectionName).deleteOne(filter);
  return { deletedCount: result.deletedCount };
}

async function createCollection(dbName, collectionName) {
  if (!client) throw new Error('未连接');
  const db = client.db(dbName);
  await db.createCollection(collectionName);
  return { created: true };
}

async function dropCollection(dbName, collectionName) {
  if (!client) throw new Error('未连接');
  const db = client.db(dbName);
  await db.collection(collectionName).drop();
  return { dropped: true };
}

async function executeShell(dbName, command) {
  if (!client) throw new Error('未连接');
  const db = client.db(dbName);

  // 创建 Proxy，让 db.collectionName 自动映射到 db.collection('collectionName')
  const shellDb = new Proxy(db, {
    get(target, prop) {
      // 自定义方法
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
      // 将未知属性当作集合名
      return target.collection(prop);
    }
  });

  try {
    // 用 new Function 执行用户命令，传入 shellDb 作为 db
    const fn = new Function('db', 'ObjectId', `
      try {
        const __result = ${command};
        return __result;
      } catch(e) {
        throw e;
      }
    `);

    let result = await fn(shellDb, require('mongodb').ObjectId);

    // 如果是 Cursor（find 返回的），自动转数组
    if (result && typeof result.toArray === 'function') {
      result = await result.toArray();
    }
    // 如果结果是 AggregationCursor
    if (result && typeof result.hasNext === 'function') {
      result = await result.toArray();
    }

    // 序列化 BSON 类型
    const serialized = JSON.parse(JSON.stringify(result, (key, value) => {
      if (value && value._bsontype === 'ObjectId') return value.toString();
      if (value && typeof value === 'object' && value._bsontype) return value.toString();
      return value;
    }));

    return { success: true, data: serialized };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  connect,
  disconnect,
  listDatabases,
  listCollections,
  findDocuments,
  insertDocument,
  updateDocument,
  deleteDocument,
  createCollection,
  dropCollection,
  executeShell,
};