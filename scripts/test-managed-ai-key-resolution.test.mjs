import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Managed AI Key Resolution & Production 401 Auto-Recovery", () => {
  const translateTs = fs.readFileSync(
    path.resolve(process.cwd(), "server/api/translations/translate.post.ts"),
    "utf-8"
  );
  const openRouterTs = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/openrouter.ts"),
    "utf-8"
  );
  const viteConfigTs = fs.readFileSync(
    path.resolve(process.cwd(), "vite.config.ts"),
    "utf-8"
  );
  const nitroConfigTs = fs.readFileSync(
    path.resolve(process.cwd(), "nitro.config.ts"),
    "utf-8"
  );

  it("1. openrouter.ts forwards configured default environment key in headers for Managed AI", () => {
    assert.match(
      openRouterTs,
      /headers\[["']x-default-openrouter-key["']\]\s*=\s*defaultEnvKey/,
      "streamCompletion must forward x-default-openrouter-key"
    );
    assert.match(
      openRouterTs,
      /const\s+defaultEnvKey\s*=\s*getDefaultKey\(\)/,
      "streamCompletion must resolve defaultEnvKey via getDefaultKey()"
    );
  });

  it("2. translate.post.ts sanitizes API keys (strips quotes, Bearer prefix, whitespace)", () => {
    assert.match(
      translateTs,
      /function\s+cleanApiKey/,
      "translate.post.ts must define cleanApiKey helper"
    );
    assert.match(
      translateTs,
      /k\.replace\(\/\^\["\'\]\+\|\["\'\]\+\$\/g,\s*["']["']\)/,
      "cleanApiKey must strip wrapping quotes"
    );
    assert.match(
      translateTs,
      /k\.replace\(\/\^Bearer\\s\+\/i,\s*["']["']\)/,
      "cleanApiKey must strip redundant Bearer prefix"
    );
  });

  it("3. translate.post.ts resolves candidate keys and maintains Managed AI mode", () => {
    assert.match(
      translateTs,
      /getHeader\(event,\s*["']x-default-openrouter-key["']\)/,
      "translate.post.ts must check x-default-openrouter-key"
    );
    assert.match(
      translateTs,
      /const\s+isManagedMode\s*=\s*!customHeaderKey/,
      "isManagedMode must be true when using default key"
    );
    assert.match(
      translateTs,
      /primaryKey/,
      "translate.post.ts must determine primary key"
    );
    assert.match(
      translateTs,
      /fallbackKey/,
      "translate.post.ts must determine fallback key"
    );
  });

  it("4. translate.post.ts automatically recovers from 401 User not found using fallback key", () => {
    assert.match(
      translateTs,
      /orResponse\.status\s*===\s*401\s*&&\s*fallbackKey/,
      "translate.post.ts must check for 401 status with available fallbackKey"
    );
    assert.match(
      translateTs,
      /user not found/i,
      "translate.post.ts must detect User not found error message"
    );
    assert.match(
      translateTs,
      /orResponse\s*=\s*await\s+fetchUpstream\(activeApiKey\)/,
      "translate.post.ts must retry fetchUpstream with fallback key on 401"
    );
  });

  it("5. Bundlers inline build-time fallback keys for Nitro serverless runtime", () => {
    assert.match(
      viteConfigTs,
      /__SERVER_OPENROUTER_DEFAULT_KEY__/,
      "vite.config.ts nitro replace must define __SERVER_OPENROUTER_DEFAULT_KEY__"
    );
    assert.match(
      nitroConfigTs,
      /__SERVER_OPENROUTER_DEFAULT_KEY__/,
      "nitro.config.ts must define __SERVER_OPENROUTER_DEFAULT_KEY__"
    );
  });
});
