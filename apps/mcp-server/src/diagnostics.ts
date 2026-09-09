import { FeedError } from "@edgestream/feeds-core";

/** Only evaluates Error.stack accessors (V8 exposes native stacks this way); never invokes toJSON. Bounds are explicit in the wire data. */
export function diagnosticValue(value: unknown): unknown {
  const seen = new WeakSet<object>();
  let nodes = 0;
  let characters = 6 * 1024 * 1024;
  function visit(value: unknown, depth: number): unknown {
    if (++nodes > 10_000 || depth > 32) return { omitted: "Diagnostic node/depth limit reached." };
    if (typeof value === "string") {
      const length = Math.min(value.length, Math.max(0, characters));
      characters -= length;
      return length === value.length ? value : { prefix: value.slice(0, length), omitted: `${value.length - length} UTF-16 code units (diagnostic character limit).` };
    }
    if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
    if (typeof value !== "object" && typeof value !== "function") return { type: typeof value, value: String(value) };
    if (seen.has(value)) return { omitted: "Cyclic or repeated reference." };
    seen.add(value);
    const result: Record<string, unknown> = Object.create(null);
    try {
      const keys = new Set<PropertyKey>(value instanceof Error ? ["name", "message", "stack", "cause", ...Reflect.ownKeys(value)] : Reflect.ownKeys(value));
      for (const key of keys) {
        if (nodes >= 10_000 || characters <= 0) { result.$omitted = "Remaining properties exceed diagnostic budget."; break; }
        let owner: object | null = value;
        let descriptor: PropertyDescriptor | undefined;
        while (owner && !descriptor) { descriptor = Object.getOwnPropertyDescriptor(owner, key); owner = Object.getPrototypeOf(owner); }
        if (!descriptor) continue;
        const label = typeof key === "symbol" ? `[${String(key)}]` : String(key);
        if (value instanceof Error && key === "stack" && !("value" in descriptor)) {
          try { result[label] = visit(value.stack, depth + 1); }
          catch (cause) { result[label] = { omitted: "Stack accessor failed.", cause: visit(cause, depth + 1) }; }
          continue;
        }
        result[label] = "value" in descriptor ? visit(descriptor.value, depth + 1) : { omitted: "Accessor not invoked." };
      }
    } catch (error) { result.$omitted = "Property inspection failed."; result.inspectionFailure = depth < 32 ? visit(error, depth + 1) : "Depth limit reached."; }
    return result;
  }
  return visit(value, 0);
}

export function failureData(error: unknown, resultBytes: number) {
  const code = error instanceof FeedError ? error.code : "UPSTREAM";
  const diagnostic = diagnosticValue(error);
  // Reserve room for the transport envelope; measure the escaped JSON text too.
  const budget = resultBytes - 128;
  const data = { code, diagnostic };
  const serialized = JSON.stringify(data);
  if (Buffer.byteLength(JSON.stringify(serialized)) <= budget) return data;
  let low = 0, high = serialized.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(JSON.stringify(JSON.stringify({ code, diagnostic: { prefix: serialized.slice(0, mid), omitted: "Diagnostic exceeds MCP result byte budget." } }))) <= budget) low = mid;
    else high = mid - 1;
  }
  return { code, diagnostic: { prefix: serialized.slice(0, low), omitted: "Diagnostic exceeds MCP result byte budget." } };
}
