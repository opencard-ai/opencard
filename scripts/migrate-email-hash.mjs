/**
 * Migration script: Convert existing plaintext subscriber emails to hashed format.
 * Run ONCE to migrate existing users after the SHA-256 email hash change.
 * 
 * What it does:
 * 1. Reads all keys matching opencard:user:*
 * 2. For each user: re-hashes the key with SHA-256
 * 3. Updates the subscribers set to use hashes instead of plaintext emails
 * 4. Populates email_for_send for existing users
 * 
 * Usage: node scripts/migrate-email-hash.mjs
 */

import { createClient } from "@upstash/redis";

const redis = createClient({
  url: process.env.UPSTASH_KV_REST_API_URL,
  token: process.env.UPSTASH_KV_REST_API_TOKEN,
});

const USER_PREFIX = "opencard:user:";
const SUBSCRIBERS_SET = "opencard:subscribers";

async function hashEmail(email) {
  const normalized = email.toLowerCase().trim();
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(normalized).digest("hex");
}

async function encodeEmailForSend(email) {
  const reversed = email.toLowerCase().trim().split("").reverse().join("");
  return Buffer.from(reversed).toString("base64");
}

async function migrate() {
  console.log("Starting migration...");

  // Get all existing subscriber emails (plaintext)
  const subscribers = await redis.smembers(SUBSCRIBERS_SET);
  console.log(`Found ${subscribers.length} subscribers in set`);

  let migrated = 0;
  let needsAttention = 0;

  for (const oldEmail of subscribers) {
    // Check if this is already a hash (64 hex chars) or plaintext email
    const isHash = /^[a-f0-9]{64}$/.test(oldEmail);

    if (isHash) {
      console.log(`  ${oldEmail.substring(0, 8)}... already a hash, skipping`);
      continue;
    }

    // Compute new hash
    const emailHash = await hashEmail(oldEmail);
    const emailForSend = await encodeEmailForSend(oldEmail);

    // Check if user exists under old plaintext key
    const oldKey = `${USER_PREFIX}${oldEmail}`;
    const newKey = `${USER_PREFIX}${emailHash}`;

    const userData = await redis.hgetall(oldKey);

    if (userData && userData.created_at) {
      // Migrate: update new key with email_for_send, delete old key
      await redis.hset(newKey, {
        ...userData,
        email_hash: emailHash,
        email_for_send: emailForSend,
        email_hint: oldEmail.substring(0, 3) + "***@" + oldEmail.split("@")[1],
        migrated_at: Date.now(),
        original_email: undefined, // never store plaintext
      });

      // Remove from old key
      await redis.del(oldKey);

      // Update set: remove old plaintext, add hash
      await redis.srem(SUBSCRIBERS_SET, oldEmail);
      await redis.sadd(SUBSCRIBERS_SET, emailHash);

      migrated++;
      console.log(`  Migrated: ${oldEmail} → ${emailHash.substring(0, 16)}...`);
    } else {
      // No user data found under plaintext key
      console.log(`  WARNING: No data for ${oldEmail}, removing from set`);
      await redis.srem(SUBSCRIBERS_SET, oldEmail);
      needsAttention++;
    }
  }

  console.log(`\nMigration complete: ${migrated} migrated, ${needsAttention} removed from set`);
}

migrate().catch(console.error);
