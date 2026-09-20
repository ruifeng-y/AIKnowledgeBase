import type { HealthResponse } from '@akb/contracts';

export default function HomePage(): React.JSX.Element {
  const status: HealthResponse['status'] = 'ok';

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 48, maxWidth: 720 }}>
      <h1 style={{ marginBottom: 8 }}>AI Knowledge Base</h1>
      <p style={{ color: '#555', marginBottom: 24 }}>
        Monorepo skeleton for an enterprise RAG / knowledge-base platform.
      </p>
      <section style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: 20 }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>V0.4-A</h2>
        <p>
          Current phase: engineering skeleton only. Product features (documents, RAG, chat,
          citations) will arrive in later phases.
        </p>
        <p>
          Contract sample status: <strong>{status}</strong>
        </p>
        <p style={{ marginBottom: 0 }}>
          Health check:{' '}
          <a href="http://localhost:3001/health" rel="noreferrer">
            API /health
          </a>
        </p>
      </section>
    </main>
  );
}
