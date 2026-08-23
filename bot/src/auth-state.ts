import {
  BufferJSON, initAuthCreds, proto, type AuthenticationCreds,
  type AuthenticationState, type SignalDataTypeMap,
} from '@whiskeysockets/baileys'
import { pool } from './db.js'

/** Estado Signal persistido atomicamente no Postgres para sobreviver a restarts. */
export async function postgresAuthState(ownerId: string) {
  const result = await pool.query(`select credentials from whatsapp_auth_state where owner_id=$1`, [ownerId])
  const creds: AuthenticationCreds = result.rows[0]
    ? JSON.parse(result.rows[0].credentials, BufferJSON.reviver)
    : initAuthCreds()

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => loadKeys(ownerId, type, ids),
      set: async (data) => saveKeys(ownerId, data),
    },
  }

  const saveCreds = async () => {
    const serialized = JSON.stringify(creds, BufferJSON.replacer)
    await pool.query(`insert into whatsapp_auth_state (owner_id,credentials) values ($1,$2)
      on conflict (owner_id) do update set credentials=$2,updated_at=now()`, [ownerId, serialized])
  }
  if (!result.rows[0]) await saveCreds()
  return { state, saveCreds }
}

export async function clearAuthState(ownerId: string) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(`delete from whatsapp_auth_keys where owner_id=$1`, [ownerId])
    await client.query(`delete from whatsapp_auth_state where owner_id=$1`, [ownerId])
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function loadKeys<T extends keyof SignalDataTypeMap>(ownerId: string, type: T, ids: string[]) {
  const result = await pool.query(`select key_id,value from whatsapp_auth_keys where owner_id=$1 and category=$2 and key_id=any($3)`, [ownerId, type, ids])
  const values: { [id: string]: SignalDataTypeMap[T] } = {}
  for (const row of result.rows) {
    let value = JSON.parse(row.value, BufferJSON.reviver)
    if (type === 'app-state-sync-key') value = proto.Message.AppStateSyncKeyData.fromObject(value)
    values[row.key_id] = value
  }
  return values
}

async function saveKeys(ownerId: string, data: { [T in keyof SignalDataTypeMap]?: { [id: string]: SignalDataTypeMap[T] | null } }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    for (const category of Object.keys(data) as Array<keyof SignalDataTypeMap>) {
      for (const [keyId, value] of Object.entries(data[category] ?? {})) {
        if (value === null) await client.query(`delete from whatsapp_auth_keys where owner_id=$1 and category=$2 and key_id=$3`, [ownerId, category, keyId])
        else await client.query(`insert into whatsapp_auth_keys (owner_id,category,key_id,value) values ($1,$2,$3,$4)
          on conflict (owner_id,category,key_id) do update set value=$4`, [ownerId, category, keyId, JSON.stringify(value, BufferJSON.replacer)])
      }
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
