/**
 * `server-only` throws when imported outside a React Server Component, which is
 * exactly what it is for. Under Vitest there is no bundler to satisfy it, so it
 * is aliased to this empty module — the guard still applies to the real build.
 */
export {};
