from pathlib import Path
import re
path = Path(''app.js'')
text = path.read_text(encoding='utf-8')
new_block = '''function Filters({
  filters,
  setFilters,
  onSubmit,
  loading,
  domains,
  domainsLoading,
}) {
  const update = (key, value) =>
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));

  return html`
    <section className="card">
      <div className="card-head">
        <div>
          <span className="eyebrow">Filtros</span>
          <h2 className="section-title">Janela e segmentação</h2>
        </div>
        <button className="ghost" onClick=${onSubmit} disabled=${loading}>
          ${loading ? "Carregando..." : "Carregar dados"}
        </button>
      </div>
      <div className="filters">
        <label className="field">
          <span>Início</span>
          <input
            type="date"
            value=${filters.startDate}
            onChange=${(e) => update("startDate", e.target.value)}
          />
        </label>
        <label className="field">
          <span>Fim</span>
          <input
            type="date"
            value=${filters.endDate}
            onChange=${(e) => update("endDate", e.target.value)}
          />
        </label>
        <label className="field">
          <span>Domínio *</span>
          ${domains && domains.length > 0
            ? html`
                <select
                  value=${filters.domain}
                  onChange=${(e) => update("domain", e.target.value)}
                  disabled=${domainsLoading}
                >
                  <option value="">Selecione</option>
                  ${domains.map(
                    (d) => html`
                      <option value=${d} key=${d}>
                        ${d}
                      </option>
                    `
                  )}
                </select>
              `
            : html`
                <input
                  type="text"
                  placeholder="ex: exemplo.com.br"
                  value=${filters.domain}
                  onChange=${(e) => update("domain", e.target.value)}
                />
              `}
          ${domainsLoading
            ? html`<span className="muted small">Carregando domínios…</span>`
            : null}
        </label>
        <label className="field">
          <span>Custom key</span>
          <input
            type="text"
            value=${filters.customKey}
            placeholder="utm_campaign"
            onChange=${(e) => update("customKey", e.target.value)}
          />
        </label>
        <label className="field">
          <span>Custom value</span>
          <input
            type="text"
            value=${filters.customValue}
            placeholder="opcional"
            onChange=${(e) => update("customValue", e.target.value)}
          />
        </label>
        <label className="field">
          <span>Tipo de relatório</span>
          <select
            value=${filters.reportType}
            onChange=${(e) => update("reportType", e.target.value)}
          >
            <option value="Analytical">Analytical</option>
            <option value="Synthetic">Synthetic</option>
          </select>
        </label>
        <label className="field">
          <span>Limite (top URL)</span>
          <input
            type="number"
            min="1"
            max="50"
            value=${filters.topLimit}
            onChange=${(e) => update("topLimit", Number(e.target.value || 5))}
          />
        </label>
        <label className="field">
          <span>Ordenar por</span>
          <select value=${filters.sort} onChange=${(e) => update("sort", e.target.value)}>
            <option value="revenue">Receita</option>
            <option value="impressions">Impressões</option>
            <option value="clicks">Cliques</option>
            <option value="ctr">CTR</option>
            <option value="ecpm">eCPM</option>
          </select>
        </label>
      </div>
      <p className="muted small">
        O token é lido via variável de ambiente JOINADS_ACCESS_TOKEN em /api/*. A chamada é segura no backend da Vercel.
      </p>
    </section>
  `;
}
'''
pattern = r"function Filters\([\s\S]*?\n\}\n\nfunction Status"
new_text, count = re.subn(pattern, new_block + "\n\nfunction Status", text)
if count == 0:
    raise SystemExit('did not replace Filters block')
path.write_text(new_text, encoding='utf-8')
#