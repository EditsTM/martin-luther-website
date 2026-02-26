/**
 * File: server\middleware\uploadValidation.js
 * Purpose: Implements middleware used to enforce uploadValidation rules.
 */
import fs from "fs";

function startsWith(buf, bytes) {
  if (!Buffer.isBuffer(buf) || buf.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buf[i] !== bytes[i]) return false;
  }
  return true;
}

export function hasValidImageSignature(filePath, mimeType) {
  let head;
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    head = buf.subarray(0, bytesRead);
  } catch {
    return false;
  }

  if (mimeType === "image/jpeg") return startsWith(head, [0xff, 0xd8, 0xff]);
  if (mimeType === "image/png")
    return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === "image/gif") {
    const sig = head.subarray(0, 6).toString("ascii");
    return sig === "GIF87a" || sig === "GIF89a";
  }
  if (mimeType === "image/webp") {
    const riff = head.subarray(0, 4).toString("ascii");
    const webp = head.subarray(8, 12).toString("ascii");
    return riff === "RIFF" && webp === "WEBP";
  }
  return false;
}
