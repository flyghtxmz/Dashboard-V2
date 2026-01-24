import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.2.0";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(React.createElement);
const API_BASE = "/api";

const currencyUSD = new Intl.NumberFormat("en-US", {
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
  const today = new Date();
  return {
    startDate: formatDate(today),
    endDate: formatDate(today),
  };
};

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
  if (
    typeof value === "object" &&
    Array.isArray(value.values) &&
    value.values.length
  ) {
    return toNumber(value.values[0].value);
  }
  return 0;
}

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

function useTotalsFromEarnings(earnings, fallbackSuper) {
  return useMemo(() => {
    const fb = Array.isArray(fallbackSuper) ? fallbackSuper : [];
    const source = earnings?.length ? earnings : fb;
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

function Metrics({ totals, usdToBrl, metaSpendBrl }) {
  const revenueClientBrl =
    usdToBrl && totals.revenueClient != null
      ? (totals.revenueClient || 0) * usdToBrl
      : null;
  const roiPct =
    revenueClientBrl != null && metaSpendBrl > 0
      ? ((revenueClientBrl - metaSpendBrl) / metaSpendBrl) * 100
      : null;
  const roas =
    revenueClientBrl != null && metaSpendBrl > 0
      ? revenueClientBrl / metaSpendBrl
      : null;

  const items = [
    {
      label: "Receita cliente",
      value: currencyUSD.format(totals.revenueClient || 0),
      helper: "Após revshare",
      tone: "primary",
    },
    {
      label: "Receita cliente (BRL)",
      value: revenueClientBrl != null ? currencyBRL.format(revenueClientBrl) : "-",
      helper: usdToBrl ? "Conversão USD->BRL" : "Aguardando cotação",
      tone: "primary",
    },
    {
      label: "Valor gasto (Meta)",
      value: currencyBRL.format(metaSpendBrl || 0),
      helper: "Gasto total do período",
    },
    {
      label: "ROI (BRL)",
      value: roiPct != null ? `${roiPct.toFixed(1)}%` : "-",
      helper: "((Receita BRL - gasto) / gasto)",
      tone: "primary",
    },
    {
      label: "ROAS (BRL)",
      value: roas != null ? `${roas.toFixed(2)}x` : "-",
      helper: "Receita BRL / gasto",
      tone: "primary",
    },
    {
      label: "Receita bruta",
      value: currencyUSD.format(totals.revenue || 0),
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
      helper: "Interações",
    },
    {
      label: "CTR",
      value: `${(totals.ctr || 0).toFixed(2)}%`,
      helper: "Cliques / Impressoes",
    },
    {
      label: "eCPM cliente",
      value: currencyUSD.format(totals.ecpmClient || 0),
      helper: "Receita por mil",
    },
    {
      label: "eCPM bruto",
      value: currencyUSD.format(totals.ecpm || 0),
      helper: "Antes do revshare",
    },
    {
      label: "Active view",
      value: `${(totals.activeView || 0).toFixed(1)}%`,
      helper: "Visibilidade mídia",
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
      <div className="table-wrapper scroll-x">
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
                      <td>${row.date || "-"}</td>
                      <td>${row.domain || "-"}</td>
                      <td>${number.format(row.impressions || 0)}</td>
                      <td>${number.format(row.clicks || 0)}</td>
                      <td>${`${Number(row.ctr || 0).toFixed(2)}%`}</td>
                      <td>${currencyUSD.format(row.ecpm || 0)}</td>
                      <td>${currencyUSD.format(row.revenue_client || 0)}</td>
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
      if (key === "startDate" && value > prev.endDate) {
        next.endDate = value;
      }
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
      // mantém hoje
    } else if (preset === "yesterday") {
      end.setDate(end.getDate() - 1);
      start = new Date(end);
    } else if (preset === "last7") {
      start.setDate(end.getDate() - 6);
    } else if (preset === "last15") {
      start.setDate(end.getDate() - 14);
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
          <span>Dominio *</span>
          ${domains && domains.length > 0
            ? html`
                <select
                  value=${filters.domain}
                  onChange=${(e) =>
                    setFilters((p) => ({ ...p, domain: e.target.value }))}
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
                  placeholder="ex.: exemplo.com.br"
                  value=${filters.domain}
                  onChange=${(e) =>
                    setFilters((p) => ({ ...p, domain: e.target.value }))}
                />
              `}
          ${domainsLoading
            ? html`<span className="muted small">Carregando Dominios...</span>`
            : null}
        </label>
        <label className="field">
          <span>ID da conta Meta *</span>
          <input
            type="text"
            placeholder="ex.: act_123456789"
            value=${filters.metaAccountId || ""}
            onChange=${(e) =>
              setFilters((p) => ({ ...p, metaAccountId: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>Tipo de relatório</span>
          <select
            value=${filters.reportType}
            onChange=${(e) =>
              setFilters((p) => ({ ...p, reportType: e.target.value }))}
          >
            <option value="Analytical">Analytical</option>
            <option value="Synthetic">Synthetic</option>
          </select>
        </label>
      </div>
      <div className="actions presets">
        <span className="muted small">Atalhos:</span>
        <button className="ghost" onClick=${() => setPreset("today")} disabled=${loading}>
          Hoje
        </button>
        <button
          className="ghost"
          onClick=${() => setPreset("yesterday")}
          disabled=${loading}
        >
          Ontem
        </button>
        <button className="ghost" onClick=${() => setPreset("last7")} disabled=${loading}>
          Últimos 7 dias
        </button>
        <button className="ghost" onClick=${() => setPreset("last15")} disabled=${loading}>
          Últimos 15 dias
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
      Informe o Dominio e clique em "Carregar dados".
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
                        ${entry.status ? ` • ${entry.status}` : ""}
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

function TopUrlTable({ rows, totals }) {
  return html`
    <section className="card wide">
      <div className="card-head">
        <div>
          <span className="eyebrow">URLs</span>
          <h2 className="section-title">Top URLs com Parâmetros</h2>
        </div>
        <span className="chip neutral">${rows.length} itens</span>
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
                      Nenhuma URL para este filtro.
                    </td>
                  </tr>
                `
              : rows.map(
                  (row, idx) => html`
                    <tr key=${row.url || idx}>
                      <td>${idx + 1}</td>
                      <td className="url-cell">
                        <div className="url">${row.url || "-"}</div>
                        <div className="muted small">${row.domain || ""}</div>
                      </td>
                      <td>${number.format(row.impressions || 0)}</td>
                      <td>${number.format(row.clicks || 0)}</td>
                      <td>${`${Number(row.ctr || 0).toFixed(2)}%`}</td>
                      <td>${currencyUSD.format(row.ecpm || 0)}</td>
                      <td>${currencyUSD.format(row.revenue || 0)}</td>
                    </tr>
                  `
                )}
            ${rows.length
              ? html`
                  <tr className="summary-row">
                    <td colSpan="2"><strong>Totais</strong></td>
                    <td><strong>${number.format(totals.impressions || 0)}</strong></td>
                    <td><strong>${number.format(totals.clicks || 0)}</strong></td>
                    <td><strong>${`${Number(totals.ctr || 0).toFixed(2)}%`}</strong></td>
                    <td><strong>${currencyUSD.format(totals.ecpm || 0)}</strong></td>
                    <td><strong>${currencyUSD.format(totals.revenue || 0)}</strong></td>
                  </tr>
                `
              : null}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function ParamTable({ rows }) {
  return html`
    <section className="card">
      <div className="card-head">
        <div>
          <span className="eyebrow">Parâmetros</span>
          <h2 className="section-title">UTMs e query params vistos</h2>
        </div>
        <span className="chip neutral">${rows.length} pares</span>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Chave</th>
              <th>Valor</th>
              <th>Impressoes</th>
              <th>Cliques</th>
              <th>Receita cliente</th>
              <th>Ocorrências</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0
              ? html`
                  <tr>
                    <td colSpan="3" className="muted">
                      Nenhum parâmetro encontrado neste intervalo.
                    </td>
                  </tr>
                `
              : rows.map(
                  (row, idx) => html`
                    <tr key=${idx}>
                      <td>${row.key}</td>
                      <td>${row.value}</td>
                      <td>${number.format(row.impressions || 0)}</td>
                      <td>${number.format(row.clicks || 0)}</td>
                      <td>${currencyUSD.format(row.revenue || 0)}</td>
                      <td>${number.format(row.count || 0)}</td>
                    </tr>
                  `
                )}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function DiagnosticsJoin({
  superRows,
  kvRows,
  earnings,
  topUrls,
  domain,
  superKey,
}) {
  const superCount = Array.isArray(superRows) ? superRows.length : 0;
  const kvCount = Array.isArray(kvRows) ? kvRows.length : 0;
  const earningsCount = Array.isArray(earnings) ? earnings.length : 0;
  const topCount = Array.isArray(topUrls) ? topUrls.length : 0;

  return html`
    <section className="card wide">
      <div className="card-head">
        <div>
          <span className="eyebrow">JoinAds</span>
          <h2 className="section-title">Diagnóstico do token</h2>
        </div>
        <div className="chip-group">
          <span className="chip neutral">Dominio: ${domain || "-"}</span>
          <span className="chip neutral">super-filter key: ${superKey}</span>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">super-filter (linhas)</div>
          <div className="metric-value">${superCount}</div>
          <div className="metric-helper">custom_key=${superKey}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">key-value (linhas)</div>
          <div className="metric-value">${kvCount}</div>
          <div className="metric-helper">utm_campaign</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">earnings (linhas)</div>
          <div className="metric-value">${earningsCount}</div>
          <div className="metric-helper">/earnings</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">top-url (linhas)</div>
          <div className="metric-value">${topCount}</div>
          <div className="metric-helper">/top-url</div>
        </div>
      </div>

      <div className="table-wrapper" style=${{ marginTop: "12px" }}>
        <table>
          <thead>
            <tr>
              <th>Fonte</th>
              <th>Dominio</th>
              <th>Chave</th>
              <th>Impressoes</th>
              <th>Cliques</th>
              <th>Receita cliente</th>
              <th>eCPM cliente</th>
            </tr>
          </thead>
          <tbody>
            ${kvCount === 0 && superCount === 0
              ? html`<tr><td colSpan="7" className="muted">Sem dados retornados.</td></tr>`
              : html`
                  ${superRows?.slice(0, 20).map(
                    (row, idx) => html`
                      <tr key=${`s-${idx}`}>
                        <td>super-filter</td>
                        <td>${row.domain || "-"}</td>
                        <td>${row.custom_value || "-"}</td>
                        <td>${number.format(row.impressions || 0)}</td>
                        <td>${number.format(row.clicks || 0)}</td>
                        <td>${currencyUSD.format(row.revenue_client || row.revenue || 0)}</td>
                        <td>${currencyUSD.format(row.ecpm_client || row.ecpm || 0)}</td>
                      </tr>
                    `
                  )}
                  ${kvRows?.slice(0, 20).map(
                    (row, idx) => html`
                      <tr key=${`k-${idx}`}>
                        <td>key-value</td>
                        <td>${row.name || row.domain || "-"}</td>
                        <td>${row.custon_value || row.custom_value || "-"}</td>
                        <td>${number.format(row.impressions || 0)}</td>
                        <td>${number.format(row.clicks || 0)}</td>
                        <td>${currencyUSD.format(row.earnings_client || row.earnings || 0)}</td>
                        <td>${currencyUSD.format(row.ecpm_client || row.ecpm || 0)}</td>
                      </tr>
                    `
                  )}
                `}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Se super-filter estiver vazio, a API não retornou dados para utm_content/utm_campaign.
        Confirme UTMs nos anúncios e intervalo (&lt;=15 dias).
      </p>
    </section>
  `;
}

function DiagnosticsNoUtmSummary({ row }) {
  return html`
    <section className="card wide">
      <div className="card-head">
        <div>
          <span className="eyebrow">JoinAds</span>
          <h2 className="section-title">Sem UTM (estimado)</h2>
        </div>
        <span className="chip neutral">Estimativa via utm_source/utm_medium</span>
      </div>
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Impressões</div>
          <div className="metric-value">${number.format(row?.impressions || 0)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Cliques</div>
          <div className="metric-value">${number.format(row?.clicks || 0)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Receita cliente</div>
          <div className="metric-value">${currencyUSD.format(row?.revenue_client || 0)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">eCPM cliente</div>
          <div className="metric-value">${currencyUSD.format(row?.ecpm_client || 0)}</div>
        </div>
      </div>
    </section>
  `;
}

function MetaSourceTable({ rows }) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.impressions += Number(row.impressions || 0);
      acc.clicks += Number(row.clicks || 0);
      acc.revenue += Number(row.revenue_client || row.revenue || 0);
      return acc;
    },
    { impressions: 0, clicks: 0, revenue: 0 }
  );

  return html`
    <section className="card wide">
      <div className="card-head">
        <div>
          <span className="eyebrow">Fontes</span>
          <h2 className="section-title">Fontes (utm_source/utm_medium)</h2>
        </div>
        <span className="chip neutral">${rows.length} linhas</span>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Dominio</th>
              <th>Fonte (utm_source/utm_medium)</th>
              <th>Impressoes</th>
              <th>Cliques</th>
              <th>Receita cliente</th>
              <th>eCPM cliente</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0
              ? html`<tr><td colSpan="6" className="muted">Sem dados para utm_source (fb/organic/tiktok).</td></tr>`
              : rows.map(
                  (row, idx) => html`
                    <tr key=${idx}>
                      <td>${row.domain || "-"}</td>
                      <td>${row.custom_value || "-"}</td>
                      <td>${number.format(row.impressions || 0)}</td>
                      <td>${number.format(row.clicks || 0)}</td>
                      <td>${currencyUSD.format(row.revenue_client || row.revenue || 0)}</td>
                      <td>${currencyUSD.format(row.ecpm_client || row.ecpm || 0)}</td>
                    </tr>
                  `
                )}
            ${rows.length
              ? html`<tr className="summary-row">
                  <td><strong>Total</strong></td>
                  <td></td>
                  <td><strong>${number.format(totals.impressions)}</strong></td>
                  <td><strong>${number.format(totals.clicks)}</strong></td>
                  <td><strong>${currencyUSD.format(totals.revenue)}</strong></td>
                  <td></td>
                </tr>`
              : null}
          </tbody>
        </table>
      </div>
    </section>
  `;
}
const objectiveMap = {
  OUTCOME_SALES: "Vendas",
  LINK_CLICKS: "Cliques no link",
};
const formatObjective = (value) => objectiveMap[value] || value || "-";
const normalizeKey = (value) =>
  (value ?? "")
    .toString()
    .trim()
    .toLowerCase();

function MetaJoinTable({ rows, adsetFilter, onFilterChange, onToggleAd, statusLoading }) {
  const asText = (value) => {
    if (value === null || value === undefined) return "-";
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
        <div className="chip-group">
          <span className="chip neutral">${rows.length} linhas</span>
          <span
            className=${`chip ${
              rows.find((r) => r.data_level !== "utm_content") ? "warn" : "neutral"
            }`}
          >
            ${
              rows.find((r) => r.data_level !== "utm_content")
                ? "Dados por conjunto (fallback)"
                : "Dados por anuncio"
            }
          </span>
        </div>
      </div>
      <div className="filters">
        <label className="field">
          <span>Filtrar por conjunto</span>
          <input
            type="text"
            placeholder="Digite parte do nome do conjunto"
            value=${adsetFilter}
            onChange=${(e) => onFilterChange(e.target.value)}
          />
        </label>
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
              <th>Resultados (Meta)</th>
              <th>Valor gasto</th>
              <th>ROAS</th>
              <th>Lucro Op (BRL)</th>
              <th>Receita JoinAds (cliente)</th>
              <th>eCPM JoinAds (cliente)</th>
              <th>Impressoes JoinAds</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0
              ? html`
                  <tr>
                    <td colSpan="13" className="muted">Sem dados para o periodo.</td>
                  </tr>
                `
              : rows.map(
                  (row, idx) => {
                    const adLink = row.permalink_url || null;
                    const status = row.ad_status || row.effective_status || "";
                    const isActive = status === "ACTIVE";
                    const busy = statusLoading && statusLoading[row.ad_id];
                    return html`
                    <tr key=${idx}>
                      <td>${asText(row.date)}</td>
                      <td>${formatObjective(row.objective)}</td>
                      <td>${asText(row.adset_name)}</td>
                      <td>
                        ${
                          row.asset_url
                            ? html`<a href=${row.asset_url} target="_blank" rel="noopener noreferrer">${asText(
                                row.ad_name
                              )}</a>`
                            : asText(row.ad_name)
                        }
                      </td>
                      <td>${asText(row.cost_per_result)}</td>
                      <td>
                        ${row.results_meta != null
                          ? number.format(row.results_meta)
                          : "-"}
                      </td>
                      <td>${asText(row.spend_brl)}</td>
                      <td>${row.roas_joinads || "-"}</td>
                      <td>${row.lucro_op_brl || "-"}</td>
                      <td>
                        ${row.revenue_client_joinads != null
                          ? asText(row.revenue_client_joinads)
                          : "-"}
                      </td>
                      <td>
                        ${row.ecpm_client != null ? asText(row.ecpm_client) : "-"}
                      </td>
                      <td>
                        ${row.impressions_joinads != null
                          ? number.format(row.impressions_joinads)
                          : "-"}
                      </td>
                      <td>
                        ${row.ad_id
                          ? html`<button
                              className=${`toggle ${isActive ? "on" : "off"}`}
                              disabled=${busy}
                              onClick=${() =>
                                onToggleAd(
                                  row.ad_id,
                                  isActive ? "PAUSED" : "ACTIVE"
                                )}
                            >
                              ${busy ? "..." : isActive ? "Ligado" : "Desligado"}
                            </button>`
                          : "-"}
                      </td>
                    </tr>
                  `;
                  }
                )}
          </tbody>
        </table>
        ${rows.length
          ? (() => {
              const totalImps = rows.reduce(
                (acc, r) =>
                  acc + (r.impressions_joinads ? Number(r.impressions_joinads) : 0),
                0
              );
              const totalSpend = rows.reduce((acc, r) => acc + toNumber(r.spend_value || r.spend), 0);
              const totalRev = rows.reduce(
                (acc, r) =>
                  acc + (r.revenue_client_value ? Number(r.revenue_client_value) : 0),
                0
              );
              return html`<div className="totals-row">
                <div><strong>Totais</strong></div>
                <div>Impressoes: ${number.format(totalImps)}</div>
                <div>Valor gasto: ${currencyBRL.format(totalSpend)}</div>
                <div>Receita JoinAds: ${currencyUSD.format(totalRev)}</div>
              </div>`;
            })()
          : null}
        ${rows.find((r) => r.data_level !== "utm_content")
          ? html`<div className="muted small" style=${{ marginTop: "8px" }}>
              Alguns valores vieram agregados por conjunto (utm_campaign) por falta de UTM de anuncio.
            </div>`
          : null}
      </div>
    </section>
  `;
}

function MetaJoinGroupedTable({ rows }) {
  const asText = (value) => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const groupedRows = rows.reduce((map, row) => {
    const key = `${row.ad_name || ""}|||${row.adset_name || ""}|||${
      row.objective || ""
    }`;
    if (!map.has(key)) {
      map.set(key, {
        ad_name: row.ad_name,
        adset_name: row.adset_name,
        objective: row.objective,
        spend: 0,
        results: 0,
        impressions: 0,
        revenue_usd: 0,
        revenue_brl: 0,
        hasAdLevel: false,
        joinadsAdded: false,
        fallbackImps: 0,
        fallbackRevenueUsd: 0,
        fallbackRevenueBrl: 0,
      });
    }
    const item = map.get(key);
    item.spend += toNumber(row.spend_value || row.spend);
    item.results += toNumber(row.results_meta);
    const isAdLevel = row.data_level === "utm_content";
    const joinImps = toNumber(row.impressions_joinads);
    const joinUsd = toNumber(row.revenue_client_value);
    const joinBrl = toNumber(row.revenue_client_brl_value);
    if (isAdLevel) {
      item.hasAdLevel = true;
      if (!item.joinadsAdded && (joinImps || joinUsd || joinBrl)) {
        item.impressions += joinImps;
        item.revenue_usd += joinUsd;
        item.revenue_brl += joinBrl;
        item.joinadsAdded = true;
      }
    } else if (!item.hasAdLevel) {
      item.fallbackImps = Math.max(item.fallbackImps, joinImps);
      item.fallbackRevenueUsd = Math.max(item.fallbackRevenueUsd, joinUsd);
      item.fallbackRevenueBrl = Math.max(item.fallbackRevenueBrl, joinBrl);
    }
    return map;
  }, new Map());
  const grouped = Array.from(groupedRows.values()).map((item) => {
    if (!item.hasAdLevel && !item.joinadsAdded) {
      item.impressions += item.fallbackImps;
      item.revenue_usd += item.fallbackRevenueUsd;
      item.revenue_brl += item.fallbackRevenueBrl;
    }
    return item;
  }).sort(
    (a, b) => (b.revenue_usd || 0) - (a.revenue_usd || 0)
  );

  return html`
    <section className="card wide">
      <div className="card-head">
        <div>
          <span className="eyebrow">Meta x JoinAds</span>
          <h2 className="section-title">Resumo agrupado (por anúncio)</h2>
        </div>
        <span className="chip neutral">${grouped.length} linhas</span>
      </div>
      <div className="table-wrapper scroll-x">
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Conjunto</th>
              <th>Anuncio</th>
              <th>Resultados (Meta)</th>
              <th>Valor gasto</th>
              <th>ROAS</th>
              <th>Lucro Op (BRL)</th>
              <th>Receita JoinAds (cliente)</th>
              <th>eCPM JoinAds (cliente)</th>
              <th>Impressoes JoinAds</th>
            </tr>
          </thead>
          <tbody>
            ${grouped.length === 0
              ? html`<tr><td colSpan="10" className="muted">Sem dados para o periodo.</td></tr>`
              : grouped.map((row, idx) => {
                  const ecpm =
                    row.impressions > 0
                      ? (row.revenue_usd / row.impressions) * 1000
                      : null;
                  const roas =
                    row.revenue_brl > 0 && row.spend > 0
                      ? row.revenue_brl / row.spend
                      : null;
                  const lucro =
                    row.revenue_brl !== 0 || row.spend !== 0
                      ? row.revenue_brl - row.spend
                      : null;
                  return html`
                    <tr key=${idx}>
                      <td>${formatObjective(row.objective)}</td>
                      <td>${asText(row.adset_name)}</td>
                      <td>${asText(row.ad_name)}</td>
                      <td>${number.format(row.results || 0)}</td>
                      <td>${currencyBRL.format(row.spend || 0)}</td>
                      <td>${roas != null ? `${roas.toFixed(2)}x` : "-"}</td>
                      <td>${lucro != null ? currencyBRL.format(lucro) : "-"}</td>
                      <td>${currencyUSD.format(row.revenue_usd || 0)}</td>
                      <td>${ecpm != null ? currencyUSD.format(ecpm) : "-"}</td>
                      <td>${number.format(row.impressions || 0)}</td>
                    </tr>
                  `;
                })}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function MetaJoinAdsetTable({ rows, joinadsRows, brlRate }) {
  const asText = (value) => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const joinadsByTerm = new Map();
  (joinadsRows || []).forEach((row) => {
    const key = normalizeKey(row.custom_value);
    if (!key) return;
    joinadsByTerm.set(key, row);
  });

  const groupedRows = rows.reduce((map, row) => {
    const key = `${row.adset_name || ""}|||${row.objective || ""}`;
    if (!map.has(key)) {
      map.set(key, {
        adset_name: row.adset_name,
        objective: row.objective,
        spend: 0,
        results: 0,
        impressions: null,
        revenue_usd: null,
        revenue_brl: null,
      });
    }
    const item = map.get(key);
    item.spend += toNumber(row.spend_value || row.spend);
    item.results += toNumber(row.results_meta);
    return map;
  }, new Map());

  const grouped = Array.from(groupedRows.values())
    .map((item) => {
      const termKey = normalizeKey(item.adset_name);
      const join = joinadsByTerm.get(termKey);
      if (join) {
        const usd = toNumber(join.revenue_client || join.revenue);
        item.impressions = toNumber(join.impressions);
        item.revenue_usd = usd;
        item.revenue_brl = brlRate ? usd * brlRate : null;
      }
      return item;
    })
    .sort((a, b) => (b.revenue_usd || 0) - (a.revenue_usd || 0));

  return html`
    <section className="card wide">
      <div className="card-head">
        <div>
          <span className="eyebrow">Meta x JoinAds</span>
          <h2 className="section-title">Resumo agrupado (por conjunto)</h2>
        </div>
        <span className="chip neutral">${grouped.length} linhas</span>
      </div>
      <div className="table-wrapper scroll-x">
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Conjunto</th>
              <th>Resultados (Meta)</th>
              <th>Valor gasto</th>
              <th>ROAS</th>
              <th>Lucro Op (BRL)</th>
              <th>Receita JoinAds (cliente)</th>
              <th>eCPM JoinAds (cliente)</th>
              <th>Impressoes JoinAds</th>
            </tr>
          </thead>
          <tbody>
            ${grouped.length === 0
              ? html`<tr><td colSpan="9" className="muted">Sem dados para o periodo.</td></tr>`
              : grouped.map((row, idx) => {
                  const ecpm =
                    row.impressions > 0 && row.revenue_usd != null
                      ? (row.revenue_usd / row.impressions) * 1000
                      : null;
                  const roas =
                    row.revenue_brl != null && row.revenue_brl > 0 && row.spend > 0
                      ? row.revenue_brl / row.spend
                      : null;
                  const lucro =
                    row.revenue_brl != null
                      ? row.revenue_brl - row.spend
                      : null;
                  return html`
                    <tr key=${idx}>
                      <td>${formatObjective(row.objective)}</td>
                      <td>${asText(row.adset_name)}</td>
                      <td>${number.format(row.results || 0)}</td>
                      <td>${currencyBRL.format(row.spend || 0)}</td>
                      <td>${roas != null ? `${roas.toFixed(2)}x` : "-"}</td>
                      <td>${lucro != null ? currencyBRL.format(lucro) : "-"}</td>
                      <td>${row.revenue_usd != null ? currencyUSD.format(row.revenue_usd) : "-"}</td>
                      <td>${ecpm != null ? currencyUSD.format(ecpm) : "-"}</td>
                      <td>${row.impressions != null ? number.format(row.impressions) : "-"}</td>
                    </tr>
                  `;
                })}
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
    metaAccountId: "act_728792692620145",
    adsetFilter: "",
  });
  const [superFilter, setSuperFilter] = useState([]);
  const [topUrls, setTopUrls] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [keyValueContent, setKeyValueContent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [domains, setDomains] = useState([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [metaRows, setMetaRows] = useState([]);
  const [usdBrl, setUsdBrl] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard | urls
  const [paramPairs, setParamPairs] = useState([]);
  const [superKey, setSuperKey] = useState("utm_content");
  const [metaSourceRows, setMetaSourceRows] = useState([]);
  const [superTermRows, setSuperTermRows] = useState([]);
  const [adStatusLoading, setAdStatusLoading] = useState({});

  const totals = useTotalsFromEarnings(earnings, superFilter);
  const brlRate = usdBrl || 0;
  const metaTotals = useMemo(() => {
    const spendBrl = (metaRows || []).reduce(
      (acc, row) => acc + toNumber(row.spend),
      0
    );
    return { spendBrl };
  }, [metaRows]);

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
      setError("Aguarde carregar os Dominios ou selecione manualmente.");
      return;
    }

    if (!filters.domain.trim()) {
      setError("Selecione um Dominio para consultar.");
      return;
    }

    if (!filters.metaAccountId.trim()) {
      setError("Informe o ID da conta de anúncios (Meta).");
      return;
    }

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
      const topPromise = fetchJson(
        `${API_BASE}/top-url?${new URLSearchParams({
          start_date: filters.startDate,
          end_date: filters.endDate,
          "domain[]": filters.domain.trim(),
          limit: 500,
          sort: "revenue",
        }).toString()}`
      );

      const earningsPromise = fetchJson(
        `${API_BASE}/earnings?${new URLSearchParams({
          start_date: filters.startDate,
          end_date: filters.endDate,
          domain: filters.domain.trim(),
        }).toString()}`
      );
      // key-value mantido em utm_campaign para evitar 422 em tokens que não aceitam utm_content
      const keyValueContentPromise = fetchJson(
        `${API_BASE}/key-value?${new URLSearchParams({
          start_date: filters.startDate,
          end_date: filters.endDate,
          domain: filters.domain.trim(),
          report_type: filters.reportType || "Analytical",
          custom_key: "utm_campaign",
        }).toString()}`
      ).catch((err) => {
        pushLog("key-value-content", err);
        return { data: [] };
      });

      let superRes = { data: [] };
      let superKeyUsed = "utm_content";
      try {
        superRes = await fetchJson(`${API_BASE}/super-filter`, {
          method: "POST",
          body: JSON.stringify({
            start_date: filters.startDate,
            end_date: filters.endDate,
            "domain[]": [filters.domain.trim()],
            custom_key: "utm_content",
            group: ["domain", "custom_value"],
          }),
        });
      } catch (err) {
        pushLog("super-filter", err);
      }
      // Fallback se deu erro ou veio vazio
      if (!superRes?.data?.length) {
        try {
          const fallback = await fetchJson(`${API_BASE}/super-filter`, {
            method: "POST",
            body: JSON.stringify({
              start_date: filters.startDate,
              end_date: filters.endDate,
              "domain[]": [filters.domain.trim()],
              custom_key: "utm_campaign",
              group: ["domain", "custom_value"],
            }),
          });
          superRes = fallback;
          superKeyUsed = "utm_campaign";
        } catch (err) {
          pushLog("super-filter-fallback", err);
        }
      }

      let superTermRes = { data: [] };
      try {
        superTermRes = await fetchJson(`${API_BASE}/super-filter`, {
          method: "POST",
          body: JSON.stringify({
            start_date: filters.startDate,
            end_date: filters.endDate,
            "domain[]": [filters.domain.trim()],
            custom_key: "utm_term",
            group: ["domain", "custom_value"],
          }),
        });
      } catch (err) {
        pushLog("super-filter-term", err);
      }


      let keyValueContentRes;
      try {
        keyValueContentRes = await fetchJson(
          `${API_BASE}/key-value?${new URLSearchParams({
            start_date: filters.startDate,
            end_date: filters.endDate,
            domain: filters.domain.trim(),
            report_type: filters.reportType || "Analytical",
            custom_key: "utm_campaign",
          }).toString()}`
        );
      } catch (err) {
        pushLog("key-value-content", err);
        keyValueContentRes = { data: [] };
      }

      let metaSourceRes = { data: [] };
      let metaMediumRes = { data: [] };
      try {
        metaSourceRes = await fetchJson(`${API_BASE}/super-filter`, {
          method: "POST",
          body: JSON.stringify({
            start_date: filters.startDate,
            end_date: filters.endDate,
            "domain[]": [filters.domain.trim()],
            custom_key: "utm_source",
            group: ["domain", "custom_value"],
          }),
        });
      } catch (err) {
        pushLog("meta-utmsource", err);
      }
      try {
        metaMediumRes = await fetchJson(`${API_BASE}/super-filter`, {
          method: "POST",
          body: JSON.stringify({
            start_date: filters.startDate,
            end_date: filters.endDate,
            "domain[]": [filters.domain.trim()],
            custom_key: "utm_medium",
            group: ["domain", "custom_value"],
          }),
        });
      } catch (err) {
        pushLog("meta-utmmedium", err);
      }

      const [topRes, earningsRes] = await Promise.all([
        topPromise,
        earningsPromise,
      ]);

      // key-value para coletar UTMs usadas
      // Somente keys aceitas pelo endpoint (evita erro de validação)
      const customKeys = ["utm_campaign"];
      const keyValueResults = await Promise.all(
        customKeys.map((ck) =>
          fetchJson(
            `${API_BASE}/key-value?${new URLSearchParams({
              start_date: filters.startDate,
              end_date: filters.endDate,
              domain: filters.domain.trim(),
              report_type: filters.reportType || "Analytical",
              custom_key: ck,
            }).toString()}`
          ).catch((err) => {
            pushLog("key-value", err);
            return { data: [] };
          })
        )
      );
      const kvMap = new Map();
      keyValueResults.forEach((res) => {
        (res.data || []).forEach((row) => {
          const key = row.custon_key || row.custom_key || "";
          const value = row.custon_value || row.custom_value || "";
          const mapKey = `${key}=${value}`;
          if (!kvMap.has(mapKey)) {
            kvMap.set(mapKey, {
              key,
              value,
              impressions: 0,
              clicks: 0,
              revenue: 0,
              count: 0,
            });
          }
          const item = kvMap.get(mapKey);
          item.impressions += Number(row.impressions || 0);
          item.clicks += Number(row.clicks || 0);
          item.revenue += Number(row.earnings_client || row.earnings || 0);
          item.count += 1;
        });
      });
      setParamPairs(Array.from(kvMap.values()));

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

      setSuperFilter(superRes?.data || []);
      setSuperKey(superKeyUsed || "utm_content");
      setSuperTermRows(superTermRes?.data || []);
      setTopUrls(topRes.data || []);
      setEarnings(earningsRes.data || []);
      setKeyValueContent(keyValueContentRes.data || []);
      const targetDomain = normalizeKey(filters.domain || "");
      const sourceRows =
        (metaSourceRes.data || []).filter((row) => {
          const domainName = normalizeKey(row.domain || row.name || "");
          return targetDomain ? domainName === targetDomain : true;
        }) || [];
      const mediumRows =
        (metaMediumRes.data || []).filter((row) => {
          const domainName = normalizeKey(row.domain || row.name || "");
          return targetDomain ? domainName === targetDomain : true;
        }) || [];

      // Evita duplicidade nos totais: usa utm_source como base,
      // e adiciona utm_medium somente se a soma de utm_source estiver vazia.
      const totalSourceImps = sourceRows.reduce(
        (acc, r) => acc + Number(r.impressions || 0),
        0
      );
      const totalSourceClicks = sourceRows.reduce(
        (acc, r) => acc + Number(r.clicks || 0),
        0
      );
      const totalSourceRevenue = sourceRows.reduce(
        (acc, r) => acc + Number(r.revenue_client || r.revenue || 0),
        0
      );

      const combinedSource =
        totalSourceImps || totalSourceClicks || totalSourceRevenue
          ? sourceRows
          : mediumRows;
      const filteredSource = combinedSource;

      const totalsAll = (earningsRes.data || []).reduce(
        (acc, row) => {
          acc.impressions += Number(row.impressions || 0);
          acc.clicks += Number(row.clicks || 0);
          acc.revenue += Number(row.revenue_client || row.revenue || 0);
          return acc;
        },
        { impressions: 0, clicks: 0, revenue: 0 }
      );
      const totalsUtm = filteredSource.reduce(
        (acc, row) => {
          acc.impressions += Number(row.impressions || 0);
          acc.clicks += Number(row.clicks || 0);
          acc.revenue += Number(row.revenue_client || row.revenue || 0);
          return acc;
        },
        { impressions: 0, clicks: 0, revenue: 0 }
      );
      const semImps = Math.max(0, totalsAll.impressions - totalsUtm.impressions);
      const semClicks = Math.max(0, totalsAll.clicks - totalsUtm.clicks);
      const semRevenue = Math.max(0, totalsAll.revenue - totalsUtm.revenue);
      const semEcpm =
        semImps > 0 ? (semRevenue / semImps) * 1000 : 0;
      const semUtmRow =
        semImps || semClicks || semRevenue
          ? {
              domain: filters.domain.trim(),
              custom_value: "Sem UTM",
              impressions: semImps,
              clicks: semClicks,
              revenue_client: semRevenue,
              ecpm_client: semEcpm,
            }
          : null;

      setMetaSourceRows(semUtmRow ? [...filteredSource, semUtmRow] : filteredSource);
      setLastRefreshed(new Date());
    } catch (err) {
      const msg = formatError(err) || "Erro ao buscar dados.";
      setError(msg);
      pushLog("load", err);
      setSuperFilter([]);
      setTopUrls([]);
      setEarnings([]);
      setMetaRows([]);
      setParamPairs([]);
      setKeyValueContent([]);
      setMetaSourceRows([]);
      setSuperTermRows([]);
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
      const msg = formatError(err) || "Erro ao listar Dominios.";
      setError(msg);
      pushLog("domains", err);
      setDomains([]);
    } finally {
      setDomainsLoading(false);
    }
  };

  const handleToggleAd = async (adId, nextStatus) => {
    if (!adId) return;
    setAdStatusLoading((prev) => ({ ...prev, [adId]: true }));
    try {
      await fetchJson(`${API_BASE}/meta-ad-status`, {
        method: "POST",
        body: JSON.stringify({ ad_id: adId, status: nextStatus }),
      });
      setMetaRows((prev) =>
        (prev || []).map((row) =>
          row.ad_id === adId
            ? { ...row, ad_status: nextStatus, effective_status: nextStatus }
            : row
        )
      );
    } catch (err) {
      pushLog("meta-status", err);
    } finally {
      setAdStatusLoading((prev) => {
        const next = { ...prev };
        delete next[adId];
        return next;
      });
    }
  };

  useEffect(() => {
    handleLoadDomains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const mergedMeta = useMemo(() => {
    if (!metaRows?.length) return [];
    const superRows = Array.isArray(superFilter) ? superFilter : [];
    const kvContent = Array.isArray(keyValueContent) ? keyValueContent : [];

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
    superRows.forEach((row) => {
      const keyNorm = normalizeKey(row.custom_value);
      if (keyNorm) superByCustom[keyNorm] = row;
    });

    const kvByCustom = {};
    kvContent.forEach((row) => {
      const keyNorm = normalizeKey(row.custon_value || row.custom_value);
      if (!keyNorm) return;
      kvByCustom[keyNorm] = {
        impressions: toNumber(row.impressions),
        clicks: toNumber(row.clicks),
        revenue: toNumber(row.earnings || row.earnings_client),
        revenue_client: toNumber(row.earnings_client),
        ecpm: toNumber(row.ecpm),
        ecpm_client: toNumber(row.ecpm_client),
      };
    });

    return metaRows.map((row) => {
      const date = row.date_start || row.date || "";
      const join = earningsByDate[date] || {};
      const nameKey = normalizeKey(row.ad_name);
      const adIdKey = normalizeKey(row.ad_id || "");

      const fromCustom =
        superByCustom[nameKey] ||
        superByCustom[adIdKey] ||
        {};

      const fromKv =
        kvByCustom[nameKey] ||
        kvByCustom[adIdKey] ||
        {};

      const hasJoinads =
        Object.keys(fromCustom).length > 0 || Object.keys(fromKv).length > 0;

      const ecpmClient =
        fromKv.ecpm_client ??
        fromKv.ecpm ??
        fromCustom.ecpm_client ??
        fromCustom.ecpm ??
        null;

      const impressionsJoin = toNumber(
        fromKv.impressions ?? fromCustom.impressions ?? null
      );

      const revenueClientRaw =
        fromKv.revenue_client ??
        fromKv.revenue ??
        fromCustom.revenue_client ??
        fromCustom.revenue ??
        (ecpmClient != null && impressionsJoin
          ? (Number(ecpmClient) * impressionsJoin) / 1000
          : null);

      const revenueClientBrl =
        revenueClientRaw != null && brlRate ? revenueClientRaw * brlRate : null;

      const cost = toNumber(row.cost_per_result);
      const spend = toNumber(row.spend);
      let resultsCount = null;
      const actionsCandidates = row.actions_count || row.actions;
      if (Array.isArray(actionsCandidates)) {
        resultsCount = actionsCandidates.reduce((acc, act) => {
          const v =
            toNumber(act?.value) ||
            toNumber(act?.values && act.values[0]?.value);
          return acc + (v || 0);
        }, 0);
      } else if (row.results != null) {
        resultsCount = toNumber(row.results);
      }

      const roas =
        revenueClientBrl != null && spend > 0
          ? revenueClientBrl / spend
          : null;
      const lucroOpBrl =
        revenueClientBrl != null && spend !== null && spend !== undefined
          ? revenueClientBrl - spend
          : null;

      return {
        ...row,
        date,
        joinads_matched: hasJoinads,
        cost_per_result: currencyBRL.format(cost),
        spend_brl: currencyBRL.format(spend),
        spend_value: spend,
        revenue_client_brl_value: revenueClientBrl ?? null,
        lucro_op_brl: lucroOpBrl != null ? currencyBRL.format(lucroOpBrl) : "-",
        ecpm_client:
          ecpmClient != null ? currencyUSD.format(Number(ecpmClient)) : "-",
        revenue_client_joinads:
          revenueClientRaw != null
            ? currencyUSD.format(Number(revenueClientRaw))
            : "-",
        revenue_client_value: revenueClientRaw ?? 0,
        roas_joinads: roas != null ? `${roas.toFixed(2)}x` : null,
        impressions_joinads: impressionsJoin || null,
        data_level: Object.keys(fromKv).length ? "utm_content" : superKey,
        results_meta: resultsCount,
      };
    });
  }, [metaRows, earnings, superFilter, keyValueContent, brlRate, superKey]);

  const filteredMeta = useMemo(() => {
    const term = filters.adsetFilter.trim().toLowerCase();
    const base = mergedMeta.filter((row) => row.joinads_matched);
    if (!term) return base;
    return base.filter((row) =>
      (row.adset_name || "").toLowerCase().includes(term)
    );
  }, [mergedMeta, filters.adsetFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("ontouchstart" in window)) return;
    const scrollEls = Array.from(document.querySelectorAll(".scroll-x"));
    if (!scrollEls.length) return;
    const state = new WeakMap();

    const onStart = (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      state.set(e.currentTarget, { x: t.clientX, y: t.clientY, mode: null });
    };

    const onMove = (e) => {
      const t = e.touches && e.touches[0];
      const s = state.get(e.currentTarget);
      if (!t || !s) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (!s.mode) {
        s.mode = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (s.mode === "y") {
        e.currentTarget.style.overflowX = "hidden";
      } else {
        e.currentTarget.style.overflowX = "auto";
      }
    };

    const onEnd = (e) => {
      e.currentTarget.style.overflowX = "auto";
      state.delete(e.currentTarget);
    };

    scrollEls.forEach((el) => {
      el.style.overflowX = "auto";
      el.addEventListener("touchstart", onStart, { passive: true });
      el.addEventListener("touchmove", onMove, { passive: true });
      el.addEventListener("touchend", onEnd, { passive: true });
      el.addEventListener("touchcancel", onEnd, { passive: true });
    });

    return () => {
      scrollEls.forEach((el) => {
        el.removeEventListener("touchstart", onStart);
        el.removeEventListener("touchmove", onMove);
        el.removeEventListener("touchend", onEnd);
        el.removeEventListener("touchcancel", onEnd);
      });
    };
  }, [activeTab, filteredMeta.length]);

  const topUrlTotals = useMemo(() => {
    if (!topUrls?.length) {
      return { impressions: 0, clicks: 0, ctr: 0, ecpm: 0, revenue: 0 };
    }
    const sum = topUrls.reduce(
      (acc, row) => {
        acc.impressions += Number(row.impressions || 0);
        acc.clicks += Number(row.clicks || 0);
        acc.revenue += Number(row.revenue || 0);
        return acc;
      },
      { impressions: 0, clicks: 0, revenue: 0 }
    );
    sum.ctr = sum.impressions ? (sum.clicks / sum.impressions) * 100 : 0;
    sum.ecpm = sum.impressions ? (sum.revenue / sum.impressions) * 1000 : 0;
    return sum;
  }, [topUrls]);

  const semUtmRow = useMemo(() => {
    const list = Array.isArray(metaSourceRows) ? metaSourceRows : [];
    return list.find(
      (row) => normalizeKey(row.custom_value) === "sem utm"
    );
  }, [metaSourceRows]);

  const paramStats = useMemo(() => {
    const map = new Map();

    // 1) Dados do key-value (utm_campaign etc.)
    (paramPairs || []).forEach((row) => {
      const k = `${row.key}=${row.value}`;
      if (!map.has(k)) {
        map.set(k, {
          key: row.key,
          value: row.value,
          impressions: 0,
          clicks: 0,
          revenue: 0,
          count: 0,
        });
      }
      const item = map.get(k);
      item.impressions += Number(row.impressions || 0);
      item.clicks += Number(row.clicks || 0);
      item.revenue += Number(row.revenue || 0);
      item.count += Number(row.count || 0);
    });

    // 2) Fallback/merge com params das URLs (para pegar utm_source/medium/etc.)
    (topUrls || []).forEach((row) => {
      const raw = row.url || "";
      const hasProto = raw.startsWith("http");
      const base = hasProto ? undefined : "https://dummy.com";
      try {
        const parsed = new URL(raw, base);
        parsed.searchParams.forEach((value, key) => {
          const k = `${key}=${value}`;
          if (!map.has(k)) {
            map.set(k, {
              key,
              value,
              impressions: 0,
              clicks: 0,
              revenue: 0,
              count: 0,
            });
          }
          const item = map.get(k);
          item.count += 1;
          item.impressions += Number(row.impressions || 0);
          item.clicks += Number(row.clicks || 0);
          item.revenue += Number(row.revenue || 0);
        });
      } catch (err) {
        const idx = raw.indexOf("?");
        if (idx >= 0) {
          const query = raw.slice(idx + 1);
          query.split("&").forEach((pair) => {
            if (!pair) return;
            const [key, value = ""] = pair.split("=");
            const k = `${key}=${value}`;
            if (!map.has(k)) {
              map.set(k, {
                key,
                value,
                impressions: 0,
                clicks: 0,
                revenue: 0,
                count: 0,
              });
            }
            const item = map.get(k);
            item.count += 1;
            item.impressions += Number(row.impressions || 0);
            item.clicks += Number(row.clicks || 0);
            item.revenue += Number(row.revenue || 0);
          });
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const impDiff = (b.impressions || 0) - (a.impressions || 0);
      if (impDiff !== 0) return impDiff;
      return (b.count || 0) - (a.count || 0);
    });
  }, [topUrls, paramPairs]);

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
            Arbitragem de tráfego com dados em tempo real da JoinAds.
          </p>
        </div>
        <div className="actions">
          <div className="muted small">
            ${usdBrl ? `USD hoje: R$ ${usdBrl.toFixed(2)}` : "Atualizando cotação..."}
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

      <div className="tabs">
        <button
          className=${`tab ${activeTab === "dashboard" ? "active" : ""}`}
          onClick=${() => setActiveTab("dashboard")}
        >
          Dashboard
        </button>
        <button
          className=${`tab ${activeTab === "urls" ? "active" : ""}`}
          onClick=${() => setActiveTab("urls")}
        >
          URLs com Parâmetros
        </button>
        <button
          className=${`tab ${activeTab === "meta" ? "active" : ""}`}
          onClick=${() => setActiveTab("meta")}
        >
          Fontes
        </button>
        <button
          className=${`tab ${activeTab === "diag" ? "active" : ""}`}
          onClick=${() => setActiveTab("diag")}
        >
          Diagnóstico JoinAds
        </button>
      </div>

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

      ${activeTab === "dashboard"
        ? html`
            <main className="grid">
              ${html`<${Metrics}
                totals=${totals}
                usdToBrl=${brlRate}
                metaSpendBrl=${metaTotals.spendBrl}
              />`}
              ${html`
                <${MetaJoinTable}
                  rows=${filteredMeta}
                  adsetFilter=${filters.adsetFilter}
                  onFilterChange=${(value) =>
                    setFilters((prev) => ({ ...prev, adsetFilter: value }))}
                  onToggleAd=${handleToggleAd}
                  statusLoading=${adStatusLoading}
                />
              `}
              ${html`<${MetaJoinAdsetTable} rows=${filteredMeta} joinadsRows=${superTermRows} brlRate=${brlRate} />`}
              ${html`<${MetaJoinGroupedTable} rows=${filteredMeta} />`}
              ${html`<${EarningsTable} rows=${earnings} />`}
            </main>
          `
        : activeTab === "urls"
        ? html`
            <main className="grid">
              ${html`<${TopUrlTable} rows=${topUrls} totals=${topUrlTotals} />`}
              ${html`<${ParamTable} rows=${paramStats} />`}
            </main>
          `
        : activeTab === "meta"
        ? html`
            <main className="grid">
              ${html`<${MetaSourceTable} rows=${metaSourceRows} />`}
            </main>
          `
        : html`
            <main className="grid">
              ${html`
                <${DiagnosticsJoin}
                  superRows=${Array.isArray(superFilter) ? superFilter : []}
                  kvRows=${Array.isArray(keyValueContent) ? keyValueContent : []}
                  earnings=${earnings}
                  topUrls=${topUrls}
                  domain=${filters.domain}
                  superKey=${superKey}
                />
              `}
              ${html`<${DiagnosticsNoUtmSummary} row=${semUtmRow} />`}
            </main>
          `}

      ${html`<${LogsCard} logs=${logs} onClear=${() => setLogs([])} />`}
    </div>
  `;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(html`<${App} />`);
}































