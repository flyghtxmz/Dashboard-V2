import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.2.0";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(React.createElement);
const API_BASE = "/api";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const number = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const formatDate = (date) => date.toISOString().slice(0, 10);

const defaultDates = () => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
};

async function fetchJson(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data?.error ||
      data?.message ||
      data?.detail ||
      `Erro na requisição (${res.status})`;
    throw new Error(message);
  }
  return data;
}

function useTotals(superFilter) {
  return useMemo(() => {
    if (!superFilter?.length) {
      return {
        revenue: 0,
        revenueClient: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        ecpm: 0,
        ecpmClient: 0,
        activeView: 0,
      };
    }

    const sum = superFilter.reduce(
      (acc, row) => {
        acc.revenue += Number(row.revenue || 0);
        acc.revenueClient += Number(row.revenue_client || 0);
        acc.impressions += Number(row.impressions || 0);
        acc.clicks += Number(row.clicks || 0);
        acc.ecpm += Number(row.ecpm || 0);
        acc.ecpmClient += Number(row.ecpm_client || 0);
        acc.activeView += Number(row.active_view || 0);
        return acc;
      },
      {
        revenue: 0,
        revenueClient: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        ecpm: 0,
        ecpmClient: 0,
        activeView: 0,
      }
    );

    sum.ctr = sum.impressions ? (sum.clicks / sum.impressions) * 100 : 0;
    sum.ecpm = sum.impressions ? (sum.revenue / sum.impressions) * 1000 : 0;
    sum.ecpmClient = sum.impressions
      ? (sum.revenueClient / sum.impressions) * 1000
      : 0;
    sum.activeView = sum.activeView / superFilter.length;

    return sum;
  }, [superFilter]);
}

function Metrics({ totals }) {
  const items = [
    {
      label: "Receita cliente",
      value: currency.format(totals.revenueClient || 0),
      helper: "Após revshare",
      tone: "primary",
    },
    {
      label: "Receita bruta",
      value: currency.format(totals.revenue || 0),
      helper: "Valor total",
    },
    {
      label: "Impressões",
      value: number.format(totals.impressions || 0),
      helper: "Volume exibido",
    },
    {
      label: "Cliques",
      value: number.format(totals.clicks || 0),
      helper: "Interações",
    },
    {
      label: "CTR",
      value: `${(totals.ctr || 0).toFixed(2)}%`,
      helper: "Cliques / impressões",
    },
    {
      label: "eCPM cliente",
      value: currency.format(totals.ecpmClient || 0),
      helper: "Receita por mil",
    },
    {
      label: "eCPM bruto",
      value: currency.format(totals.ecpm || 0),
      helper: "Antes do revshare",
    },
    {
      label: "Active view",
      value: `${(totals.activeView || 0).toFixed(1)}%`,
      helper: "Visibilidade média",
    },
  ];

  return html`
    <section className="card wide">
      <div className="card-head">
        <div>
          <span className="eyebrow">Performance</span>
          <h2 className="section-title">Visão geral</h2>
        </div>
        <span className="chip neutral">JoinAds</span>
      </div>
      <div className="metrics-grid">
        ${items.map(
          (item) => html`
            <div className="metric-card" data-tone=${item.tone || ""} key=${item.label}>
              <div className="metric-label">${item.label}</div>
              <div className="metric-value">${item.value}</div>
              <div className="metric-helper">${item.helper}</div>
            </div>
          `
        )}
      </div>
    </section>
  `;
}

function KeyValueTable({ rows }) {
  return html`
    <section className="card">
      <div className="card-head">
        <div>
          <span className="eyebrow">Breakdown</span>
          <h2 className="section-title">Receita por key</h2>
        </div>
        <span className="chip up">${rows.length} linhas</span>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Domínio</th>
              <th>Custom value</th>
              <th>Impressões</th>
              <th>Cliques</th>
              <th>Receita bruta</th>
              <th>Receita cliente</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0
              ? html`
                  <tr>
                    <td colSpan="7" className="muted">
                      Nenhum dado retornado para o filtro.
                    </td>
                  </tr>
                `
              : rows.map(
                  (row, idx) => html`
                    <tr key=${`${row.date}-${row.custon_value || row.custom_value || idx}`}>
                      <td>${row.date || "—"}</td>
                      <td>${row.name || row.domain || "—"}</td>
                      <td>${row.custon_value || row.custom_value || "—"}</td>
                      <td>${number.format(row.impressions || 0)}</td>
                      <td>${number.format(row.clicks || 0)}</td>
                      <td>${currency.format(row.earnings || 0)}</td>
                      <td>${currency.format(row.earnings_client || 0)}</td>
                    </tr>
                  `
                )}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function TopUrlTable({ rows }) {
  return html`
    <section className="card">
      <div className="card-head">
        <div>
          <span className="eyebrow">Ranking</span>
          <h2 className="section-title">Top URLs</h2>
        </div>
        <span className="chip neutral">Ordenado</span>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>URL</th>
              <th>Impressões</th>
              <th>Cliques</th>
              <th>CTR</th>
              <th>eCPM</th>
              <th>Receita</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0
              ? html`
                  <tr>
                    <td colSpan="7" className="muted">
                      Sem URLs para este filtro.
                    </td>
                  </tr>
                `
              : rows.map(
                  (row, idx) => html`
                    <tr key=${row.url || idx}>
                      <td>${idx + 1}</td>
                      <td className="url-cell">
                        <div className="url">${row.url || "—"}</div>
                        <div className="muted small">${row.domain || ""}</div>
                      </td>
                      <td>${number.format(row.impressions || 0)}</td>
                      <td>${number.format(row.clicks || 0)}</td>
                      <td>${`${Number(row.ctr || 0).toFixed(2)}%`}</td>
                      <td>${currency.format(row.ecpm || 0)}</td>
                      <td>${currency.format(row.revenue || 0)}</td>
                    </tr>
                  `
                )}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function Filters({
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

function Status({ error, lastRefreshed }) {
  if (error) {
    return html`
      <div className="status error">
        <strong>Erro:</strong> ${error}
      </div>
    `;
  }

  if (lastRefreshed) {
    return html`
      <div className="status ok">
        Atualizado em ${lastRefreshed.toLocaleString("pt-BR")}
      </div>
    `;
  }

  return html`
    <div className="status neutral">
      Informe domínio e clique em "Carregar dados".
    </div>
  `;
}

function DomainList({ domains, loading, onReload, error }) {
  return html`
    <section className="card">
      <div className="card-head">
        <div>
          <span className="eyebrow">Token</span>
          <h2 className="section-title">Domínios disponíveis</h2>
        </div>
        <button className="ghost" onClick=${onReload} disabled=${loading}>
          ${loading ? "Buscando..." : "Listar"}
        </button>
      </div>
      ${error
        ? html`
            <div className="status error">
              <strong>Erro:</strong> ${error}
            </div>
          `
        : domains.length === 0
        ? html`<p className="muted small">Clique em "Listar" para ver os domínios deste token.</p>`
        : html`
            <div className="domains-grid">
              ${domains.map(
                (domain) => html`<span className="domain-chip" key=${domain}>${domain}</span>`
              )}
            </div>
          `}
    </section>
  `;
}

function App() {
  const [filters, setFilters] = useState({
    ...defaultDates(),
    domain: "",
    reportType: "Analytical",
    customKey: "utm_campaign",
    customValue: "",
    topLimit: 5,
    sort: "revenue",
  });
  const [keyValue, setKeyValue] = useState([]);
  const [superFilter, setSuperFilter] = useState([]);
  const [topUrls, setTopUrls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [domains, setDomains] = useState([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [domainsError, setDomainsError] = useState("");

  const totals = useTotals(superFilter);

  const handleLoad = async () => {
    if (!filters.domain.trim()) {
      setError("Informe o domínio para consultar.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const keyParams = new URLSearchParams();
      keyParams.set("start_date", filters.startDate);
      keyParams.set("end_date", filters.endDate);
      keyParams.set("domain", filters.domain.trim());
      keyParams.set("report_type", filters.reportType);
      keyParams.set("custom_key", filters.customKey || "utm_campaign");
      if (filters.customValue) {
        keyParams.set("custom_value", filters.customValue);
      }

      const topParams = new URLSearchParams();
      topParams.set("start_date", filters.startDate);
      topParams.set("end_date", filters.endDate);
      topParams.append("domain[]", filters.domain.trim());
      topParams.set("limit", filters.topLimit || 5);
      topParams.set("sort", filters.sort);

      const [keyRes, superRes, topRes] = await Promise.all([
        fetchJson(`${API_BASE}/key-value?${keyParams.toString()}`),
        fetchJson(`${API_BASE}/super-filter`, {
          method: "POST",
          body: JSON.stringify({
            start_date: filters.startDate,
            end_date: filters.endDate,
            domain: [filters.domain.trim()],
            custom_key: filters.customKey || undefined,
            custom_value: filters.customValue || undefined,
            group: [],
          }),
        }),
        fetchJson(`${API_BASE}/top-url?${topParams.toString()}`),
      ]);

      setKeyValue(keyRes.data || []);
      setSuperFilter(superRes.data || []);
      setTopUrls(topRes.data || []);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err.message || "Erro ao buscar dados.");
      setKeyValue([]);
      setSuperFilter([]);
      setTopUrls([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDomains = async () => {
    setDomainsLoading(true);
    setDomainsError("");
    try {
      const params = new URLSearchParams();
      params.set("start_date", filters.startDate);
      params.set("end_date", filters.endDate);
      const res = await fetchJson(`${API_BASE}/domains?${params.toString()}`);
      const list = res.data || [];
      setDomains(list);
      if (!filters.domain && list.length > 0) {
        setFilters((prev) => ({ ...prev, domain: list[0] }));
      }
    } catch (err) {
      setDomainsError(err.message || "Erro ao listar domínios.");
      setDomains([]);
    } finally {
      setDomainsLoading(false);
    }
  };

  useEffect(() => {
    handleLoadDomains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return html`
    <div className="layout">
      <header className="topbar">
        <div>
          <h1>Dashboard de Publisher</h1>
          <p className="subtitle">
            Arbitragem de tráfego com dados em tempo real da JoinAds.
          </p>
        </div>
        <div className="actions">
          <button className="ghost" onClick=${handleLoad} disabled=${loading}>
            ${loading ? "Atualizando..." : "Atualizar"}
          </button>
          <button className="primary" disabled>
            Exportar CSV (breve)
          </button>
        </div>
      </header>

      ${html`<${Status} error=${error} lastRefreshed=${lastRefreshed} />`}

      ${html`
        <${Filters}
          filters=${filters}
          setFilters=${setFilters}
          onSubmit=${handleLoad}
          loading=${loading}
          domains=${domains}
          domainsLoading=${domainsLoading}
        />
      `}

      ${html`
        <${DomainList}
          domains=${domains}
          loading=${domainsLoading}
          onReload=${handleLoadDomains}
          error=${domainsError}
        />
      `}

      <main className="grid">
        ${html`<${Metrics} totals=${totals} />`}
        ${html`<${KeyValueTable} rows=${keyValue} />`}
        ${html`<${TopUrlTable} rows=${topUrls} />`}
      </main>
    </div>
  `;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(html`<${App} />`);
}
