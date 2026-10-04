/** Recursive merge of plain objects (b overrides a); arrays/values replaced. */
export function deepMerge<T>(a: T, b: unknown): T {
  if (!b) return a;
  const o: any = Array.isArray(a) ? [...(a as any)] : { ...(a as any) };
  for (const k of Object.keys(b as object)) {
    const v = (b as any)[k];
    o[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge((a as any)?.[k] ?? {}, v) : v;
  }
  return o;
}
