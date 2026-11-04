/** Shows ?error= and ?ok= messages passed back by server actions. */
export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const error = typeof sp.error === "string" ? sp.error : null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  if (!error && !ok) return null;
  return (
    <div className={`alert ${error ? "error" : "ok"}`} role={error ? "alert" : "status"} style={{ marginBottom: 16 }}>
      {error ?? ok}
    </div>
  );
}
