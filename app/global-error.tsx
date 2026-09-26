"use client";

/* Última rede de segurança: erro no próprio layout raiz. Precisa trazer <html> e estilos próprios. */
export default function ErroCritico({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#000", color: "#f5f5f7", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
        <div style={{ maxWidth: 420 }}>
          <p style={{ fontSize: 84, fontWeight: 800, margin: 0, color: "#f2c518", lineHeight: 1 }}>500</p>
          <h1 style={{ fontSize: 22, margin: "16px 0 8px" }}>Algo deu errado do nosso lado</h1>
          <p style={{ color: "#a1a1a6", lineHeight: 1.5 }}>Tente de novo em instantes. Se continuar, avise a equipe da Gêmeos Motors.</p>
          <button onClick={reset} style={{ marginTop: 20, background: "#f2c518", color: "#000", border: 0, borderRadius: 999, padding: "12px 22px", fontWeight: 600, cursor: "pointer" }}>
            Tentar de novo
          </button>
          {error.digest && <p style={{ color: "#8a8a90", fontSize: 12, marginTop: 24 }}>Código do erro: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
