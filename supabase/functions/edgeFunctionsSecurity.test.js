import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const entrypoints = {
  'super-service': 'super-service/scan-invoice.ts',
  'scan-invoice': 'scan-invoice/index.ts',
  'generate-embeddings': 'generate-embeddings/index.ts',
  'backfill-materials-embeddings': 'backfill-materials-embeddings/index.ts',
  'ask-jarvis': 'ask-jarvis/index.ts',
  'create-employee': 'create-employee/index.ts',
};

const administrativeFunctions = [
  'generate-embeddings',
  'backfill-materials-embeddings',
  'create-employee',
];

const functionSource = (relativePath) => readFileSync(
  resolve(process.cwd(), 'supabase/functions', relativePath),
  'utf8',
);

describe('Edge Function security configuration', () => {
  it.each(Object.entries(entrypoints))('%s explicitly authorizes a staff profile', (_, path) => {
    const source = functionSource(path);

    expect(source).toContain('authorizeStaff(');
    expect(source).toContain('@supabase/supabase-js@2.107.0');
    expect(source).not.toMatch(/(?:sk-|sb_secret_)[A-Za-z0-9_-]{20,}/);
    expect(source).not.toMatch(/eyJ[A-Za-z0-9_-]{40,}/);
  });

  it.each(administrativeFunctions)('%s is restricted to owners', (functionName) => {
    const source = functionSource(entrypoints[functionName]);

    expect(source).toMatch(/authorizeStaff\([^;]+allowedRoles:\s*\[(["'])owner\1\]/s);
  });

  it.each(Object.keys(entrypoints))('%s keeps gateway JWT verification enabled', (functionName) => {
    const config = readFileSync(resolve(process.cwd(), 'supabase/config.toml'), 'utf8');
    const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const functionBlock = config.match(
      new RegExp(`\\[functions\\.${escapedName}\\]([\\s\\S]*?)(?=\\n\\[|$)`),
    );

    expect(functionBlock?.[1]).toMatch(/verify_jwt\s*=\s*true/);
  });
});
