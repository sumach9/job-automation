// ─── Adapter Registry ────────────────────────────────────────────────────────
// Selects the right adapter for a given job URL.
// Falls back to GenericAdapter if no specific adapter matches.

import { LinkedInAdapter }   from "./linkedin/index.js";
import { GreenhouseAdapter } from "./greenhouse/index.js";
import { LeverAdapter }      from "./lever/index.js";
import { AshbyAdapter }      from "./ashby/index.js";
import { GenericAdapter }    from "./generic/index.js";

const ADAPTERS = [
  new LinkedInAdapter(),
  new GreenhouseAdapter(),
  new LeverAdapter(),
  new AshbyAdapter(),
  // Generic must be last — always matches
  new GenericAdapter(),
];

/**
 * Find the first adapter that claims to handle this URL.
 * For URL-only detection (no live page), pass page=null.
 */
export async function resolveAdapter(url, page = null) {
  for (const adapter of ADAPTERS) {
    try {
      const matches = await adapter.detect(page, url);
      if (matches) return adapter;
    } catch {}
  }
  return new GenericAdapter(); // safety fallback
}

export { LinkedInAdapter, GreenhouseAdapter, LeverAdapter, AshbyAdapter, GenericAdapter };
