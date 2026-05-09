const STORAGE_PASSPHRASE = 'traneai-ext-secure-store-v1';
const PBKDF2_SALT = 'traneai-pbkdf2-salt-2024';
const PBKDF2_ITERATIONS = 10000;

async function deriveKey(): Promise<CryptoKey> {
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		enc.encode(STORAGE_PASSPHRASE),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt: enc.encode(PBKDF2_SALT),
			iterations: PBKDF2_ITERATIONS,
			hash: 'SHA-256',
		},
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export async function secureStore(storageKey: string, value: unknown): Promise<void> {
	try {
		const key = await deriveKey();
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const enc = new TextEncoder();
		const encrypted = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
			key,
			enc.encode(JSON.stringify(value))
		);
		const combined = new Uint8Array(12 + encrypted.byteLength);
		combined.set(iv, 0);
		combined.set(new Uint8Array(encrypted), 12);
		localStorage.setItem(storageKey, btoa(String.fromCharCode(...combined)));
	} catch {
	}
}

export async function secureRetrieve<T>(storageKey: string): Promise<T | null> {
	const stored = localStorage.getItem(storageKey);
	if (!stored) { return null; }
	try {
		const key = await deriveKey();
		const combined = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
		const iv = combined.slice(0, 12);
		const data = combined.slice(12);
		const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
		return JSON.parse(new TextDecoder().decode(decrypted)) as T;
	} catch {
		return null;
	}
}

export function secureClear(...keys: string[]): void {
	keys.forEach(k => localStorage.removeItem(k));
}
