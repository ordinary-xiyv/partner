/**
 * 传输层密码加密工具（RSA + AES 混合加密）。
 * 1. 从 /api/lynx/auth/encryption-key 获取 RSA 公钥与 key_id。
 * 2. 生成 32 字节 AES 密钥与 12 字节 IV。
 * 3. AES-256-GCM 加密密码明文。
 * 4. RSA-OAEP 加密 AES 密钥。
 * 5. 返回 JSON 信封字符串，由后端 private key 解密。
 */

interface EncryptionKey {
  kid: string;
  publicKeyPEM: string;
  fetchedAt: number;
}

interface EncryptedPasswordEnvelope {
  version: '1';
  key_id: string;
  key: string; // base64(RSA-OAEP(AES-KEY))
  timestamp: number;
  iv: string; // base64
  ciphertext: string; // base64
  authTag: string; // base64
}

let cachedKey: EncryptionKey | null = null;
const KEY_CACHE_TTL_MS = 30 * 1000; // 30 秒，后端密钥变更后能快速刷新

function base64Encode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function importPublicKey(pem: string): Promise<CryptoKey> {
  const keyData = pemToArrayBuffer(pem);
  return crypto.subtle.importKey(
    'spki',
    keyData,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
}

async function fetchEncryptionKey(): Promise<EncryptionKey> {
  if (cachedKey && Date.now() - cachedKey.fetchedAt < KEY_CACHE_TTL_MS) {
    return cachedKey;
  }

  const url = '/api/lynx/auth/encryption-key?_=' + Date.now();
  console.log('[transportCrypto] fetching encryption key:', url);
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`fetch encryption key failed: ${res.status}`);
  }
  const json = await res.json();
  console.log('[transportCrypto] encryption key response:', json?.success, json?.data?.key_id);
  if (!json?.success || !json?.data?.public_key || !json?.data?.key_id) {
    throw new Error('invalid encryption key response');
  }
  cachedKey = {
    kid: String(json.data.key_id),
    publicKeyPEM: String(json.data.public_key),
    fetchedAt: Date.now(),
  };
  return cachedKey;
}

/**
 * 加密单个密码，返回 JSON 字符串信封。
 * 该函数是异步的，首次调用会自动拉取公钥。
 */
export async function encryptPassword(password: string): Promise<string> {
  console.log('[transportCrypto] encryptPassword called, password length:', password?.length);
  if (!password) {
    throw new Error('password is empty');
  }
  if (!crypto?.subtle) {
    // Web Crypto API 仅在安全上下文（localhost/127.0.0.1/https）中可用。
    // 通过 http://<IP> 访问时 subtle 为 undefined，会导致加密失败且无登录请求发出。
    console.error(
      '[transportCrypto] Web Crypto API not available (crypto.subtle is undefined).',
      'protocol:', typeof location !== 'undefined' ? location.protocol : 'unknown',
      'host:', typeof location !== 'undefined' ? location.host : 'unknown',
      'secureContext:', typeof window !== 'undefined' ? (window as Window & { isSecureContext?: boolean }).isSecureContext : 'unknown',
    );
    throw new Error('Web Crypto API Error：请使用 https:// 访问本站');
  }

  try {
    const { kid, publicKeyPEM } = await fetchEncryptionKey();
    const publicKey = await importPublicKey(publicKeyPEM);

    const aesKeyRaw = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const aesKey = await crypto.subtle.importKey(
      'raw',
      aesKeyRaw,
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );

    const plainBytes = new TextEncoder().encode(password);
    const cipherWithTag = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      aesKey,
      plainBytes,
    );

    const cipherBytes = new Uint8Array(cipherWithTag);
    const tagOffset = cipherBytes.length - 16;
    const ciphertextBytes = cipherBytes.slice(0, tagOffset);
    const authTagBytes = cipherBytes.slice(tagOffset);

    const encryptedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      aesKeyRaw,
    );

    const envelope: EncryptedPasswordEnvelope = {
      version: '1',
      key_id: kid,
      key: base64Encode(encryptedKey),
      timestamp: Math.floor(Date.now() / 1000),
      iv: base64Encode(iv.buffer),
      ciphertext: base64Encode(ciphertextBytes.buffer),
      authTag: base64Encode(authTagBytes.buffer),
    };

    console.log('[transportCrypto] envelope generated, key_id:', kid);
    return JSON.stringify(envelope);
  } catch (err) {
    console.error('[transportCrypto] encryptPassword failed:', err);
    throw err;
  }
}

/**
 * 立即清空缓存的公钥，用于测试或手动刷新。
 */
export function clearEncryptionKeyCache(): void {
  cachedKey = null;
}
