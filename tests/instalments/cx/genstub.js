// Stand-in for ./_generated/* in the offline harnesses. Function builders return
// the definition object unchanged so `X.handler(ctx, args)` runs the real body.
// `internal`/`api` are proxies yielding path-carrying refs ("module.fn") so
// scheduled calls can be asserted by name.
const pass = (def) => def;
export const mutation = pass, query = pass, action = pass;
export const internalMutation = pass, internalQuery = pass, internalAction = pass;
const ref = (path) => new Proxy(function () {}, { get: (_t, k) => (k === '__path' ? path : ref(path ? `${path}.${String(k)}` : String(k))) });
export const internal = ref('');
export const api = ref('');
