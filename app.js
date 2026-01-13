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
const currencyBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
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
      `Erro na requisicao (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

function useTotalsFromEarnings(earnings, fallbackSuper) {
  return useMemo(() => {
    const source = earnings?.length ? earnings : fallbackSuper || [];
    if (!source.length) {
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

    const sum = source.reduce(
      (acc, row) => {
        acc.revenue += Number(row.revenue || row.revenue_client || 0);
        acc.revenueClient += Number(row.revenue_client || 0);
        acc.impressions += Number(row.impressions || 0);
        acc.clicks += Number(row.clicks || 0);
        acc.ecpm += Number(row.ecpm || 0);
        acc.ecpmClient += Number(row.ecpm_client || row.ecpm || 0);
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
    sum.activeView = sum.activeView / source.length;

    return sum;
  }, [earnings, fallbackSuper]);
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
      helper: "Apos revshare",
      tone: "primary",
    },
    {
      label: "Receita bruta",
      value: currency.format(totals.revenue || 0),
      helper: "Valor total",
    },
    {
      label: "Impressoes",
      value: number.format(totals.impressions || 0),
      helper: "Volume exibido",
    },
    {
      label: "Cliques",
      value: number.format(totals.clicks || 0),
      helper: "Interacoes",
    },
    {
      label: "CTR",
      value: `${(totals.ctr || 0).toFixed(2)}%`,
      helper: "Cliques / impressoes",
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
      helper: "Visibilidade media",
    },
  ];

  return html`
    <section className="card wide">
      <div className="card-head">
        <div>
          <span className="eyebrow">Performance</span>
          <h2 className="section-title">Visao geral</h2>
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
              <th>Impressoes</th>
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
          <h2 className="section-title">Relatorio de ganhos</h2>
        </div>
        <span className="chip neutral">${rows.length} linhas</span>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Dominio</th>
              <th>Impressoes</th>
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
    <section className="card wide">
      <div className="card-head">
        <div>
          <span className="eyebrow">Performance</span>
          <h2 className="section-title">Resumo por dominio</h2>
        </div>
        <span className="chip neutral">${rows.length} linhas</span>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Dominio</th>
              <th>Impressoes</th>
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
                    <td colSpan="7" className="muted">Sem dados para o periodo.</td>
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
      // Garantir intervalo valido: se inicio ultrapassar fim, alinhar fim = inicio
      if (key === "startDate" && value > prev.endDate) {
        next.endDate = value;
      }
      // Se fim for antes de inicio, alinhar inicio = fim
      if (key === "endDate" && value < prev.startDate) {
        next.startDate = value;
      }
      return next;
    });
  };

  const setPreset = (preset) => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    let start = new Date(end);

    if (preset === "today") {
      // nada a fazer, usa hoje
    } else if (preset === "yesterday") {
      end.setDate(end.getDate() - 1);
      start = new Date(end);
    } else if (preset === "last7") {
      start.setDate(end.getDate() - 6);
    }

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
          <h2 className="section-title">Janela e segmentacao</h2>
        </div>
        <button className="ghost" onClick=${onSubmit} disabled=${loading}>
          ${loading ? "Carregando..." : "Carregar dados"}
        </button>
      </div>
      <div className="filters">
        <label className="field">
          <span>Inicio</span>
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
          <span>Dominio *</span>
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
            ? html`<span className="muted small">Carregando dominios…</span>`
            : null}
        </label>
        <label className="field">
          <span>ID da conta Meta *</span>
          <input
            type="text"
            placeholder="ex: act_123456789"
            value=${filters.metaAccountId || ""}
            onChange=${(e) => setFilters((p) => ({ ...p, metaAccountId: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>Tipo de relatorio</span>
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
            <option value="impressions">Impressoes</option>
            <option value="clicks">Cliques</option>
            <option value="ctr">CTR</option>
            <option value="ecpm">eCPM</option>
          </select>
        </label>
      </div>
      <div className="actions presets">
        <span className="muted small">Atalhos:</span>
        <button className="ghost" onClick=${() => setPreset("today")} disabled=${loading}>
          Hoje
        </button>
        <button className="ghost" onClick=${() => setPreset("yesterday")} disabled=${loading}>
          Ontem
        </button>
        <button className="ghost" onClick=${() => setPreset("last7")} disabled=${loading}>
          Ultimos 7 dias
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
      Informe dominio e clique em "Carregar dados".
    </div>
  `;
}

function LogsCard({ logs, onClear }) {
  return html`
    <section className="card">
      <div className="card-head">
        <div>
          <span className="eyebrow">Logs</span>
          <h2 className="section-title">Ultimas mensagens</h2>
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

function MetaJoinTable({ rows }) {
  const asText = (value) => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return html`
    <section className="card wide">
      <div className="card-head">
        <div>
          <span className="eyebrow">Meta x JoinAds</span>
          <h2 className="section-title">Campanhas</h2>
        </div>
        <span className="chip neutral">${rows.length} linhas</span>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo (campanha)</th>
              <th>Conjunto</th>
              <th>Anuncio</th>
              <th>Custo por resultado</th>
              <th>Valor gasto</th>
              <th>eCPM JoinAds (cliente)</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0
              ? html`
                  <tr>
                    <td colSpan="7" className="muted">Sem dados para o periodo.</td>
                  </tr>
                `
              : rows.map(
                  (row, idx) => html`
                    <tr key=${idx}>
                      <td>${asText(row.date)}</td>
                      <td>${asText(row.objective)}</td>
                      <td>${asText(row.adset_name)}</td>
                      <td>${asText(row.ad_name)}</td>
                      <td>${asText(row.cost_per_result)}</td>
                      <td>${asText(row.spend_brl)}</td>
                      <td>
                        ${row.ecpm_client != null
                          ? asText(row.ecpm_client)
                          : "—"}
                      </td>
                    </tr>
                  `
                )}
          </tbody>
        </table>
      </div>
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
    metaAccountId: "act_728792692620145",
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
  const [metaRows, setMetaRows] = useState([]);
  const [usdBrl, setUsdBrl] = useState(null);

  const totals = useTotalsFromEarnings(earnings, superFilter);
  const brlRate = usdBrl || 0;
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
      setError("Aguarde carregar os dominios ou selecione manualmente.");
      return;
    }

    if (!filters.domain.trim()) {
      setError("Selecione um dominio para consultar.");
      return;
    }

    if (!domainsLoading && domains.length === 0 && !filters.domain.trim()) {
      setError("Nenhum dominio retornado para este token/periodo.");
      return;
    }

    if (!filters.metaAccountId.trim()) {
      setError("Informe o ID da conta de anuncios (Meta).");
      return;
    }

    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 15) {
      setError("Intervalo maximo permitido e de 15 dias.");
      return;
    }

    setLoading(true);
    setError("");

    try {
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
            "domain[]": [filters.domain.trim()],
            custom_key: "utm_campaign",
            group: ["domain", "custom_value"],
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

      try {
        const metaRes = await fetchJson(
          `${API_BASE}/meta-insights?${new URLSearchParams({
            account_id: filters.metaAccountId.trim(),
            start_date: filters.startDate,
            end_date: filters.endDate,
          }).toString()}`
        );
        setMetaRows(metaRes.data || []);
      } catch (err) {
        pushLog("meta", err);
        setMetaRows([]);
      }

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
      setMetaRows([]);
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
      const msg = formatError(err) || "Erro ao listar dominios.";
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

  const mergedMeta = useMemo(() => {
    if (!metaRows?.length) return [];

    const earningsByDate = {};
    (earnings || []).forEach((row) => {
      const parts = (row.date || "").split("/");
      let iso = row.date;
      if (parts.length === 3) {
        iso = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      earningsByDate[iso] = row;
    });

    const superByCustom = {};
    (superFilter || []).forEach((row) => {
      if (row.custom_value) {
        superByCustom[row.custom_value] = row;
      }
    });

    return metaRows.map((row) => {
      const date = row.date_start || row.date || "";
      const join = earningsByDate[date] || {};
      const fromCustom = superByCustom[row.adset_name || ""] || {};
      const ecpmClient =
        fromCustom.ecpm_client ??
        fromCustom.ecpm ??
        join.ecpm_client ??
        join.ecpm ??
        null;

      const cost = toNumber(row.cost_per_result);
      const spend = toNumber(row.spend);

      return {
        ...row,
        date,
        cost_per_result: brlRate ? currencyBRL.format(cost * brlRate) : currency.format(cost),
        spend_brl: brlRate ? currencyBRL.format(spend * brlRate) : currency.format(spend),
        ecpm_client: ecpmClient != null ? currency.format(Number(ecpmClient)) : null,
      };
    });
  }, [metaRows, earnings, superFilter, brlRate]);

  useEffect(() => {
    fetch("https://open.er-api.com/v6/latest/USD")
      .then((r) => r.json())
      .then((data) => {
        const rate = data?.rates?.BRL;
        if (rate) setUsdBrl(rate);
      })
      .catch((err) => pushLog("dollar", err));
  }, []);

  return html`
    <div className="layout">
      <header className="topbar">
        <div>
          <h1>Dashboard de Publisher</h1>
          <p className="subtitle">
            Arbitragem de trafego com dados em tempo real da JoinAds.
          </p>
        </div>
        <div className="actions">
          <div className="muted small">
            ${usdBrl ? `USD hoje: R$ ${usdBrl.toFixed(2)}` : "Atualizando cotacao..."}
          </div>
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
        ${html`<${PerformanceTable} rows=${superFilter} />`}
        ${html`<${TopUrlTable} rows=${topUrls} />`}
        ${html`<${EarningsTable} rows=${earnings} />`}
        ${html`<${TopUrlTable} rows=${topUrls} />`}
        ${html`<${MetaJoinTable} rows=${mergedMeta} />`}
      </main>
    </div>
  `;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(html`<${App} />`);
}
function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value.replace?.(",", ".") || value);
    return Number.isNaN(n) ? 0 : n;
  }
  if (Array.isArray(value)) {
    return value.length ? toNumber(value[0]) : 0;
  }
  if (typeof value === "object" && value.value !== undefined) {
    return toNumber(value.value);
  }
  return 0;
}
