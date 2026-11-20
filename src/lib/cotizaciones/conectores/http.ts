/** Pedido HTTP con tiempo límite (una fuente lenta no puede trabar la actualización). */
export async function pedirJson(url: string, fetchFn: typeof fetch = fetch, ms = 10_000): Promise<unknown> {
  const r = await fetchFn(url, {
    signal: AbortSignal.timeout(ms),
    headers: { Accept: "application/json", "User-Agent": "gestion-joyeria/1.0" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`respondió ${r.status}`);
  return r.json();
}

export const fechaODefecto = (v: unknown) => {
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v);
  if (typeof v === "string") {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00-03:00` : v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};
