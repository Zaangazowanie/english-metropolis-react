// Stand-in for `convex/values` in the offline harness: validators are inert
// descriptors, ConvexError carries `data` exactly like the real class.
const mk = (n) => (...a) => ({ __v: n, args: a });
export const v = new Proxy({}, { get: (_t, k) => mk(String(k)) });
export class ConvexError extends Error {
  constructor(data) {
    super(typeof data === 'string' ? data : JSON.stringify(data));
    this.name = 'ConvexError';
    this.data = data;
  }
}
