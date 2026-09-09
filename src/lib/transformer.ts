/**
 * The wire transformer, shared by the server and the client.
 *
 * Both ends must use the same one or every `Date` arrives as a string.
 *
 * Built from superjson's *named* exports rather than its default. The default
 * export is the `SuperJSON` class, and `serialize`/`deserialize` are instance
 * methods on it — so `superjson.serialize` is not a function. It appeared to
 * work because the CommonJS interop hands back the whole module namespace,
 * which happens to include the module-level `serialize` and `deserialize` bound
 * to a default instance. That is an accident of module resolution, and the
 * client's stricter typing is what noticed: it saw `typeof SuperJSON` where a
 * transformer object was required.
 */

import type { DataTransformer } from '@trpc/server';
import { deserialize, serialize } from 'superjson';

/**
 * Annotated rather than inferred. tRPC's `create()` sets its internal
 * `transformer: true` flag only when the argument *satisfies*
 * `DataTransformer` at the call site; an object literal whose methods
 * are narrower than `(input: any) => any` infers as a plain shape, the flag
 * stays false, and the client then refuses to accept a transformer at all —
 * with a type error that names neither this file nor the real cause.
 */
export const transformer: DataTransformer = { serialize, deserialize };
