/**
 * File: gen-2fa.js
 * Purpose: Generates a TOTP secret for administrator two-factor authentication setup.
 */
import speakeasy from "speakeasy";

const secret = speakeasy.generateSecret({
  length: 20,
});

console.log("Base32 Secret (put this in .env as ADMIN_TOTP_SECRET):");
console.log(secret.base32);