/**
 * Web Crypto API Engine for E2EE Secure Chat
 * Uses ECDH (P-256) for Key Agreement and AES-256-GCM for Authenticated Encryption.
 */

export class CryptoEngine {
  /**
   * Generate ECDH (P-256) Key Pair for user identity
   */
  static async generateKeyPair() {
    return await window.crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true, // extractable
      ['deriveKey', 'deriveBits']
    );
  }

  /**
   * Export a CryptoKey to JSON Web Key (JWK) format for transmission/storage
   */
  static async exportKeyToJWK(key) {
    return await window.crypto.subtle.exportKey('jwk', key);
  }

  /**
   * Import a public JWK string/object into a CryptoKey usable for ECDH derivation
   */
  static async importPublicKeyFromJWK(jwk) {
    const jwkObj = typeof jwk === 'string' ? JSON.parse(jwk) : jwk;
    return await window.crypto.subtle.importKey(
      'jwk',
      jwkObj,
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      []
    );
  }

  /**
   * Import a private JWK string/object into a CryptoKey for ECDH derivation
   */
  static async importPrivateKeyFromJWK(jwk) {
    const jwkObj = typeof jwk === 'string' ? JSON.parse(jwk) : jwk;
    return await window.crypto.subtle.importKey(
      'jwk',
      jwkObj,
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      ['deriveKey', 'deriveBits']
    );
  }

  /**
   * Derive a shared symmetric AES-GCM (256-bit) key using My Private Key + Their Public Key
   */
  static async deriveSharedAESKey(myPrivateKey, theirPublicKey) {
    return await window.crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: theirPublicKey
      },
      myPrivateKey,
      {
        name: 'AES-GCM',
        length: 256
      },
      false, // non-extractable for security
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt plaintext string into Base64 Ciphertext and IV using AES-256-GCM
   */
  static async encryptMessage(sharedAESKey, plaintext) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // 96-bit (12 bytes) IV as recommended for AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      sharedAESKey,
      data
    );

    return {
      ciphertext: this.arrayBufferToBase64(encryptedBuffer),
      iv: this.arrayBufferToBase64(iv)
    };
  }

  /**
   * Decrypt Base64 Ciphertext + IV into plaintext string using AES-256-GCM
   */
  static async decryptMessage(sharedAESKey, ciphertextBase64, ivBase64) {
    const ciphertext = this.base64ToArrayBuffer(ciphertextBase64);
    const iv = this.base64ToArrayBuffer(ivBase64);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      sharedAESKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  }

  /**
   * Compute Safety Number / Cryptographic Fingerprint for MitM Verification
   */
  static async computeSafetyNumber(myPubKeyJWK, friendPubKeyJWK) {
    const keysStr = [JSON.stringify(myPubKeyJWK), JSON.stringify(friendPubKeyJWK)].sort().join(':');
    const encoder = new TextEncoder();
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(keysStr));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    // Format into 6 blocks of 5 digits
    const digits = hashArray.map(b => b.toString().padStart(3, '0')).join('');
    return `${digits.slice(0, 5)} ${digits.slice(5, 10)} ${digits.slice(10, 15)} ${digits.slice(15, 20)}`;
  }

  // --- Utility Functions ---
  static arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  static base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
