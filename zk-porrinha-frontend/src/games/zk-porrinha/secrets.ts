export interface SecretStamp { hand: number; saltHex: string }

export function saveSecret(roomId: bigint, address: string, secret: SecretStamp) {
  try {
    const key = `zk-porrinha:secret:${roomId.toString()}:${address}`;
    sessionStorage.setItem(key, JSON.stringify(secret));
  } catch (e) {
    // ignore storage errors
  }
}

export function loadSecret(roomId: bigint, address: string): SecretStamp | null {
  try {
    const key = `zk-porrinha:secret:${roomId.toString()}:${address}`;
    const v = sessionStorage.getItem(key);
    if (!v) return null;
    return JSON.parse(v) as SecretStamp;
  } catch (e) {
    return null;
  }
}
