import { z } from 'zod';

/**
 * Keyword JSON Schema yang didukung `responseJsonSchema` Gemini (lihat dokumentasi
 * `GenerateContentConfig.responseJsonSchema` di `@google/genai`). Keyword lain
 * (`pattern`, `minLength`, `$schema`, …) dibuang; validasi ketat tetap dilakukan
 * Zod atas respons, sehingga schema ini hanya panduan bentuk untuk model.
 */
const SUPPORTED_KEYWORDS = new Set([
  '$id', '$defs', '$ref', '$anchor', 'type', 'format', 'title', 'description', 'enum',
  'items', 'prefixItems', 'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf', 'oneOf',
  'properties', 'additionalProperties', 'required', 'propertyOrdering',
]);

/** Keyword yang nilainya berupa map nama → sub-schema. */
const SCHEMA_MAPS = new Set(['properties', '$defs']);

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (typeof node !== 'object' || node === null) return node;

  const source = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'const') {
      result.enum = [value];
    } else if (SCHEMA_MAPS.has(key) && typeof value === 'object' && value !== null) {
      result[key] = Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, sanitize(schema)]));
    } else if (SUPPORTED_KEYWORDS.has(key)) {
      result[key] = sanitize(value);
    }
  }
  return result;
}

export function toGeminiJsonSchema(schema: z.ZodType): unknown {
  return sanitize(z.toJSONSchema(schema, { target: 'draft-2020-12' }));
}
