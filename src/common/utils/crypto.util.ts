import * as crypto from 'crypto';

const algorithm = 'aes-256-cbc';

// Generate a 32-byte key from the ENCRYPTION_KEY env var
const getKey = () => {
  const keyStr = process.env.ENCRYPTION_KEY;
  if (!keyStr) {
    throw new Error('ENCRYPTION_KEY environment variable is missing.');
  }
  return crypto.scryptSync(keyStr, 'salt', 32);
};

export const encryptToken = (text: string | null | undefined): string | null => {
  if (!text) return null;
  // Don't double-encrypt if somehow passed an already encrypted string (format iv:encrypted)
  if (text.includes(':') && text.split(':')[0].length === 32) return text;
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

export const decryptToken = (encryptedText: string | null | undefined): string | null => {
  if (!encryptedText) return null;
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) return encryptedText; // Likely plaintext legacy token
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    // Check if IV is valid length for aes-256-cbc
    if (iv.length !== 16) return encryptedText;

    const decipher = crypto.createDecipheriv(algorithm, getKey(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.warn('Token decryption failed, returning original value');
    return encryptedText;
  }
};
