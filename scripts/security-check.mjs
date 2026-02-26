import fs from "fs";
import path from "path";

const root = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

const checks = [];

function expect(condition, passMessage, failMessage) {
  checks.push({ ok: !!condition, passMessage, failMessage });
}

const homeJs = read("public/js/home.js");
expect(
  !/container\.innerHTML\s*=\s*top3/.test(homeJs),
  "Homepage events are not rendered via unsafe innerHTML template injection.",
  "Homepage events still use unsafe innerHTML template injection."
);
expect(
  /normalizeEventImagePath/.test(homeJs) && /textContent/.test(homeJs),
  "Homepage event rendering uses normalized image paths and textContent.",
  "Homepage event rendering is missing safe path normalization or textContent usage."
);

const contactRoutes = read("server/routes/contactRoutes.js");
expect(
  /router\.post\(\s*"\/send",\s*contactLimiter,/s.test(contactRoutes),
  "Contact route is configured and guarded by rate limiting.",
  "Contact route shape is unexpected."
);

const adminRoutes = read("server/routes/admin.js");
expect(
  /router\.post\("\/login",\s*loginLimiter,/s.test(adminRoutes),
  "Admin login route is configured and guarded by rate limiting.",
  "Admin login route shape is unexpected."
);
expect(
  /router\.post\("\/logout",\s*\(req,\s*res\)\s*=>/s.test(adminRoutes),
  "Admin logout route is configured.",
  "Admin logout route shape is unexpected."
);

const serverJs = read("server/server.js");
expect(
  /collectInlineScriptHashes/.test(serverJs) && /\.\.\.inlineScriptHashes/.test(serverJs),
  "CSP script hashes are generated and applied.",
  "CSP script hashes are not being generated/applied."
);

let failures = 0;
for (const check of checks) {
  if (check.ok) {
    console.log(`PASS: ${check.passMessage}`);
  } else {
    failures += 1;
    console.error(`FAIL: ${check.failMessage}`);
  }
}

if (failures > 0) {
  console.error(`\nSecurity check failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log("\nSecurity check passed.");
