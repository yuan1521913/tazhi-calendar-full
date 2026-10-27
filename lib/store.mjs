import crypto from 'node:crypto';
import pg from 'pg';

const memory = new Map();
let cloudbaseAppPromise = null;

const cloudbaseConfigured = () => Boolean(process.env.TCB_ENV_ID || process.env.SCF_NAMESPACE || process.env.TCB_SERVICE || process.env.TENCENTCLOUD_RUNENV);

const cloudbaseApp = async () => {
  if (!cloudbaseAppPromise) {
    cloudbaseAppPromise = (async () => {
      const mod = await import('@cloudbase/node-sdk');
      const cloudbase = mod.default;
      const config = { env: process.env.TCB_ENV_ID || cloudbase.SYMBOL_CURRENT_ENV };
      if (process.env.CLOUDBASE_APIKEY) config.accessKey = process.env.CLOUDBASE_APIKEY;
      const app = cloudbase.init(config);
      return app;
    })();
  }
  return cloudbaseAppPromise;
};

let pgPoolPromise = null;
const pgConfigured = () => Boolean(process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE);

const pgPool = () => {
  if (!pgPoolPromise) {
    const { Pool } = pg;
    pgPoolPromise = new Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
      max: Number(process.env.PGPOOL_MAX || 5),
      connectionTimeoutMillis: Number(process.env.PGCONNECT_TIMEOUT || 5000),
      idleTimeoutMillis: 30_000
    });
  }
  return pgPoolPromise;
};

const TABLE_NAMES = {
  'orders': 'tazhi_orders',
  'unlock-codes': 'tazhi_unlock_codes',
  'unlock-sessions': 'tazhi_unlock_sessions',
  'rate-limits': 'tazhi_rate_limits',
  'comments': 'tazhi_comments'
};

class RdbStore {
  constructor(name) {
    this.name = name;
    this.table = TABLE_NAMES[name] || `tazhi_${String(name).replace(/-/g, '_')}`;
  }

  async db() {
    const app = await cloudbaseApp();
    return app.rdb();
  }

  parseValue(value) {
    if (value == null) return null;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (error) { return value; }
    }
    return value;
  }

  async getWithMetadata(key) {
    const db = await this.db();
    const { data, error } = await db.from(this.table).select('value, etag, metadata').eq('key', key);
    if (error) throw error;
    const row = data && data[0];
    if (!row) return null;
    return { data: this.parseValue(row.value), etag: row.etag, metadata: row.metadata || {} };
  }

  async get(key, options = {}) {
    const entry = await this.getWithMetadata(key);
    return entry ? entry.data : null;
  }

  async setJSON(key, value, options = {}) {
    const existing = await this.getWithMetadata(key);
    if (options.onlyIfNew && existing) return { modified: false };
    if (options.onlyIfMatch && (!existing || existing.etag !== options.onlyIfMatch)) return { modified: false };
    const etag = crypto.randomBytes(12).toString('hex');
    const db = await this.db();
    const { error } = await db.from(this.table).upsert({ key, value, etag, metadata: {}, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    return { modified: true, etag };
  }

  async set(key, value, options = {}) {
    return this.setJSON(key, value, options);
  }

  async list(options = {}) {
    const db = await this.db();
    const prefix = options.prefix || '';
    const { data, error } = await db.from(this.table).select('key').like('key', `${prefix}%`);
    if (error) throw error;
    return { blobs: (data || []).map((row) => ({ key: row.key, etag: '' })), directories: [] };
  }

  async delete(key) {
    const db = await this.db();
    const { error } = await db.from(this.table).delete().eq('key', key);
    if (error) throw error;
  }
}

class PGStore {
  constructor(name) {
    this.name = name;
    this.table = TABLE_NAMES[name] || `tazhi_${String(name).replace(/-/g, '_')}`;
  }

  async query(text, params) {
    return pgPool().query(text, params);
  }

  async getWithMetadata(key) {
    const { rows } = await this.query(`SELECT value, etag, metadata FROM ${this.table} WHERE key = $1`, [key]);
    const row = rows && rows[0];
    if (!row) return null;
    return { data: row.value, etag: row.etag, metadata: row.metadata || {} };
  }

  async get(key, options = {}) {
    const entry = await this.getWithMetadata(key);
    return entry ? entry.data : null;
  }

  async setJSON(key, value, options = {}) {
    const existing = await this.getWithMetadata(key);
    if (options.onlyIfNew && existing) return { modified: false };
    if (options.onlyIfMatch && (!existing || existing.etag !== options.onlyIfMatch)) return { modified: false };
    const etag = crypto.randomBytes(12).toString('hex');
    await this.query(`INSERT INTO ${this.table} (key, value, etag, metadata, updated_at) VALUES ($1, $2::jsonb, $3, $4::jsonb, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, etag = EXCLUDED.etag, metadata = EXCLUDED.metadata, updated_at = now()`, [key, JSON.stringify(value), etag, JSON.stringify({})]);
    return { modified: true, etag };
  }

  async set(key, value, options = {}) {
    return this.setJSON(key, value, options);
  }

  async list(options = {}) {
    const prefix = options.prefix || '';
    const { rows } = await this.query(`SELECT key FROM ${this.table} WHERE key LIKE $1`, [`${prefix}%`]);
    return { blobs: (rows || []).map((row) => ({ key: row.key, etag: '' })), directories: [] };
  }

  async delete(key) {
    await this.query(`DELETE FROM ${this.table} WHERE key = $1`, [key]);
  }
}

const decodeBuffer = (content) => {
  if (!content) return null;
  if (Buffer.isBuffer(content)) return content.toString('utf8');
  if (typeof content === 'string') return content;
  return null;
};

class CloudStorageStore {
  constructor(name) {
    this.name = name;
  }

  cloudPath(key) {
    return `data/${this.name}/${encodeURIComponent(key)}.json`;
  }

  indexPath() {
    return `data/_indexes/${this.name}.json`;
  }

  async readFile(cloudPath) {
    try {
      const app = await cloudbaseApp();
      const meta = await app.getUploadMetadata({ cloudPath });
      const fileId = meta?.data?.fileId || meta?.data?.file_id || meta?.data?.fileID;
      if (!fileId) return null;
      const res = await app.downloadFile({ fileID: fileId, urlType: 'COS_URL' });
      return decodeBuffer(res?.fileContent);
    } catch (error) {
      return null;
    }
  }

  async writeFile(cloudPath, content) {
    const app = await cloudbaseApp();
    await app.uploadFile({ cloudPath, fileContent: Buffer.from(content, 'utf8') });
  }

  async readIndex() {
    const content = await this.readFile(this.indexPath());
    if (!content) return [];
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  async writeIndex(keys) {
    await this.writeFile(this.indexPath(), JSON.stringify(keys));
  }

  async updateIndex(key, add) {
    const keys = await this.readIndex();
    const exists = keys.includes(key);
    if (add && !exists) {
      keys.push(key);
      await this.writeIndex(keys);
    }
    if (!add && exists) {
      await this.writeIndex(keys.filter((item) => item !== key));
    }
  }

  async get(key, options = {}) {
    const entry = await this.getWithMetadata(key);
    if (!entry) return null;
    return options.type === 'json' ? entry.data : entry.data;
  }

  async getWithMetadata(key) {
    const content = await this.readFile(this.cloudPath(key));
    if (!content) return null;
    try {
      const entry = JSON.parse(content);
      return { data: entry.value, etag: entry.etag, metadata: entry.metadata || {} };
    } catch (error) {
      return null;
    }
  }

  async setJSON(key, value, options = {}) {
    const existing = await this.getWithMetadata(key);
    if (options.onlyIfNew && existing) return { modified: false };
    if (options.onlyIfMatch && (!existing || existing.etag !== options.onlyIfMatch)) return { modified: false };
    const etag = crypto.randomBytes(12).toString('hex');
    const entry = { etag, value, metadata: {} };
    await this.writeFile(this.cloudPath(key), JSON.stringify(entry));
    await this.updateIndex(key, true);
    return { modified: true, etag };
  }

  async set(key, value, options = {}) {
    return this.setJSON(key, value, options);
  }

  async list(options = {}) {
    const prefix = options.prefix || '';
    const keys = await this.readIndex();
    const blobs = keys
      .filter((key) => key.startsWith(prefix))
      .map((key) => ({ key, etag: '' }));
    return { blobs, directories: [] };
  }

  async delete(key) {
    try {
      const app = await cloudbaseApp();
      const meta = await app.getUploadMetadata({ cloudPath: this.cloudPath(key) });
      const fileId = meta?.data?.fileId || meta?.data?.file_id || meta?.data?.fileID;
      if (fileId) await app.deleteFile({ fileList: [fileId] });
    } catch (error) {}
    await this.updateIndex(key, false);
  }
}

class KVStore {
  constructor(name) {
    this.name = `tazhi:${name}`;
  }

  key(key) {
    return `${this.name}:${key}`;
  }

  async get(key, options = {}) {
    const { kv } = await import('@vercel/kv');
    const wantJson = options.type === 'json';
    const entry = memory.get(this.key(key));
    if (!kvConfigured()) return entry ? (wantJson ? entry.value : entry.value) : null;
    const remote = await kv.hget(this.name, key);
    return remote ? (wantJson ? remote.value : remote.value) : null;
  }

  async getWithMetadata(key) {
    const { kv } = await import('@vercel/kv');
    if (!kvConfigured()) {
      const entry = memory.get(this.key(key));
      return entry ? { data: entry.value, etag: entry.etag, metadata: {} } : null;
    }
    const entry = await kv.hget(this.name, key);
    return entry ? { data: entry.value, etag: entry.etag, metadata: {} } : null;
  }

  async setJSON(key, value, options = {}) {
    const { kv } = await import('@vercel/kv');
    const existing = await this.getWithMetadata(key);
    if (options.onlyIfNew && existing) return { modified: false };
    if (options.onlyIfMatch && (!existing || existing.etag !== options.onlyIfMatch)) return { modified: false };
    const etag = crypto.randomBytes(12).toString('hex');
    const entry = { etag, value, metadata: {} };
    if (!kvConfigured()) {
      memory.set(this.key(key), entry);
    } else {
      await kv.hset(this.name, { [key]: entry });
    }
    return { modified: true, etag };
  }

  async set(key, value, options = {}) {
    return this.setJSON(key, value, options);
  }

  async list(options = {}) {
    const { kv } = await import('@vercel/kv');
    const prefix = options.prefix || '';
    if (!kvConfigured()) {
      const blobs = [];
      for (const [fullKey, entry] of memory.entries()) {
        if (!fullKey.startsWith(`${this.name}:`)) continue;
        const key = fullKey.slice(this.name.length + 1);
        if (!key.startsWith(prefix)) continue;
        blobs.push({ key, etag: entry.etag });
      }
      return { blobs, directories: [] };
    }
    const all = (await kv.hgetall(this.name)) || {};
    const blobs = Object.keys(all)
      .filter((key) => key.startsWith(prefix))
      .map((key) => ({ key, etag: all[key]?.etag || '' }));
    return { blobs, directories: [] };
  }

  async delete(key) {
    const { kv } = await import('@vercel/kv');
    if (!kvConfigured()) {
      memory.delete(this.key(key));
      return;
    }
    await kv.hdel(this.name, key);
  }
}

const kvConfigured = () => Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export const getStore = (name) => {
  if (process.env.CLOUDBASE_APIKEY || process.env.TENCENTCLOUD_SECRETID) return new RdbStore(name);
  if (pgConfigured()) return new PGStore(name);
  if (cloudbaseConfigured()) return new RdbStore(name);
  return new KVStore(name);
};
