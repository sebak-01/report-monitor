/** Resolves extensionless relative imports of the TypeScript sources. */
import { existsSync } from 'node:fs';
import { resolve as pathResolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const base = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : process.cwd();
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        const candidate = pathResolve(base, specifier + ext);
        if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    throw error;
  }
}
