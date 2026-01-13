import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.2.0";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(React.createElement);
const API_BASE = "/api";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const number = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

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
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
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

function formatError(err) {
  if (!err) return "Erro inesperado";
  if (err.data) {
    if (typeof err.data === "string") return err.data;
    if (err.data.error) return err.data.error;
    if (err.data.message) return err.data.message;
    if (err.data.detail) return err.data.detail;
  }
  return err.message || "Erro inesperado";
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

function EarningsTable({ rows }) {
  return html`
    <section className="card wide">
      <div className="card-head">
        <div>
          <span className="eyebrow">Earnings</span>
          <h2 className="section-title">Relatório de ganhos</h2>
        </div>
        <span className="chip neutral">${rows.length} linhas</span>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Domínio</th>
              <th>Impressões</th>
              <th>Cliques</th>
              <th>CTR</th>
              <th>eCPM</th>
              <th>Receita cliente</th>
              <th>Active view</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0
              ? html`
                  <tr>
                    <td colSpan="8" className="muted">Sem dados de ganhos.</td>
                  </tr>
                `
              : rows.map(
                  (row, idx) => html`
                    <tr key=${row.date || idx}>
                      <td>${row.date || "—"}</td>
                      <td>${row.domain || "—"}</td>
                      <td>${number.format(row.impressions || 0)}</td>
                      <td>${number.format(row.clicks || 0)}</td>
                      <td>${`${Number(row.ctr || 0).toFixed(2)}%`}</td>
                      <td>${currency.format(row.ecpm || 0)}</td>
                      <td>${currency.format(row.revenue_client || 0)}</td>
                      <td>${`${Number(row.active_view || 0).toFixed(2)}%`}</td>
                    </tr>
                  `
                )}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function PerformanceTable({ rows }) {
  return html`
    <section className="card">
      <div className="card-head">
        <div>
          <span className="eyebrow">Performance</span>
          <h2 className="section-title">Resumo por domínio</h2>
        </div>
        <span className="chip neutral">${rows.length} linhas</span>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Domínio</th>
              <th>Impressões</th>
              <th>Cliques</th>
              <th>CTR</th>
              <th>eCPM</th>
              <th>Receita</th>
              <th>Receita cliente</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0
              ? html`
                  <tr>
                    <td colSpan="7" className="muted">Sem dados para o período.</td>
                  </tr>
                `
              : rows.map(
                  (row, idx) => html`
                    <tr key=${row.domain || idx}>
                      <td>${row.domain || "—"}</td>
                      <td>${number.format(row.impressions || 0)}</td>
                      <td>${number.format(row.clicks || 0)}</td>
                      <td>${`${Number(row.ctr || 0).toFixed(2)}%`}</td>
                      <td>${currency.format(row.ecpm || 0)}</td>
                      <td>${currency.format(row.revenue || 0)}</td>
                      <td>${currency.format(row.revenue_client || 0)}</td>
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
  const setDate = (key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      // Garantir intervalo válido: se início ultrapassar fim, alinhar fim = início
      if (key === "startDate" && value > prev.endDate) {
        next.endDate = value;
      }
      // Se fim for antes de início, alinhar início = fim
      if (key === "endDate" && value < prev.startDate) {
        next.startDate = value;
      }
      return next;
    });
  };

  const setPreset = (daysAgo) => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - daysAgo);
    const start = new Date(end);
    const startStr = formatDate(start);
    const endStr = formatDate(end);
    setFilters((prev) => ({
      ...prev,
      startDate: startStr,
      endDate: endStr,
    }));
  };

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
            onChange=${(e) => setDate("startDate", e.target.value)}
          />
        </label>
        <label className="field">
          <span>Fim</span>
          <input
            type="date"
            value=${filters.endDate}
            onChange=${(e) => setDate("endDate", e.target.value)}
          />
        </label>
        <label className="field">
          <span>Domínio *</span>
          ${domains && domains.length > 0
            ? html`
                <select
                  value=${filters.domain}
                  onChange=${(e) => setFilters((p) => ({ ...p, domain: e.target.value }))}
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
                  onChange=${(e) => setFilters((p) => ({ ...p, domain: e.target.value }))}
                />
              `}
          ${domainsLoading
            ? html`<span className="muted small">Carregando domínios…</span>`
            : null}
        </label>
        <label className="field">
          <span>Tipo de relatório</span>
          <select
            value=${filters.reportType}
            onChange=${(e) => setFilters((p) => ({ ...p, reportType: e.target.value }))}
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
            onChange=${(e) =>
              setFilters((p) => ({ ...p, topLimit: Number(e.target.value || 5) }))}
          />
        </label>
        <label className="field">
          <span>Ordenar por</span>
          <select
            value=${filters.sort}
            onChange=${(e) => setFilters((p) => ({ ...p, sort: e.target.value }))}
          >
            <option value="revenue">Receita</option>
            <option value="impressions">Impressões</option>
            <option value="clicks">Cliques</option>
            <option value="ctr">CTR</option>
            <option value="ecpm">eCPM</option>
          </select>
        </label>
      </div>
      <div className="actions presets">
        <span className="muted small">Atalhos:</span>
        <button className="ghost" onClick=${() => setPreset(0)} disabled=${loading}>
          Hoje
        </button>
        <button className="ghost" onClick=${() => setPreset(1)} disabled=${loading}>
          Ontem
        </button>
        <button className="ghost" onClick=${() => setPreset(6)} disabled=${loading}>
          Últimos 7 dias
        </button>
      </div>
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

function LogsCard({ logs, onClear }) {
  return html`
    <section className="card">
      <div className="card-head">
        <div>
          <span className="eyebrow">Logs</span>
          <h2 className="section-title">Últimas mensagens</h2>
        </div>
        <button className="ghost" onClick=${onClear} disabled=${logs.length === 0}>
          Limpar
        </button>
      </div>
      ${logs.length === 0
        ? html`<p className="muted small">Sem logs ainda.</p>`
        : html`
            <div className="logs">
              ${logs.map(
                (entry, idx) => html`
                  <div className="log-line" key=${idx}>
                    <div className="log-meta">
                      <span className="pill neutral">${entry.source || "app"}</span>
                      <span className="muted small">
                        ${entry.time.toLocaleString("pt-BR")}
                        ${entry.status ? ` · ${entry.status}` : ""}
                      </span>
                    </div>
                    <div className="log-message">${entry.message}</div>
                    ${entry.detail
                      ? html`<pre className="log-detail">${JSON.stringify(entry.detail)}</pre>`
                      : null}
                  </div>
                `
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
    topLimit: 5,
    sort: "revenue",
  });
  const [superFilter, setSuperFilter] = useState([]);
  const [topUrls, setTopUrls] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [domains, setDomains] = useState([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  const totals = useTotals(superFilter);
  const pushLog = (source, err) => {
    const entry = {
      time: new Date(),
      source,
      message: formatError(err),
      detail: err?.data || null,
      status: err?.status,
    };
    setLogs((prev) => [entry, ...prev].slice(0, 50));
  };

  const handleLoad = async () => {
    if (domainsLoading && !filters.domain.trim()) {
      setError("Aguarde carregar os domínios ou selecione manualmente.");
      return;
    }

    if (!filters.domain.trim()) {
      setError("Selecione um domínio para consultar.");
      return;
    }

    if (!domainsLoading && domains.length === 0 && !filters.domain.trim()) {
      setError("Nenhum domínio retornado para este token/período.");
      return;
    }

    // Restringir intervalo a 15 dias conforme docs JoinAds
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 15) {
      setError("Intervalo máximo permitido é de 15 dias.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const keyParams = new URLSearchParams();
      const topParams = new URLSearchParams();
      topParams.set("start_date", filters.startDate);
      topParams.set("end_date", filters.endDate);
      topParams.append("domain[]", filters.domain.trim());
      topParams.set("limit", filters.topLimit || 5);
      topParams.set("sort", filters.sort);

      const [superRes, topRes, earningsRes] = await Promise.all([
        fetchJson(`${API_BASE}/super-filter`, {
          method: "POST",
          body: JSON.stringify({
            start_date: filters.startDate,
            end_date: filters.endDate,
            // Alguns ambientes exigem domain[]; enviamos nos dois formatos
            domain: [filters.domain.trim()],
            "domain[]": [filters.domain.trim()],
            group: ["domain"],
          }),
        }),
        fetchJson(`${API_BASE}/top-url?${topParams.toString()}`),
        fetchJson(
          `${API_BASE}/earnings?${new URLSearchParams({
            start_date: filters.startDate,
            end_date: filters.endDate,
            domain: filters.domain.trim(),
          }).toString()}`
        ),
      ]);

      setSuperFilter(superRes.data || []);
      setTopUrls(topRes.data || []);
      setEarnings(earningsRes.data || []);
      setLastRefreshed(new Date());
    } catch (err) {
      const msg = formatError(err) || "Erro ao buscar dados.";
      setError(msg);
      pushLog("load", err);
      setSuperFilter([]);
      setTopUrls([]);
      setEarnings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDomains = async () => {
    setDomainsLoading(true);
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
      const msg = formatError(err) || "Erro ao listar domínios.";
      setError(msg);
      pushLog("domains", err);
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
          <button
            className="ghost"
            onClick=${handleLoad}
            disabled=${loading || !filters.domain}
          >
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

      ${html`<${LogsCard} logs=${logs} onClear=${() => setLogs([])} />`}

      <main className="grid">
        ${html`<${Metrics} totals=${totals} />`}
        ${html`<${EarningsTable} rows=${earnings} />`}
        ${html`<${PerformanceTable} rows=${superFilter} />`}
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

