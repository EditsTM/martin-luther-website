import speakeasy from "speakeasy";

const secret = speakeasy.generateSecret({
  length: 20,
});

console.log("Base32 Secret (put this in .env as ADMIN_TOTP_SECRET):");
console.log(secret.base32);