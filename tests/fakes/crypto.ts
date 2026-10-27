/** Content-format blob: 12-byte IV, then AES-GCM ciphertext with tag. */
export async function encryptWith(key: CryptoKey, plain: Uint8Array): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain as BufferSource))
  return new Uint8Array([...iv, ...ct]).buffer
}
