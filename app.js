import React, { useEffect, useMemo, useRef, useState } from "https://esm.sh/react@18.2.0";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(React.createElement);
const API_BASE = "/api";
const DEFAULT_UTM_TAGS =
  "utm_source=fb&utm_medium=cpc&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&ad_id={{ad.id}}";
const DUPLICATE_STATUS = "ACTIVE";
const BID_STRATEGY_WITH_BID = "LOWEST_COST_WITH_BID_CAP";
const BID_STRATEGY_WITHOUT_BID = "LOWEST_COST_WITHOUT_CAP";
const BID_STRATEGY_DEFAULT = BID_STRATEGY_WITH_BID;
const APP_VERSION_BUILD = 71;
const APP_VERSION = (APP_VERSION_BUILD / 100).toFixed(2);

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

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const {
    cacheTtlMs,
    cacheKey: cacheKeyOverride,
    force,
    cacheMode,
    ...fetchOptions
  } = options || {};
  const method = (fetchOptions.method || "GET").toUpperCase();
  const cacheTtl = cacheTtlMs || 0;
  const cacheKey = cacheKeyOverride || path;

  let isLiveTodayQuery = false;
  if (method === "GET") {
    try {
      const url = new URL(path, window.location.origin);
      const endDate = url.searchParams.get("end_date");
      const today = formatDate(new Date());
      isLiveTodayQuery = endDate === today;
    } catch (e) {
      isLiveTodayQuery = false;
    }
  }

  if (method === "GET" && cacheTtl && !force && !isLiveTodayQuery) {
    try {
      const raw = localStorage.getItem("__cd_cache__");
      const store = raw ? JSON.parse(raw) : {};
      const entry = store[cacheKey];
      if (entry && Date.now() - entry.time <= entry.ttl) {
        return entry.data;
      }
    } catch (e) {
      // ignore cache errors
    }
  }

  const res = await fetch(path, {
    ...fetchOptions,
    cache: cacheMode || "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(fetchOptions.headers || {}),
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

  if (method === "GET" && cacheTtl && !isLiveTodayQuery) {
    try {
      const raw = localStorage.getItem("__cd_cache__");
      const store = raw ? JSON.parse(raw) : {};
      store[cacheKey] = { time: Date.now(), ttl: cacheTtl, data };
      localStorage.setItem("__cd_cache__", JSON.stringify(store));
    } catch (e) {
      // ignore cache errors
    }
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
        const imps = Number(row.impressions || 0);
        acc.ecpmWeighted += Number(row.ecpm || 0) * imps;
        acc.ecpmClientWeighted += Number(row.ecpm_client || row.ecpm || 0) * imps;
        acc.activeViewWeighted += Number(row.active_view || 0) * imps;
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
        ecpmWeighted: 0,
        ecpmClientWeighted: 0,
        activeView: 0,
        activeViewWeighted: 0,
      }
    );

    sum.ctr = sum.impressions ? (sum.clicks / sum.impressions) * 100 : 0;
    sum.ecpm = sum.impressions ? sum.ecpmWeighted / sum.impressions : 0;
    sum.ecpmClient = sum.impressions ? sum.ecpmClientWeighted / sum.impressions : 0;
    sum.activeView = sum.impressions ? sum.activeViewWeighted / sum.impressions : 0;

    return sum;
  }, [earnings, fallbackSuper]);
}

function formatError(err) {
  if (!err) return "Erro inesperado";
  if (err.data) {
    if (typeof err.data === "string") return err.data;
    if (err.data.details?.error?.error_user_msg) {
      return err.data.details.error.error_user_msg;
    }
    if (err.data.details?.error?.message) {
      return err.data.details.error.message;
    }
    if (err.data.error) return err.data.error;
    if (err.data.message) return err.data.message;
    if (err.data.detail) return err.data.detail;
  }
  return err.message || "Erro inesperado";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryOnSubcode33(fn) {
  const delays = [1500, 3000, 5000];
  for (let i = 0; i <= delays.length; i += 1) {
    try {
      return await fn();
    } catch (err) {
      const subcode =
        err?.data?.details?.error?.error_subcode ||
        err?.data?.details?.error_subcode;
      if (subcode === 33 && i < delays.length) {
        await sleep(delays[i]);
        continue;
      }
      throw err;
    }
  }
  return null;
}

const statusLabelMap = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  DISABLED: "Desativado",
  ARCHIVED: "Arquivado",
  DELETED: "Excluído",
  PENDING_REVIEW: "Em revisão",
  IN_PROCESS: "Em processamento",
  WITH_ISSUES: "Com problemas",
  REJECTED: "Reprovado",
  INACTIVE: "Inativo",
  CLOSED: "Encerrado",
  CAMPAIGN_PAUSED: "Campanha pausada",
  CAMPAIGN_ARCHIVED: "Campanha arquivada",
  ADSET_PAUSED: "Conjunto pausado",
  ADSET_ARCHIVED: "Conjunto arquivado",
  ACCOUNT_PAUSED: "Conta pausada",
};

const statusToneMap = {
  ACTIVE: "on",
  PAUSED: "off",
  DISABLED: "off",
  ARCHIVED: "neutral",
  DELETED: "neutral",
  PENDING_REVIEW: "warn",
  IN_PROCESS: "warn",
  WITH_ISSUES: "warn",
  REJECTED: "off",
  INACTIVE: "neutral",
  CLOSED: "neutral",
  CAMPAIGN_PAUSED: "off",
  CAMPAIGN_ARCHIVED: "neutral",
  ADSET_PAUSED: "off",
  ADSET_ARCHIVED: "neutral",
  ACCOUNT_PAUSED: "off",
};

function formatStatusLabel(status) {
  if (!status) return "Indisponível";
  return statusLabelMap[status] || status;
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

function MetaTokenView({
  info,
  loading,
  error,
  onCheck,
}) {
  const expiresAt =
    info?.expires_at && Number(info.expires_at) > 0
      ? new Date(Number(info.expires_at) * 1000)
      : null;
  const daysLeft =
    expiresAt != null
      ? Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)
      : null;
  const scopes = Array.isArray(info?.scopes) ? info.scopes.join(", ") : "-";

  return html`
    <main className="grid">
      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">Meta</span>
            <h2 className="section-title">Token e Permissoes</h2>
          </div>
          <div className="chip-group">
            <button className="ghost" onClick=${onCheck} disabled=${loading}>
              ${loading ? "Verificando..." : "Verificar token"}
            </button>
          </div>
        </div>

        ${error
          ? html`<div className="status error"><strong>Erro:</strong> ${error}</div>`
          : null}

        <div className="token-grid">
          <div className="metric-card">
            <span className="muted">Tipo</span>
            <div className="metric-value">${info?.type || "-"}</div>
          </div>
          <div className="metric-card">
            <span className="muted">Valido</span>
            <div className="metric-value">
              ${info?.is_valid === true
                ? "Sim"
                : info?.is_valid === false
                ? "Nao"
                : "-"}
            </div>
          </div>
          <div className="metric-card">
            <span className="muted">Expira em</span>
            <div className="metric-value">
              ${expiresAt ? expiresAt.toLocaleString("pt-BR") : "-"}
            </div>
            <div className="metric-helper">
              ${daysLeft != null ? `${daysLeft} dias restantes` : ""}
            </div>
          </div>
          <div className="metric-card">
            <span className="muted">User/Page ID</span>
            <div className="metric-value">${info?.user_id || "-"}</div>
          </div>
          <div className="metric-card">
            <span className="muted">App ID</span>
            <div className="metric-value">${info?.app_id || "-"}</div>
          </div>
          <div className="metric-card">
            <span className="muted">Escopos</span>
            <div className="metric-value small">${scopes}</div>
          </div>
        </div>

      </section>
    </main>
  `;
}

function getHostname(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch (e) {
    return "";
  }
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
        <label className="field">
          <span>Carregar criativos (Meta)</span>
          <label className="checkbox">
            <input
              type="checkbox"
              checked=${!!filters.includeAssets}
              onChange=${(e) =>
                setFilters((p) => ({ ...p, includeAssets: e.target.checked }))}
            />
            <span>Mais lento</span>
          </label>
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
    <section className="card wide">
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
    <section className="card wide meta-campaigns">
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
      <div className="table-wrapper scroll-x">
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
const bidStrategyMap = {
  LOWEST_COST_WITHOUT_CAP: "Menor custo (sem limite)",
  LOWEST_COST_WITH_BID_CAP: "Limite de lance",
  COST_CAP: "Meta de custo",
  LOWEST_COST_WITH_MIN_ROAS: "ROAS mínimo",
};
const formatBidStrategy = (value) =>
  bidStrategyMap[(value || "").toUpperCase()] || value || "-";
const strategyToMode = (strategy) => {
  const normalized = (strategy || "").toUpperCase();
  if (normalized === BID_STRATEGY_WITHOUT_BID) return "without_bid";
  return "with_bid";
};
const modeToStrategy = (mode) => {
  if (mode === "without_bid") return BID_STRATEGY_WITHOUT_BID;
  return BID_STRATEGY_WITH_BID;
};
const normalizeKey = (value) =>
  (value ?? "")
    .toString()
    .trim()
    .toLowerCase();

function buildAdsetGrouped(rows, joinadsRows, brlRate) {
  const safeJoinadsRows = Array.isArray(joinadsRows) ? joinadsRows : [];
  const joinadsByTerm = new Map();
  safeJoinadsRows.forEach((row) => {
    const key = normalizeKey(row.custom_value);
    if (!key) return;
    const entry = joinadsByTerm.get(key) || {
      impressions: 0,
      clicks: 0,
      revenue: 0,
      ecpm_client: null,
      ecpm: null,
    };
    entry.impressions += toNumber(row.impressions);
    entry.clicks += toNumber(row.clicks);
    entry.revenue += toNumber(row.revenue_client || row.revenue);
    if (row.ecpm_client != null) entry.ecpm_client = toNumber(row.ecpm_client);
    if (row.ecpm != null) entry.ecpm = toNumber(row.ecpm);
    joinadsByTerm.set(key, entry);
  });

  const groupedRows = rows.reduce((map, row) => {
    const key = `${row.adset_name || ""}|||${row.objective || ""}`;
    if (!map.has(key)) {
      map.set(key, {
        adset_name: row.adset_name,
        objective: row.objective,
        spend: 0,
        results: 0,
        impressions: 0,
        clicks: 0,
        revenue_usd: 0,
        revenue_brl: 0,
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
        item.clicks = toNumber(join.clicks);
        item.revenue_usd = usd;
        item.revenue_brl = brlRate ? usd * brlRate : 0;
        item.ecpm = item.impressions ? (item.revenue_usd / item.impressions) * 1000 : 0;
        item.ctr = item.impressions ? (item.clicks / item.impressions) * 100 : 0;
      }
      return item;
    })
    .sort((a, b) => (b.revenue_usd || 0) - (a.revenue_usd || 0));

  return grouped;
}

function DuplicarView({
  campaigns,
  loading,
  error,
  onLoad,
  onRefreshStatus,
  statusLoading,
  copyCounts,
  setCopyCount,
  onAddDraft,
  drafts,
  onRemoveDraft,
  onUpdateDraft,
  onUpdateDraftAd,
  onToggleDraftAd,
  onPublish,
  publishing,
  selectedAdsets,
  onToggleAdset,
  onDeleteAdsets,
}) {
  const budgetLabel = (adset) => {
    const daily =
      adset?.daily_budget != null ? currencyBRL.format(adset.daily_budget / 100) : null;
    const life =
      adset?.lifetime_budget != null
        ? `${currencyBRL.format(adset.lifetime_budget / 100)} (vitalício)`
        : null;
    return daily || life || "-";
  };

  const activeCampaigns = (campaigns || []).filter((camp) => {
    const status = (camp.effective_status || camp.status || "").toUpperCase();
    return status === "ACTIVE";
  });
  const displayCampaigns =
    activeCampaigns.length > 0 ? activeCampaigns : campaigns || [];
  const showFallbackNotice =
    activeCampaigns.length === 0 && (campaigns || []).length > 0;

  return html`
    <main className="dup-grid">
      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">Duplicar</span>
            <h2 className="section-title">Campanhas ativas</h2>
          </div>
          <div className="chip-group">
            <button className="ghost" onClick=${() => onLoad?.(true)} disabled=${loading}>
              ${loading ? "Carregando..." : "Atualizar lista"}
            </button>
            <button
              className="ghost"
              onClick=${onRefreshStatus}
              disabled=${statusLoading || !campaigns || campaigns.length === 0}
            >
              ${statusLoading ? "Atualizando..." : "Atualizar status"}
            </button>
            <button
              className="ghost"
              onClick=${onDeleteAdsets}
              disabled=${!selectedAdsets || Object.keys(selectedAdsets).length === 0}
              title="Apagar conjuntos selecionados"
            >
              Apagar selecionados
            </button>
          </div>
        </div>
        ${showFallbackNotice
          ? html`<div className="status neutral">
              Nenhuma campanha ativa foi encontrada. Exibindo todas.
            </div>`
          : null}
        ${error
          ? html`<div className="status error"><strong>Erro:</strong> ${error}</div>`
          : null}
        ${displayCampaigns.length === 0
          ? html`<p className="muted small">Nenhuma campanha ativa carregada.</p>`
          : displayCampaigns.map(
              (camp) => html`
                <div className="dup-campaign" key=${camp.id}>
                  <div className="dup-campaign-head">
                    <div>
                      <strong>${camp.name}</strong>
                      <div className="muted small">
                        ID: ${camp.id} • ${camp.effective_status || camp.status || "-"}
                      </div>
                    </div>
                  </div>
                  <div className="dup-adsets">
                    ${(camp.adsets || []).length === 0
                      ? html`<div className="muted small">Sem conjuntos.</div>`
                      : camp.adsets.map(
                          (adset) => html`
                            <div className="dup-adset" key=${adset.id}>
                              <div className="dup-adset-head">
                                <div>
                                  <label className="dup-select">
                                    <input
                                      type="checkbox"
                                      checked=${!!(selectedAdsets && selectedAdsets[adset.id])}
                                      onChange=${() => onToggleAdset?.(adset.id)}
                                    />
                                    <strong>${adset.name}</strong>
                                  </label>
                                  <div className="muted small">
                                    ID: ${adset.id}
                                    • ${adset.effective_status || adset.status || "-"}
                                    • Orçamento: ${budgetLabel(adset)}
                                  </div>
                                </div>
                                <div className="dup-actions">
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value=${copyCounts[adset.id] || 1}
                                    onChange=${(e) =>
                                      setCopyCount(adset.id, e.target.value)}
                                  />
                                  <button
                                    className="ghost small"
                                    onClick=${() =>
                                      onAddDraft(camp, adset, copyCounts[adset.id] || 1)}
                                  >
                                    Adicionar
                                  </button>
                                </div>
                              </div>
                              <details>
                                <summary>
                                  Anúncios (${(adset.ads || []).length})
                                </summary>
                                <ul className="dup-ads">
                                  ${(adset.ads || []).map(
                                    (ad) => html`<li key=${ad.id}>${ad.name}</li>`
                                  )}
                                </ul>
                              </details>
                            </div>
                          `
                        )}
                  </div>
                </div>
              `
            )}
      </section>

      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">Rascunho</span>
            <h2 className="section-title">Duplicações pendentes</h2>
          </div>
          <button
            className="primary"
            onClick=${onPublish}
            disabled=${publishing || drafts.length === 0}
          >
            ${publishing ? "Publicando..." : "Publicar"}
          </button>
        </div>
        ${drafts.length === 0
          ? html`<p className="muted small">Nada no rascunho ainda.</p>`
          : html`
              <div className="draft-list">
                ${drafts.map(
                  (draft) => html`
                    <div className="draft-card" key=${draft.id}>
                      <div className="draft-head">
                        <div>
                          <strong>${draft.campaign_name}</strong>
                          <div className="muted small">
                            Conjunto original: ${draft.source_adset_name}
                          </div>
                        </div>
                        <button
                          className="ghost small"
                          onClick=${() => onRemoveDraft(draft.id)}
                        >
                          Remover
                        </button>
                      </div>
                      <div className="draft-fields">
                        <label className="field">
                          <span>Novo nome do conjunto</span>
                          <input
                            type="text"
                            value=${draft.adset_new_name}
                            onChange=${(e) =>
                              onUpdateDraft(draft.id, {
                                adset_new_name: e.target.value,
                              })}
                          />
                        </label>
                        <label className="field">
                          <span>Número de cópias</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value=${draft.copies || 1}
                            onChange=${(e) =>
                              onUpdateDraft(draft.id, {
                                copies: Math.max(1, Number(e.target.value) || 1),
                              })}
                          />
                        </label>
                        <label className="field">
                          <span>Orçamento diário (R$)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value=${draft.daily_budget_brl}
                            onChange=${(e) =>
                              onUpdateDraft(draft.id, {
                                daily_budget_brl: e.target.value,
                              })}
                          />
                        </label>
                      </div>
                      <div className="table-wrapper scroll-x">
                        <table>
                          <thead>
                            <tr>
                              <th>Anúncio (origem)</th>
                              <th>Novo nome</th>
                              <th>Ação</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${(draft.ads || []).map(
                              (ad) => html`
                                <tr key=${ad.id}>
                                  <td>${ad.name}</td>
                                  <td>
                                    <input
                                      type="text"
                                      value=${ad.new_name}
                                      disabled=${ad.removed}
                                      onChange=${(e) =>
                                        onUpdateDraftAd(draft.id, ad.id, {
                                          new_name: e.target.value,
                                        })}
                                    />
                                  </td>
                                  <td>
                                    <button
                                      className="ghost small"
                                      onClick=${() =>
                                        onToggleDraftAd(draft.id, ad.id)}
                                    >
                                      ${ad.removed ? "Desfazer" : "Excluir"}
                                    </button>
                                  </td>
                                </tr>
                              `
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  `
                )}
              </div>
            `}
      </section>
    </main>
  `;
}

function EditarView({
  ads,
  loading,
  error,
  onLoad,
  onUpdateField,
  onSave,
  saving,
  campaignFilter,
  onCampaignFilter,
  onCleanParams,
  onVerify,
  verifying,
  onRenameAd,
  onRenameAdset,
  editRenaming,
  onResolveDestination,
}) {
  return html`
    <main className="dup-grid">
      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">Editar</span>
            <h2 className="section-title">URLs e parâmetros</h2>
          </div>
          <div className="chip-group">
            <button className="ghost" onClick=${onLoad} disabled=${loading}>
              ${loading ? "Carregando..." : "Carregar anúncios"}
            </button>
            <span className="chip neutral">${ads.length} anúncios</span>
          </div>
        </div>
        <div className="filters">
          <label className="field">
            <span>Filtrar por campanha</span>
            <input
              type="text"
              placeholder="Digite parte do nome da campanha"
              value=${campaignFilter}
              onInput=${(e) => onCampaignFilter?.(e.target.value)}
            />
          </label>
        </div>
        ${error
          ? html`<div className="status error"><strong>Erro:</strong> ${error}</div>`
          : null}
        <div className="table-wrapper scroll-x" style=${{ marginTop: "12px" }}>
          <table>
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Conjunto</th>
                <th>Anúncio</th>
                <th>URL</th>
                <th>Destino (URL)</th>
                <th>Parâmetros de URL</th>
                <th>Status URL</th>
                <th>Atualizado</th>
                <th>Verificado</th>
                <th>Status</th>
                <th>Renomear anúncio</th>
                <th>Renomear conjunto</th>
                <th>Limpar Parâmetro e Melhorar URL</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              ${ads.length === 0
                ? html`<tr><td colSpan="14" className="muted">Sem dados.</td></tr>`
                : ads.map((row, idx) => {
                    const busy = saving && saving[row.id];
                    const verifyingRow = verifying && verifying[row.id];
                    const renameAdKey = `ad:${row.id}`;
                    const renameAdsetKey = row.adset_id ? `adset:${row.adset_id}` : "";
                    const renamingAd = editRenaming && editRenaming[renameAdKey];
                    const renamingAdset =
                      renameAdsetKey && editRenaming && editRenaming[renameAdsetKey];
                    const urlHasUtm =
                      /\butm_source=/i.test(row.url || "") ||
                      /\butm_source=/i.test(row.url_tags || "");
                    const statusUrl = row.url
                      ? urlHasUtm
                        ? "OK"
                        : "Sem UTM"
                      : row.object_story_id
                      ? "Post existente"
                      : "Sem URL";
                    const statusTone =
                      statusUrl === "OK"
                        ? "good"
                        : statusUrl === "Post existente"
                        ? "neutral"
                        : statusUrl === "Sem UTM"
                        ? "warn"
                        : "off";
                    return html`
                      <tr key=${row.id || idx}>
                        <td>${row.campaign_name || "-"}</td>
                        <td>${row.adset_name || "-"}</td>
                        <td>${row.name || "-"}</td>
                        <td>
                          <input
                            type="text"
                            value=${row.url || ""}
                            placeholder="https://..."
                            onInput=${(e) =>
                              onUpdateField(row.id, { url: e.target.value })}
                          />
                        </td>
                        <td>
                          ${row.destination_url
                            ? html`<a href=${row.destination_url} target="_blank" rel="noopener noreferrer">
                                ${row.destination_url}
                              </a>`
                            : row.object_story_id
                            ? html`<div className="inline-actions">
                                <span className="muted small">Post existente</span>
                                <button
                                  className="ghost small"
                                  disabled=${verifyingRow}
                                  onClick=${() => onResolveDestination?.(row)}
                                >
                                  ${verifyingRow ? "..." : "Resolver"}
                                </button>
                              </div>`
                            : html`<span className="muted small">Sem destino</span>`}
                        </td>
                        <td>
                          <input
                            type="text"
                            value=${row.url_tags || ""}
                            placeholder="utm_source=..."
                            onInput=${(e) =>
                              onUpdateField(row.id, { url_tags: e.target.value })}
                          />
                        </td>
                        <td>
                          <span className=${`status-badge ${statusTone}`}>
                            ${statusUrl}
                          </span>
                        </td>
                        <td>${formatDateTime(row.updated_time)}</td>
                        <td>${formatDateTime(row.verified_time)}</td>
                        <td>${formatStatusLabel(row.status || row.effective_status)}</td>
                        <td>
                          <div className="inline-actions">
                            <input
                              type="text"
                              value=${row.name || ""}
                              onInput=${(e) =>
                                onUpdateField(row.id, { name: e.target.value })}
                            />
                            <button
                              className="ghost small"
                              disabled=${renamingAd || !row.name}
                              onClick=${() =>
                                onRenameAd?.(row.id, row.name, renameAdKey)}
                            >
                              ${renamingAd ? "..." : "Salvar"}
                            </button>
                          </div>
                        </td>
                        <td>
                          <div className="inline-actions">
                            <input
                              type="text"
                              value=${row.adset_name || ""}
                              onInput=${(e) =>
                                onUpdateField(row.id, { adset_name: e.target.value })}
                            />
                            <button
                              className="ghost small"
                              disabled=${renamingAdset || !row.adset_id}
                              onClick=${() =>
                                onRenameAdset?.(
                                  row.adset_id,
                                  row.adset_name,
                                  renameAdsetKey
                                )}
                            >
                              ${renamingAdset ? "..." : "Salvar"}
                            </button>
                          </div>
                        </td>
                        <td>
                          <button
                            className="ghost small"
                            disabled=${busy || !row.url}
                            onClick=${() => onCleanParams?.(row)}
                          >
                            Limpar e aplicar
                          </button>
                        </td>
                        <td>
                          <button
                            className="ghost small"
                            disabled=${busy || !row.url}
                            onClick=${() => onSave(row)}
                          >
                            ${busy ? "Duplicando..." : "Duplicar com URL"}
                          </button>
                          <button
                            className="ghost small"
                            disabled=${verifyingRow}
                            onClick=${() => onVerify?.(row)}
                          >
                            ${verifyingRow ? "Verificando..." : "Verificar"}
                          </button>
                        </td>
                      </tr>
                    `;
                  })}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          "Duplicar com URL" cria um novo anúncio com a URL/UTM informada (via /copies),
          mantendo o criativo original sem virar "Post existente".
        </p>
      </section>
    </main>
  `;
}

function MetaJoinTable({
  rows,
  adsetFilter,
  onFilterChange,
  onToggleAd,
  statusLoading,
  onBudgetUpdate,
  budgetLoading,
  onBidUpdate,
  bidLoading,
  isMultiDay,
}) {
  const asText = (value) => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };
  const [budgetInputs, setBudgetInputs] = useState({});
  const [bidInputs, setBidInputs] = useState({});
  const [bidModes, setBidModes] = useState({});

  const setBudget = (adsetId, value) => {
    setBudgetInputs((prev) => ({ ...prev, [adsetId]: value }));
  };
  const getBudget = (adsetId, fallback) => {
    const raw = budgetInputs[adsetId];
    if (raw === undefined || raw === null || raw === "") {
      return fallback ?? "";
    }
    return raw;
  };
  const setBid = (adsetId, value) => {
    setBidInputs((prev) => ({ ...prev, [adsetId]: value }));
  };
  const getBid = (adsetId, fallback) => {
    const raw = bidInputs[adsetId];
    if (raw === undefined || raw === null || raw === "") {
      return fallback ?? "";
    }
    return raw;
  };
  const setBidMode = (adsetId, mode) => {
    setBidModes((prev) => ({
      ...prev,
      [adsetId]: mode === "without_bid" ? "without_bid" : "with_bid",
    }));
  };
  const getBidMode = (adsetId, strategyFallback) => {
    const mode = bidModes[adsetId];
    if (mode === "with_bid" || mode === "without_bid") {
      return mode;
    }
    return strategyToMode(strategyFallback);
  };

  const showJoinads = !isMultiDay;

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
              <th>Orçamento (Meta)</th>
              <th>Custo alvo (Meta)</th>
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
                    <td colSpan="15" className="muted">Sem dados para o periodo.</td>
                  </tr>
                `
              : rows.map(
                  (row, idx) => {
                    const adLink = row.permalink_url || null;
                    const statusRaw = row.ad_status || "";
                    const effective = row.effective_status || "";
                    const statusForUi = statusRaw || effective;
                    const isActive = statusForUi === "ACTIVE";
                    const canToggle = statusRaw === "ACTIVE" || statusRaw === "PAUSED";
                    const statusLabel = formatStatusLabel(statusForUi);
                    const statusTone = statusToneMap[statusForUi] || "neutral";
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
                      <td>
                        ${row.adset_id
                          ? (() => {
                              const currentBudget =
                                row.adset_daily_budget_brl != null
                                  ? currencyBRL.format(row.adset_daily_budget_brl)
                                  : row.adset_lifetime_budget_brl != null
                                  ? `${currencyBRL.format(row.adset_lifetime_budget_brl)} (vitalicio)`
                                  : "-";
                              const fallbackBudgetValue =
                                row.adset_daily_budget_brl != null
                                  ? row.adset_daily_budget_brl.toFixed(2)
                                  : "";
                              return html`<div className="budget-cell">
                                <div className="budget-meta">
                                  <span className="muted small">Atual: ${currentBudget}</span>
                                </div>
                                <div className="budget-actions">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="R$"
                                    value=${getBudget(row.adset_id, fallbackBudgetValue)}
                                    onChange=${(e) =>
                                      setBudget(row.adset_id, e.target.value)}
                                    onKeyDown=${(e) => {
                                      if (e.key === "Enter") {
                                        onBudgetUpdate?.(
                                          row.adset_id,
                                          getBudget(row.adset_id, fallbackBudgetValue)
                                        );
                                      }
                                    }}
                                  />
                                  <button
                                    className="ghost small"
                                    disabled=${budgetLoading && budgetLoading[row.adset_id]}
                                    onClick=${() =>
                                      onBudgetUpdate?.(
                                        row.adset_id,
                                        getBudget(row.adset_id, fallbackBudgetValue)
                                      )}
                                  >
                                    ${budgetLoading && budgetLoading[row.adset_id]
                                      ? "..."
                                      : "Salvar"}
                                  </button>
                                </div>
                              </div>`;
                            })()
                          : "-"}
                      </td>
                      <td>
                        ${row.adset_id
                          ? (() => {
                              const currentMode = getBidMode(
                                row.adset_id,
                                row.adset_bid_strategy
                              );
                              const requiresBidValue = currentMode !== "without_bid";
                              const modeLabel =
                                currentMode === "with_bid"
                                  ? "Com limite"
                                  : "Sem limite";
                              const currentBid =
                                requiresBidValue && row.adset_bid_amount_brl != null
                                  ? currencyBRL.format(row.adset_bid_amount_brl)
                                  : `Definido (${formatBidStrategy(
                                      modeToStrategy(currentMode)
                                    )})`;
                              const fallbackBidValue =
                                row.adset_bid_amount_brl != null
                                  ? row.adset_bid_amount_brl.toFixed(2)
                                  : "";
                              return html`<div className="budget-cell">
                                <div className="budget-meta">
                                  <span className="muted small">Atual: ${currentBid}</span>
                                  <span className="muted small">Status: ${modeLabel}</span>
                                </div>
                                <div className="budget-actions">
                                  <select
                                    value=${currentMode}
                                    onChange=${(e) =>
                                      setBidMode(row.adset_id, e.target.value)}
                                  >
                                    <option value="with_bid">Com limite (limite de lance)</option>
                                    <option value="without_bid">Sem limite (menor custo)</option>
                                  </select>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="R$"
                                    disabled=${!requiresBidValue}
                                    value=${getBid(row.adset_id, fallbackBidValue)}
                                    onChange=${(e) =>
                                      setBid(row.adset_id, e.target.value)}
                                    onKeyDown=${(e) => {
                                      if (requiresBidValue && e.key === "Enter") {
                                        onBidUpdate?.(
                                          row.adset_id,
                                          getBid(row.adset_id, fallbackBidValue),
                                          currentMode
                                        );
                                      }
                                    }}
                                  />
                                  <button
                                    className="ghost small"
                                    disabled=${bidLoading && bidLoading[row.adset_id]}
                                    onClick=${() =>
                                      onBidUpdate?.(
                                        row.adset_id,
                                        requiresBidValue
                                          ? getBid(row.adset_id, fallbackBidValue)
                                          : "",
                                        currentMode
                                      )}
                                  >
                                    ${bidLoading && bidLoading[row.adset_id]
                                      ? "..."
                                      : "Salvar"}
                                  </button>
                                </div>
                              </div>`;
                            })()
                          : "-"}
                      </td>
                      <td>${showJoinads ? row.roas_joinads || "-" : "-"}</td>
                      <td>${showJoinads ? row.lucro_op_brl || "-" : "-"}</td>
                      <td>
                        ${showJoinads && row.revenue_client_joinads != null
                          ? asText(row.revenue_client_joinads)
                          : "-"}
                      </td>
                      <td>
                        ${showJoinads && row.ecpm_client != null
                          ? asText(row.ecpm_client)
                          : "-"}
                      </td>
                      <td>
                        ${showJoinads && row.impressions_joinads != null
                          ? number.format(row.impressions_joinads)
                          : "-"}
                      </td>
                      <td>
                        ${row.ad_id
                          ? html`<div className="status-cell">
                              <span
                                className=${`status-badge ${statusTone}`}
                                title=${statusForUi || ""}
                              >
                                ${statusLabel}
                              </span>
                              ${canToggle
                                ? html`<button
                                    className=${`toggle ${isActive ? "on" : "off"}`}
                                    disabled=${busy}
                                    onClick=${() =>
                                      onToggleAd(
                                        row.ad_id,
                                        isActive ? "PAUSED" : "ACTIVE"
                                      )}
                                  >
                                    ${busy
                                      ? "..."
                                      : isActive
                                      ? "Ligado"
                                      : "Desligado"}
                                  </button>`
                                : html`<span className="muted small">Indisponível</span>`}
                            </div>`
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
              if (!showJoinads) {
                return html`<div className="muted small" style=${{ marginTop: "8px" }}>
                  JoinAds por anúncio é agregado no período. Em intervalos maiores
                  que 1 dia, os valores não são exibidos aqui para evitar distorções.
                  Veja o resumo agrupado para totais corretos.
                </div>`;
              }
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
    const key = `${row.ad_id || ""}|||${row.ad_name || ""}|||${row.adset_name || ""}|||${
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
          joinadsPickImps: null,
          joinadsPickUsd: null,
          joinadsPickBrl: null,
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
        if (item.joinadsPickImps == null && joinImps) {
          item.joinadsPickImps = joinImps;
          item.joinadsPickUsd = joinUsd;
          item.joinadsPickBrl = joinBrl;
        }
      } else if (!item.hasAdLevel) {
        item.fallbackImps = Math.max(item.fallbackImps, joinImps);
        item.fallbackRevenueUsd = Math.max(item.fallbackRevenueUsd, joinUsd);
        item.fallbackRevenueBrl = Math.max(item.fallbackRevenueBrl, joinBrl);
      }
      return map;
  }, new Map());
  const grouped = Array.from(groupedRows.values()).map((item) => {
    if (item.hasAdLevel) {
      item.impressions += item.joinadsPickImps || 0;
      item.revenue_usd += item.joinadsPickUsd || 0;
      item.revenue_brl += item.joinadsPickBrl || 0;
    } else {
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
              <th>CPA</th>
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
              ? html`<tr><td colSpan="11" className="muted">Sem dados para o periodo.</td></tr>`
              : grouped.map((row, idx) => {
                  const ecpm =
                    row.impressions > 0
                      ? (row.revenue_usd / row.impressions) * 1000
                      : null;
                  const cpa =
                    row.results > 0
                      ? row.spend / row.results
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
                      <td>${cpa != null ? currencyBRL.format(cpa) : "-"}</td>
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

function SemUtmAttribution({ semUtmRow, joinadsRows, metaRows, brlRate }) {
  const rows = Array.isArray(joinadsRows) ? joinadsRows : [];
  const metaList = Array.isArray(metaRows) ? metaRows : [];
  const semImps = toNumber(semUtmRow?.impressions);
  const semClicks = toNumber(semUtmRow?.clicks);
  const semRevenue = toNumber(semUtmRow?.revenue_client || semUtmRow?.revenue);

  if (!rows.length || (!semImps && !semClicks && !semRevenue)) {
    return html`
      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">Atribuição</span>
            <h2 className="section-title">Sem UTM -> conjunto líder</h2>
          </div>
          <span className="chip neutral">Estimativa</span>
        </div>
        <p className="muted small">
          Sem dados suficientes para atribuir Sem UTM ao conjunto líder.
        </p>
      </section>
    `;
  }

  const map = new Map();
  rows.forEach((row) => {
    const name = row.custom_value || row.name || "";
    if (!name) return;
    const key = normalizeKey(name);
    if (!map.has(key)) {
      map.set(key, {
        name,
        impressions: 0,
        clicks: 0,
        revenue: 0,
      });
    }
    const item = map.get(key);
    item.impressions += toNumber(row.impressions);
    item.clicks += toNumber(row.clicks);
    item.revenue += toNumber(row.revenue_client || row.revenue);
  });

  const list = Array.from(map.values()).map((item) => {
    const imps = item.impressions || 0;
    const revenue = item.revenue || 0;
    const clicks = item.clicks || 0;
    return {
      ...item,
      ecpm: imps ? (revenue / imps) * 1000 : 0,
      ctr: imps ? (clicks / imps) * 100 : 0,
    };
  });

  const spendByTerm = new Map();
  metaList.forEach((row) => {
    const key = normalizeKey(row.adset_name);
    if (!key) return;
    const spend = toNumber(row.spend_value || row.spend);
    if (!spendByTerm.has(key)) {
      spendByTerm.set(key, { name: row.adset_name || "-", spend: 0 });
    }
    spendByTerm.get(key).spend += spend;
  });
  const spendList = Array.from(spendByTerm.values()).sort(
    (a, b) => b.spend - a.spend
  );

  if (!list.length && !spendList.length) {
    return html`
      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">Atribuição</span>
            <h2 className="section-title">Sem UTM -> conjunto líder</h2>
          </div>
          <span className="chip neutral">Estimativa</span>
        </div>
        <p className="muted small">
          Sem dados de conjuntos (utm_term) para definir líder.
        </p>
      </section>
    `;
  }

  const hasSpend = spendList.some((row) => row.spend > 0);
  const hasEcpm = list.some((row) => row.ecpm > 0);
  const hasCtr = list.some((row) => row.ctr > 0);
  let leader = list[0];
  let criterionLabel = "Impressões";
  let criterionValue = number.format(leader?.impressions || 0);

  let leaderSpend = 0;
  if (hasSpend) {
    const top = spendList[0];
    leaderSpend = top.spend || 0;
    const byJoin = list.find(
      (row) => normalizeKey(row.name) === normalizeKey(top.name)
    );
    leader = byJoin || {
      name: top.name,
      impressions: 0,
      clicks: 0,
      revenue: 0,
      ecpm: 0,
      ctr: 0,
    };
    criterionLabel = "Gasto (Meta)";
    criterionValue = currencyBRL.format(top.spend || 0);
  } else if (hasEcpm) {
    leader = list.reduce((best, row) => (row.ecpm > best.ecpm ? row : best));
    criterionLabel = "eCPM";
    criterionValue = currencyUSD.format(leader.ecpm || 0);
  } else if (hasCtr) {
    leader = list.reduce((best, row) => (row.ctr > best.ctr ? row : best));
    criterionLabel = "CTR";
    criterionValue = `${(leader.ctr || 0).toFixed(2)}%`;
  } else {
    leader = list.reduce((best, row) =>
      row.impressions > best.impressions ? row : best
    );
    criterionLabel = "Impressões";
    criterionValue = number.format(leader.impressions || 0);
  }

  const leaderImps = leader.impressions || 0;
  const leaderClicks = leader.clicks || 0;
  const leaderRevenue = leader.revenue || 0;
  const leaderEcpm =
    leaderImps > 0 ? (leaderRevenue / leaderImps) * 1000 : 0;
  const leaderRevenueBrl = brlRate ? leaderRevenue * brlRate : null;
  const semRevenueBrl = brlRate ? semRevenue * brlRate : null;
  const totalRevenueBrl =
    leaderRevenueBrl != null && semRevenueBrl != null
      ? leaderRevenueBrl + semRevenueBrl
      : null;
  const roasLeader =
    leaderRevenueBrl != null && leaderSpend > 0
      ? leaderRevenueBrl / leaderSpend
      : null;
  const roasTotal =
    totalRevenueBrl != null && leaderSpend > 0
      ? totalRevenueBrl / leaderSpend
      : null;

  const totalImps = leaderImps + semImps;
  const totalClicks = leaderClicks + semClicks;
  const totalRevenue = leaderRevenue + semRevenue;
  const totalEcpm = totalImps > 0 ? (totalRevenue / totalImps) * 1000 : 0;

  return html`
    <section className="card wide">
      <div className="card-head">
        <div>
          <span className="eyebrow">Atribuição</span>
          <h2 className="section-title">Sem UTM -> conjunto líder</h2>
        </div>
        <div className="chip-group">
          <span className="chip neutral">Critério: ${criterionLabel}</span>
          <span className="chip neutral">${criterionValue}</span>
        </div>
      </div>
      <div className="table-wrapper scroll-x">
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Conjunto</th>
              <th>Impressões</th>
              <th>Cliques</th>
              <th>Receita cliente</th>
              <th>eCPM cliente</th>
              <th>ROAS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Líder (original)</td>
              <td>${leader.name}</td>
              <td>${number.format(leaderImps)}</td>
              <td>${number.format(leaderClicks)}</td>
              <td>${currencyUSD.format(leaderRevenue)}</td>
              <td>${currencyUSD.format(leaderEcpm || 0)}</td>
              <td>${roasLeader != null ? `${roasLeader.toFixed(2)}x` : "-"}</td>
            </tr>
            <tr>
              <td>Sem UTM (estimado)</td>
              <td>-</td>
              <td>${number.format(semImps)}</td>
              <td>${number.format(semClicks)}</td>
              <td>${currencyUSD.format(semRevenue)}</td>
              <td>${currencyUSD.format(
                semImps ? (semRevenue / semImps) * 1000 : 0
              )}</td>
              <td>-</td>
            </tr>
            <tr className="summary-row">
              <td><strong>Total atribuído</strong></td>
              <td><strong>${leader.name}</strong></td>
              <td><strong>${number.format(totalImps)}</strong></td>
              <td><strong>${number.format(totalClicks)}</strong></td>
              <td><strong>${currencyUSD.format(totalRevenue)}</strong></td>
              <td><strong>${currencyUSD.format(totalEcpm || 0)}</strong></td>
              <td><strong>${roasTotal != null ? `${roasTotal.toFixed(2)}x` : "-"}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Estimativa: Sem UTM foi atribuído ao conjunto líder pelo critério de
        ${criterionLabel}. Use como referência, não como dado oficial.
      </p>
    </section>
  `;
}

function MetaJoinAdsetTable({ rows, joinadsRows, brlRate }) {
  const safeJoinadsRows = Array.isArray(joinadsRows) ? joinadsRows : [];
  const asText = (value) => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const joinadsByTerm = new Map();
  safeJoinadsRows.forEach((row) => {
    const key = normalizeKey(row.custom_value);
    if (!key) return;
    const entry = joinadsByTerm.get(key) || {
      impressions: 0,
      clicks: 0,
      revenue_client: 0,
      revenue: 0,
      ecpm_client: null,
      ecpm: null,
    };
    entry.impressions += toNumber(row.impressions);
    entry.clicks += toNumber(row.clicks);
    entry.revenue_client += toNumber(row.revenue_client);
    entry.revenue += toNumber(row.revenue);
    if (entry.ecpm_client == null && row.ecpm_client != null) {
      entry.ecpm_client = toNumber(row.ecpm_client);
    }
    if (entry.ecpm == null && row.ecpm != null) {
      entry.ecpm = toNumber(row.ecpm);
    }
    joinadsByTerm.set(key, entry);
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
        item.ecpm_client =
          join.ecpm_client ?? join.ecpm ?? (item.impressions > 0 ? (usd / item.impressions) * 1000 : null);
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
                    row.ecpm_client != null
                      ? row.ecpm_client
                      : row.impressions > 0 && row.revenue_usd != null
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
// ── Criar Campanha ────────────────────────────────────────────────────────

const OBJECTIVES = [
  { value: "OUTCOME_TRAFFIC", label: "Tráfego" },
  { value: "OUTCOME_SALES", label: "Vendas" },
  { value: "OUTCOME_LEADS", label: "Cadastros" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engajamento" },
  { value: "OUTCOME_AWARENESS", label: "Reconhecimento" },
  { value: "OUTCOME_APP_PROMOTION", label: "Promoção de app" },
];

const OPTIMIZATION_GOALS_MAP = {
  OUTCOME_TRAFFIC: [
    { value: "LINK_CLICKS", label: "Cliques no link" },
    { value: "LANDING_PAGE_VIEWS", label: "Visualizações da landing page" },
    { value: "REACH", label: "Alcance" },
    { value: "IMPRESSIONS", label: "Impressões" },
  ],
  OUTCOME_SALES: [
    { value: "OFFSITE_CONVERSIONS", label: "Conversões" },
    { value: "LINK_CLICKS", label: "Cliques no link" },
    { value: "REACH", label: "Alcance" },
  ],
  OUTCOME_LEADS: [
    { value: "LEAD_GENERATION", label: "Geração de leads" },
    { value: "LINK_CLICKS", label: "Cliques no link" },
  ],
  OUTCOME_ENGAGEMENT: [
    { value: "POST_ENGAGEMENT", label: "Engajamento com publicação" },
    { value: "PAGE_LIKES", label: "Curtidas na página" },
    { value: "LINK_CLICKS", label: "Cliques no link" },
  ],
  OUTCOME_AWARENESS: [
    { value: "REACH", label: "Alcance" },
    { value: "IMPRESSIONS", label: "Impressões" },
    { value: "BRAND_AWARENESS", label: "Reconhecimento da marca" },
  ],
  OUTCOME_APP_PROMOTION: [
    { value: "APP_INSTALLS", label: "Instalações do app" },
    { value: "LINK_CLICKS", label: "Cliques no link" },
  ],
};

const CTA_TYPES = [
  { value: "LEARN_MORE", label: "Saiba mais" },
  { value: "SHOP_NOW", label: "Comprar agora" },
  { value: "SIGN_UP", label: "Cadastrar" },
  { value: "GET_QUOTE", label: "Ver oferta" },
  { value: "DOWNLOAD", label: "Baixar" },
  { value: "CONTACT_US", label: "Fale conosco" },
  { value: "APPLY_NOW", label: "Candidatar-se" },
  { value: "BOOK_NOW", label: "Agendar" },
  { value: "SUBSCRIBE", label: "Assinar" },
  { value: "NO_BUTTON", label: "Sem botão" },
];

const CONVERSION_EVENTS = [
  { value: "PURCHASE", label: "Compra" },
  { value: "LEAD", label: "Lead" },
  { value: "COMPLETE_REGISTRATION", label: "Cadastro completo" },
  { value: "ADD_TO_CART", label: "Adicionar ao carrinho" },
  { value: "VIEW_CONTENT", label: "Visualizar conteúdo" },
  { value: "INITIATE_CHECKOUT", label: "Iniciar checkout" },
  { value: "ADD_PAYMENT_INFO", label: "Dados de pagamento" },
  { value: "SEARCH", label: "Pesquisa" },
  { value: "CONTACT", label: "Contato" },
  { value: "SUBSCRIBE", label: "Assinar" },
];

const UTM_MACROS = [
  { label: "{{ad.name}}", tip: "Nome do anúncio" },
  { label: "{{adset.name}}", tip: "Nome do conjunto" },
  { label: "{{campaign.name}}", tip: "Nome da campanha" },
  { label: "{{placement}}", tip: "Posicionamento" },
  { label: "{{site_source_name}}", tip: "Fonte (fb/ig/etc)" },
];

const PIXEL_CONVERSION_OBJECTIVES = new Set([
  "OUTCOME_SALES", "OUTCOME_LEADS",
]);

const PLACEMENT_LABELS = {
  facebook_feed: "Facebook Feed",
  instagram_feed: "Instagram Feed",
  facebook_stories: "Facebook Stories",
  instagram_stories: "Instagram Stories",
  facebook_reels: "Facebook Reels",
  instagram_reels: "Instagram Reels",
  audience_network: "Audience Network",
  messenger: "Messenger",
};

const EMPTY_PLACEMENTS = {
  facebook_feed: true,
  instagram_feed: true,
  facebook_stories: false,
  instagram_stories: false,
  facebook_reels: false,
  instagram_reels: false,
  audience_network: false,
  messenger: false,
};

// ── Country Picker ─────────────────────────────────────────────────────────

const COUNTRY_LIST = [
  { code: "BR", name: "Brasil",           region: "latam",         lat: -14.24,  lng: -51.93 },
  { code: "MX", name: "México",           region: "latam",         lat:  23.63,  lng: -102.55 },
  { code: "AR", name: "Argentina",        region: "latam",         lat: -38.42,  lng: -63.62 },
  { code: "CO", name: "Colômbia",         region: "latam",         lat:   4.57,  lng: -74.30 },
  { code: "CL", name: "Chile",            region: "latam",         lat: -35.68,  lng: -71.54 },
  { code: "PE", name: "Peru",             region: "latam",         lat:  -9.19,  lng: -75.02 },
  { code: "EC", name: "Equador",          region: "latam",         lat:  -1.83,  lng: -78.18 },
  { code: "UY", name: "Uruguai",          region: "latam",         lat: -32.52,  lng: -55.77 },
  { code: "PY", name: "Paraguai",         region: "latam",         lat: -23.44,  lng: -58.44 },
  { code: "BO", name: "Bolívia",          region: "latam",         lat: -16.29,  lng: -63.59 },
  { code: "VE", name: "Venezuela",        region: "latam",         lat:   6.42,  lng: -66.59 },
  { code: "CU", name: "Cuba",             region: "latam",         lat:  21.52,  lng: -77.78 },
  { code: "DO", name: "Rep. Dominicana",  region: "latam",         lat:  18.74,  lng: -70.16 },
  { code: "GT", name: "Guatemala",        region: "latam",         lat:  15.78,  lng: -90.23 },
  { code: "HN", name: "Honduras",         region: "latam",         lat:  15.20,  lng: -86.24 },
  { code: "SV", name: "El Salvador",      region: "latam",         lat:  13.79,  lng: -88.90 },
  { code: "NI", name: "Nicarágua",        region: "latam",         lat:  12.87,  lng: -85.21 },
  { code: "CR", name: "Costa Rica",       region: "latam",         lat:   9.75,  lng: -83.75 },
  { code: "PA", name: "Panamá",           region: "latam",         lat:   8.54,  lng: -80.78 },
  { code: "PT", name: "Portugal",         region: "europe",        lat:  39.40,  lng:  -8.22 },
  { code: "ES", name: "Espanha",          region: "europe",        lat:  40.46,  lng:  -3.75 },
  { code: "GB", name: "Reino Unido",      region: "europe",        lat:  55.38,  lng:  -3.44 },
  { code: "FR", name: "França",           region: "europe",        lat:  46.23,  lng:   2.21 },
  { code: "DE", name: "Alemanha",         region: "europe",        lat:  51.17,  lng:  10.45 },
  { code: "IT", name: "Itália",           region: "europe",        lat:  41.87,  lng:  12.57 },
  { code: "NL", name: "Países Baixos",    region: "europe",        lat:  52.13,  lng:   5.29 },
  { code: "BE", name: "Bélgica",          region: "europe",        lat:  50.50,  lng:   4.47 },
  { code: "SE", name: "Suécia",           region: "europe",        lat:  60.13,  lng:  18.64 },
  { code: "NO", name: "Noruega",          region: "europe",        lat:  60.47,  lng:   8.47 },
  { code: "CH", name: "Suíça",            region: "europe",        lat:  46.82,  lng:   8.23 },
  { code: "PL", name: "Polônia",          region: "europe",        lat:  51.92,  lng:  19.15 },
  { code: "RO", name: "Romênia",          region: "europe",        lat:  45.94,  lng:  24.97 },
  { code: "GR", name: "Grécia",           region: "europe",        lat:  39.07,  lng:  21.82 },
  { code: "AT", name: "Áustria",          region: "europe",        lat:  47.52,  lng:  14.55 },
  { code: "US", name: "Estados Unidos",   region: "north-america", lat:  37.09,  lng: -95.71 },
  { code: "CA", name: "Canadá",           region: "north-america", lat:  56.13,  lng: -106.35 },
  { code: "AU", name: "Austrália",        region: "asia-oceania",  lat: -25.27,  lng: 133.78 },
  { code: "NZ", name: "Nova Zelândia",    region: "asia-oceania",  lat: -40.90,  lng: 174.89 },
  { code: "JP", name: "Japão",            region: "asia-oceania",  lat:  36.20,  lng: 138.25 },
  { code: "IN", name: "Índia",            region: "asia-oceania",  lat:  20.59,  lng:  78.96 },
  { code: "PH", name: "Filipinas",        region: "asia-oceania",  lat:  12.88,  lng: 121.77 },
  { code: "ID", name: "Indonésia",        region: "asia-oceania",  lat:  -0.79,  lng: 113.92 },
  { code: "TH", name: "Tailândia",        region: "asia-oceania",  lat:  15.87,  lng: 100.99 },
  { code: "SG", name: "Singapura",        region: "asia-oceania",  lat:   1.35,  lng: 103.82 },
  { code: "MY", name: "Malásia",          region: "asia-oceania",  lat:   4.21,  lng: 101.98 },
  { code: "NG", name: "Nigéria",          region: "africa-me",     lat:   9.08,  lng:   8.68 },
  { code: "ZA", name: "África do Sul",    region: "africa-me",     lat: -30.56,  lng:  22.94 },
  { code: "EG", name: "Egito",            region: "africa-me",     lat:  26.82,  lng:  30.80 },
  { code: "MA", name: "Marrocos",         region: "africa-me",     lat:  31.79,  lng:  -7.09 },
  { code: "AE", name: "Emirados Árabes",  region: "africa-me",     lat:  23.42,  lng:  53.85 },
  { code: "SA", name: "Arábia Saudita",   region: "africa-me",     lat:  23.89,  lng:  45.08 },
  { code: "IL", name: "Israel",           region: "africa-me",     lat:  31.05,  lng:  34.85 },
];

const COUNTRY_REGIONS = {
  latam: "América Latina",
  europe: "Europa",
  "north-america": "América do Norte",
  "asia-oceania": "Ásia / Oceania",
  "africa-me": "África / Oriente Médio",
};

const COUNTRY_MAP = Object.fromEntries(COUNTRY_LIST.map((c) => [c.code, c]));

const LANGUAGE_LIST = [
  { id: 5,   label: "Português (Brasil)" },
  { id: 41,  label: "Português (Portugal)" },
  { id: 6,   label: "Espanhol" },
  { id: 2,   label: "Inglês (EUA)" },
  { id: 10,  label: "Inglês (UK)" },
  { id: 31,  label: "Francês" },
  { id: 30,  label: "Alemão" },
  { id: 36,  label: "Italiano" },
  { id: 24,  label: "Holandês" },
  { id: 45,  label: "Polonês" },
  { id: 32,  label: "Romeno" },
  { id: 9,   label: "Japonês" },
  { id: 23,  label: "Coreano" },
  { id: 27,  label: "Chinês (Simplificado)" },
  { id: 28,  label: "Chinês (Tradicional)" },
  { id: 4,   label: "Árabe" },
  { id: 16,  label: "Hindi" },
  { id: 39,  label: "Indonésio" },
  { id: 34,  label: "Tailandês" },
];

function flagEmoji(code) {
  if (!code || code.length !== 2) return "🌐";
  return [...code.toUpperCase()].map((c) =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  ).join("");
}

function LocationPicker({ selected, onChange }) {
  const [locType, setLocType] = useState("recent");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef([]);

  useEffect(() => {
    if (!mapContainerRef.current || !window.L) return;
    const L = window.L;
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false,
    }).setView([15, 10], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;
    const map = mapInstanceRef.current;
    layersRef.current.forEach((l) => map.removeLayer(l));
    layersRef.current = [];
    if (selected.length === 0) { map.setView([15, 10], 2); return; }
    const pts = [];
    selected.forEach((code) => {
      const c = COUNTRY_MAP[code];
      if (!c || c.lat == null) return;
      const big = ["BR", "US", "CA", "AU", "RU", "CN", "IN", "AR", "MX"];
      const radius = big.includes(code) ? 700000 : 220000;
      const circle = L.circle([c.lat, c.lng], {
        radius,
        color: "#1f7a6d", fillColor: "#1f7a6d", fillOpacity: 0.25, weight: 2,
      }).addTo(map);
      const dot = L.circleMarker([c.lat, c.lng], {
        radius: 6, color: "#fff", fillColor: "#198a76", fillOpacity: 1, weight: 2,
      }).addTo(map);
      layersRef.current.push(circle, dot);
      pts.push([c.lat, c.lng]);
    });
    if (pts.length === 1) map.setView(pts[0], 5);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 7 });
  }, [selected]);

  const doSearch = () => {
    const q = query.trim().toLowerCase();
    if (!q) { setSearchResults([]); return; }
    setSearchResults(
      COUNTRY_LIST.filter((c) =>
        c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
      ).slice(0, 8)
    );
  };

  const add = (code) => {
    if (!selected.includes(code)) onChange([...selected, code]);
    setQuery(""); setSearchResults([]);
  };
  const remove = (code) => onChange(selected.filter((c) => c !== code));

  const pinSvg = '<svg width="14" height="18" viewBox="0 0 24 24" fill="#198a76"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>';

  return html`
    <div>
      <select
        value=${locType}
        onChange=${(e) => setLocType(e.target.value)}
        style=${{ width: "100%", marginBottom: "12px" }}
      >
        <option value="recent">Pessoas que moram ou estiveram recentemente nesta localização</option>
        <option value="live">Pessoas que moram nesta localização</option>
        <option value="travel">Pessoas viajando para este local</option>
      </select>

      <div style=${{ border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden", marginBottom: "12px", background: "#fff" }}>
        ${selected.length === 0 ? html`
          <div style=${{ padding: "12px 14px", color: "var(--muted)", fontSize: "0.88rem" }}>
            Nenhuma localização adicionada. Use a busca abaixo para adicionar países.
          </div>
        ` : selected.map((code) => html`
          <div key=${code} style=${{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 14px", borderBottom: "1px solid var(--border-light)", background: "#fff",
          }}>
            <span dangerouslySetInnerHTML=${{ __html: pinSvg }} style=${{ flexShrink: 0, display: "flex" }} />
            <span style=${{ flex: 1, fontWeight: 500, fontSize: "0.92rem" }}>${COUNTRY_MAP[code]?.name || code}</span>
            <div style=${{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style=${{
                fontSize: "0.78rem", padding: "3px 10px",
                border: "1px solid #b2dfdb", borderRadius: "6px",
                background: "#e8f5e9", color: "#198a76", fontWeight: 600,
              }}>Incluir ▾</span>
              <button
                onClick=${() => remove(code)}
                style=${{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "1rem", padding: "0 4px", lineHeight: 1 }}
              >✕</button>
            </div>
          </div>
        `)}
      </div>

      <div style=${{ display: "flex", gap: "8px", marginBottom: "8px", position: "relative" }}>
        <input
          type="text"
          value=${query}
          onInput=${(e) => { setQuery(e.target.value); doSearch(); }}
          onKeyDown=${(e) => { if (e.key === "Enter") doSearch(); }}
          placeholder="Pesquisar localizações"
          style=${{ flex: 1 }}
        />
        <button className="ghost" onClick=${doSearch}>Procurar</button>
      </div>

      ${searchResults.length > 0 ? html`
        <div style=${{
          border: "1px solid var(--border)", borderRadius: "8px", background: "#fff",
          marginBottom: "12px", boxShadow: "0 4px 12px rgba(20,18,58,0.08)", overflow: "hidden",
        }}>
          ${searchResults.map((c) => html`
            <div key=${c.code}
              onClick=${() => add(c.code)}
              style=${{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "9px 14px", cursor: "pointer", fontSize: "0.9rem",
                background: selected.includes(c.code) ? "#e8f5e9" : "transparent",
                borderBottom: "1px solid var(--border-light)",
              }}
              onMouseEnter=${(e) => { if (!selected.includes(c.code)) e.currentTarget.style.background = "#f7f8ff"; }}
              onMouseLeave=${(e) => { e.currentTarget.style.background = selected.includes(c.code) ? "#e8f5e9" : "transparent"; }}
            >
              <span dangerouslySetInnerHTML=${{ __html: pinSvg }} style=${{ flexShrink: 0, display: "flex" }} />
              <span style=${{ flex: 1 }}>${c.name}</span>
              <span style=${{ fontSize: "0.78rem", color: "var(--muted)" }}>${c.code}</span>
              ${selected.includes(c.code) ? html`<span style=${{ color: "#198a76", fontWeight: 700 }}>✓</span>` : null}
            </div>
          `)}
        </div>
      ` : null}

      <div
        ref=${mapContainerRef}
        style=${{ height: "220px", borderRadius: "10px", overflow: "hidden", border: "1px solid var(--border)" }}
      />
    </div>
  `;
}

function CriarCampanhaView({ accountId, pages, pagesLoading, onLoadPages, pixels, pixelsLoading, onLoadPixels }) {
  const [step, setStep] = useState(1);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState(null);
  const [formError, setFormError] = useState("");

  // Campanha
  const [campName, setCampName] = useState("");
  const [objective, setObjective] = useState("OUTCOME_TRAFFIC");
  const [specialCat, setSpecialCat] = useState("NONE");
  const [campStatus, setCampStatus] = useState("PAUSED");
  const [cbo, setCbo] = useState(false);
  const [campBudgetType, setCampBudgetType] = useState("daily");
  const [campBudget, setCampBudget] = useState("");

  // Conjunto
  const [adsetName, setAdsetName] = useState("");
  const [adsetBudgetType, setAdsetBudgetType] = useState("daily");
  const [adsetBudget, setAdsetBudget] = useState("");
  const [countries, setCountries] = useState(["BR"]);
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("65");
  const [gender, setGender] = useState("all");
  const [placementMode, setPlacementMode] = useState("auto");
  const [manualPlacements, setManualPlacements] = useState({ ...EMPTY_PLACEMENTS });
  const [optGoal, setOptGoal] = useState("LINK_CLICKS");
  const [bidStrategy, setBidStrategy] = useState("LOWEST_COST_WITHOUT_CAP");
  const [bidAmount, setBidAmount] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // Anúncio
  const [skipAd, setSkipAd] = useState(false);
  const [adName, setAdName] = useState("");
  const [pageId, setPageId] = useState("");
  const [adFormat, setAdFormat] = useState("image"); // "image" | "video"
  const [imageUrl, setImageUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [thumbUrl, setThumbUrl] = useState("");
  const [igActorId, setIgActorId] = useState("");
  const [headline, setHeadline] = useState("");
  const [adBody, setAdBody] = useState("");
  const [adDescription, setAdDescription] = useState("");
  const [ctaType, setCtaType] = useState("LEARN_MORE");
  const [destUrl, setDestUrl] = useState("");

  // Campanha avançado
  const [spendingLimit, setSpendingLimit] = useState("");

  // Conjunto avançado
  const [pixelId, setPixelId] = useState("");
  const [conversionEvent, setConversionEvent] = useState("PURCHASE");
  const [devicePlatforms, setDevicePlatforms] = useState(["mobile", "desktop"]);
  const [locLanguages, setLocLanguages] = useState([]);

  const availableGoals = OPTIMIZATION_GOALS_MAP[objective] || OPTIMIZATION_GOALS_MAP["OUTCOME_TRAFFIC"];

  const handleObjectiveChange = (val) => {
    setObjective(val);
    const goals = OPTIMIZATION_GOALS_MAP[val] || [];
    if (goals.length) setOptGoal(goals[0].value);
  };

  const resetForm = () => {
    setStep(1); setResult(null); setFormError("");
    setCampName(""); setObjective("OUTCOME_TRAFFIC"); setSpecialCat("NONE");
    setCampStatus("PAUSED"); setCbo(false); setCampBudgetType("daily"); setCampBudget("");
    setSpendingLimit("");
    setAdsetName(""); setAdsetBudgetType("daily"); setAdsetBudget("");
    setCountries(["BR"]); setAgeMin("18"); setAgeMax("65"); setGender("all");
    setPlacementMode("auto"); setManualPlacements({ ...EMPTY_PLACEMENTS });
    setOptGoal("LINK_CLICKS"); setBidStrategy("LOWEST_COST_WITHOUT_CAP");
    setBidAmount(""); setStartTime(""); setEndTime("");
    setPixelId(""); setConversionEvent("PURCHASE"); setDevicePlatforms(["mobile", "desktop"]);
    setLocLanguages([]);
    setSkipAd(false); setAdName(""); setPageId(""); setAdFormat("image");
    setImageUrl(""); setVideoId(""); setThumbUrl(""); setIgActorId("");
    setHeadline(""); setAdBody(""); setAdDescription(""); setCtaType("LEARN_MORE"); setDestUrl("");
  };

  const handlePublish = async () => {
    setPublishing(true);
    setFormError("");
    try {
      const payload = {
        account_id: accountId,
        campaign: {
          name: campName.trim(),
          objective,
          status: campStatus,
          special_ad_categories: [specialCat],
          ...(cbo && campBudgetType === "daily" ? { daily_budget: Math.round(Number(campBudget) * 100) } : {}),
          ...(cbo && campBudgetType === "lifetime" ? { lifetime_budget: Math.round(Number(campBudget) * 100) } : {}),
          ...(spendingLimit ? { spending_limit: Math.round(Number(spendingLimit) * 100) } : {}),
        },
        adset: {
          name: adsetName.trim() || `${campName.trim()} — Conjunto`,
          optimization_goal: optGoal,
          bid_strategy: bidStrategy,
          status: campStatus,
          ...(!cbo && adsetBudgetType === "daily" ? { daily_budget: Math.round(Number(adsetBudget) * 100) } : {}),
          ...(!cbo && adsetBudgetType === "lifetime" ? { lifetime_budget: Math.round(Number(adsetBudget) * 100) } : {}),
          ...(bidAmount ? { bid_amount: Math.round(Number(bidAmount) * 100) } : {}),
          countries,
          age_min: Number(ageMin),
          age_max: Number(ageMax),
          genders: gender === "male" ? [1] : gender === "female" ? [2] : [],
          device_platforms: devicePlatforms,
          ...(placementMode === "manual" ? { manual_placements: manualPlacements } : {}),
          ...(startTime ? { start_time: new Date(startTime).toISOString() } : {}),
          ...(endTime ? { end_time: new Date(endTime).toISOString() } : {}),
          ...(pixelId ? { pixel_id: pixelId.trim(), conversion_event: conversionEvent } : {}),
          ...(locLanguages.length > 0 ? { locales: locLanguages } : {}),
        },
        ...(!skipAd ? {
          ad: {
            name: adName.trim() || `${campName.trim()} — Anúncio`,
            page_id: pageId,
            ad_format: adFormat,
            image_url: adFormat === "image" ? imageUrl.trim() : undefined,
            video_id: adFormat === "video" ? videoId.trim() : undefined,
            thumb_url: adFormat === "video" ? thumbUrl.trim() : undefined,
            ig_actor_id: igActorId.trim() || undefined,
            headline: headline.trim(),
            body: adBody.trim(),
            description: adDescription.trim(),
            cta_type: ctaType,
            destination_url: destUrl.trim(),
          },
        } : {}),
      };

      const res = await fetchJson("/api/meta-campaign-create", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setResult(res);
      setStep(5);
    } catch (err) {
      setFormError(formatError(err));
    } finally {
      setPublishing(false);
    }
  };

  const step1Valid = campName.trim() && (!cbo || campBudget);
  const step2Valid = cbo || adsetBudget;
  const step3Valid = skipAd || (
    pageId && destUrl.trim() && headline.trim() &&
    (adFormat === "image" ? imageUrl.trim() : videoId.trim())
  );

  const StepDot = ({ n }) => {
    const current = n === step;
    const done = n < step;
    return html`
      <div style=${{
        display: "flex", alignItems: "center", gap: "6px",
        opacity: n > step ? 0.4 : 1,
      }}>
        <div style=${{
          width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
          background: current ? "var(--accent)" : done ? "var(--accent-2)" : "var(--border)",
          color: current || done ? "#fff" : "var(--muted)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "0.8rem", fontWeight: "700",
        }}>${done ? "✓" : n}</div>
        <span style=${{ fontSize: "0.85rem", fontWeight: current ? 700 : 500, color: current ? "var(--ink)" : "var(--muted)", whiteSpace: "nowrap" }}>
          ${["", "Campanha", "Conjunto", "Anúncio", "Revisão"][n]}
        </span>
      </div>
    `;
  };

  const StepBar = () => html`
    <div style=${{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "24px", flexWrap: "wrap" }}>
      ${[1, 2, 3, 4].map((n) => html`
        <${StepDot} key=${n} n=${n} />
        ${n < 4 ? html`<div style=${{ flex: "1 1 16px", height: "1px", background: "var(--border)", minWidth: "12px" }}></div>` : null}
      `)}
    </div>
  `;

  // ── Tela de sucesso ───────────────────────────────────────────────────────
  if (step === 5) {
    const ok = result?.code === "success";
    return html`
      <section className="card wide" style=${{ textAlign: "center", padding: "48px 24px" }}>
        <div style=${{ fontSize: "3rem", marginBottom: "12px" }}>${ok ? "✅" : "⚠️"}</div>
        <h2 className="section-title" style=${{ marginBottom: "8px" }}>
          ${ok ? "Campanha criada com sucesso!" : "Criação parcial — verifique abaixo"}
        </h2>
        ${result?.error ? html`<p className="muted small" style=${{ margin: "8px 0" }}>${result.error}</p>` : null}
        <div style=${{ display: "inline-flex", flexDirection: "column", gap: "6px", margin: "20px auto", fontSize: "0.92rem", textAlign: "left" }}>
          ${result?.campaign_id ? html`<div>🎯 Campanha: <code style=${{ background: "#f0f1ff", padding: "2px 6px", borderRadius: "6px" }}>${result.campaign_id}</code></div>` : null}
          ${result?.adset_id ? html`<div>📦 Conjunto: <code style=${{ background: "#f0f1ff", padding: "2px 6px", borderRadius: "6px" }}>${result.adset_id}</code></div>` : null}
          ${result?.ad_id ? html`<div>📣 Anúncio: <code style=${{ background: "#f0f1ff", padding: "2px 6px", borderRadius: "6px" }}>${result.ad_id}</code></div>` : null}
        </div>
        <p className="muted small">Tudo criado com status <strong>Pausado</strong>. Revise e ative no Gerenciador de Anúncios quando pronto.</p>
        <button className="primary" onClick=${resetForm} style=${{ marginTop: "20px" }}>
          + Criar outra campanha
        </button>
      </section>
    `;
  }

  return html`
    <div style=${{ gridColumn: "1 / -1" }}>
      <${StepBar} />
      ${formError ? html`<div className="status error" style=${{ marginBottom: "16px" }}><strong>Erro:</strong> ${formError}</div>` : null}

      ${/* ── Passo 1: Campanha ── */ step === 1 && html`
        <section className="card wide">
          <div className="card-head">
            <div>
              <span className="eyebrow">Passo 1 de 4</span>
              <h2 className="section-title">Campanha</h2>
            </div>
          </div>
          <div className="filters">
            <div className="field">
              <label>Nome da campanha *</label>
              <input type="text" value=${campName} onInput=${(e) => setCampName(e.target.value)} placeholder="Ex: Tráfego BR — Artigo Saúde" />
            </div>
            <div className="field">
              <label>Objetivo *</label>
              <select value=${objective} onChange=${(e) => handleObjectiveChange(e.target.value)}>
                ${OBJECTIVES.map((o) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
              </select>
            </div>
            <div className="field">
              <label>Categoria especial de anúncios</label>
              <select value=${specialCat} onChange=${(e) => setSpecialCat(e.target.value)}>
                <option value="NONE">Nenhuma</option>
                <option value="EMPLOYMENT">Emprego</option>
                <option value="HOUSING">Habitação</option>
                <option value="CREDIT">Crédito</option>
                <option value="ISSUES_ELECTIONS_POLITICS">Política / Eleições</option>
              </select>
            </div>
            <div className="field">
              <label>Status ao criar</label>
              <select value=${campStatus} onChange=${(e) => setCampStatus(e.target.value)}>
                <option value="PAUSED">Pausado (recomendado)</option>
                <option value="ACTIVE">Ativo imediatamente</option>
              </select>
            </div>
            <div className="field">
              <label>Limite de gastos da campanha (R$) <span className="muted small">— opcional</span></label>
              <input type="number" min="1" step="0.01" value=${spendingLimit} onInput=${(e) => setSpendingLimit(e.target.value)} placeholder="Ex: 500.00 (sem limite = vazio)" />
            </div>
          </div>
          <div style=${{ padding: "14px 16px", border: "1px solid var(--border)", borderRadius: "12px", background: "#f8f9ff" }}>
            <label className="checkbox" style=${{ cursor: "pointer", marginBottom: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
              <input type="checkbox" checked=${cbo} onChange=${(e) => setCbo(e.target.checked)} />
              <strong>CBO — Otimização de orçamento da campanha</strong>
            </label>
            <p className="muted small" style=${{ margin: "0 0 0 24px" }}>
              O Meta distribui automaticamente o orçamento entre os conjuntos conforme performance.
            </p>
            ${cbo ? html`
              <div className="filters" style=${{ marginTop: "14px" }}>
                <div className="field">
                  <label>Tipo de orçamento *</label>
                  <select value=${campBudgetType} onChange=${(e) => setCampBudgetType(e.target.value)}>
                    <option value="daily">Diário</option>
                    <option value="lifetime">Vitalício</option>
                  </select>
                </div>
                <div className="field">
                  <label>Valor (R$) *</label>
                  <input type="number" min="1" step="0.01" value=${campBudget} onInput=${(e) => setCampBudget(e.target.value)} placeholder="Ex: 100.00" />
                </div>
              </div>
            ` : null}
          </div>
          <div style=${{ display: "flex", justifyContent: "flex-end" }}>
            <button className="primary" disabled=${!step1Valid} onClick=${() => setStep(2)}>
              Próximo: Conjunto →
            </button>
          </div>
        </section>
      `}

      ${/* ── Passo 2: Conjunto ── */ step === 2 && html`
        <section className="card wide">
          <div className="card-head">
            <div>
              <span className="eyebrow">Passo 2 de 4</span>
              <h2 className="section-title">Conjunto de anúncios</h2>
            </div>
          </div>
          <div className="filters">
            <div className="field">
              <label>Nome do conjunto</label>
              <input type="text" value=${adsetName} onInput=${(e) => setAdsetName(e.target.value)} placeholder="Deixe vazio para gerar automaticamente" />
            </div>
            <div className="field" style=${{ gridColumn: "1 / -1" }}>
              <label>Locais de segmentação</label>
              <${LocationPicker} selected=${countries} onChange=${setCountries} />
            </div>
            <div className="field" style=${{ gridColumn: "1 / -1" }}>
              <label>Idiomas <span className="muted small">(vazio = todos)</span></label>
              <div style=${{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                ${locLanguages.map((id) => {
                  const lang = LANGUAGE_LIST.find((l) => l.id === id);
                  return html`
                    <span key=${id} style=${{
                      display: "inline-flex", alignItems: "center", gap: "5px",
                      padding: "4px 10px 4px 10px", borderRadius: "999px",
                      background: "#e8f5e9", border: "1px solid #b2dfdb",
                      fontSize: "0.83rem", fontWeight: 600, color: "#198a76",
                    }}>
                      ${lang?.label || id}
                      <button
                        onClick=${() => setLocLanguages(locLanguages.filter((x) => x !== id))}
                        style=${{ background: "none", border: "none", cursor: "pointer", color: "#198a76", fontSize: "0.75rem", padding: "0 0 0 2px", lineHeight: 1 }}
                      >✕</button>
                    </span>
                  `;
                })}
              </div>
              <select
                value=""
                onChange=${(e) => {
                  const id = Number(e.target.value);
                  if (id && !locLanguages.includes(id)) setLocLanguages([...locLanguages, id]);
                  e.target.value = "";
                }}
              >
                <option value="">+ Adicionar idioma...</option>
                ${LANGUAGE_LIST.filter((l) => !locLanguages.includes(l.id)).map((l) => html`
                  <option key=${l.id} value=${l.id}>${l.label}</option>
                `)}
              </select>
            </div>
            <div className="field">
              <label>Idade mínima</label>
              <input type="number" min="18" max="65" value=${ageMin} onInput=${(e) => setAgeMin(e.target.value)} />
            </div>
            <div className="field">
              <label>Idade máxima</label>
              <input type="number" min="18" max="65" value=${ageMax} onInput=${(e) => setAgeMax(e.target.value)} />
            </div>
            <div className="field">
              <label>Gênero</label>
              <select value=${gender} onChange=${(e) => setGender(e.target.value)}>
                <option value="all">Todos</option>
                <option value="male">Masculino</option>
                <option value="female">Feminino</option>
              </select>
            </div>
            <div className="field">
              <label>Objetivo de otimização</label>
              <select value=${optGoal} onChange=${(e) => setOptGoal(e.target.value)}>
                ${availableGoals.map((g) => html`<option key=${g.value} value=${g.value}>${g.label}</option>`)}
              </select>
            </div>
            <div className="field">
              <label>Estratégia de lance</label>
              <select value=${bidStrategy} onChange=${(e) => setBidStrategy(e.target.value)}>
                <option value="LOWEST_COST_WITHOUT_CAP">Custo mais baixo (sem limite)</option>
                <option value="LOWEST_COST_WITH_BID_CAP">Limite de lance</option>
                <option value="COST_CAP">Meta de CPA</option>
              </select>
            </div>
            ${(bidStrategy === "LOWEST_COST_WITH_BID_CAP" || bidStrategy === "COST_CAP") ? html`
              <div className="field">
                <label>${bidStrategy === "COST_CAP" ? "Meta de CPA (R$)" : "Limite de lance (R$)"}</label>
                <input type="number" min="0.01" step="0.01" value=${bidAmount} onInput=${(e) => setBidAmount(e.target.value)} placeholder="Ex: 2.50" />
              </div>
            ` : null}
            <div className="field">
              <label>Data/hora de início (opcional)</label>
              <input type="datetime-local" value=${startTime} onInput=${(e) => setStartTime(e.target.value)} />
            </div>
            <div className="field">
              <label>Data/hora de término (opcional)</label>
              <input type="datetime-local" value=${endTime} onInput=${(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          <div style=${{ padding: "14px 16px", border: "1px solid var(--border)", borderRadius: "12px", background: "#f8f9ff" }}>
            <strong style=${{ display: "block", marginBottom: "10px", fontSize: "0.9rem" }}>Dispositivos</strong>
            <div style=${{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              ${["mobile", "desktop"].map((d) => html`
                <label key=${d} className="checkbox" style=${{ cursor: "pointer" }}>
                  <input type="checkbox"
                    checked=${devicePlatforms.includes(d)}
                    onChange=${(e) => {
                      if (e.target.checked) setDevicePlatforms((prev) => [...prev, d]);
                      else setDevicePlatforms((prev) => prev.filter((x) => x !== d));
                    }}
                  />
                  ${d === "mobile" ? "Mobile" : "Desktop"}
                </label>
              `)}
            </div>
          </div>

          <div style=${{ padding: "14px 16px", border: "1px solid var(--border)", borderRadius: "12px", background: "#f8f9ff" }}>
            <div style=${{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <strong style=${{ fontSize: "0.9rem" }}>
                Pixel de conversão <span className="muted small">— opcional</span>
              </strong>
              <button className="ghost small" onClick=${() => onLoadPixels(accountId)} disabled=${pixelsLoading || !accountId}>
                ${pixelsLoading ? "Carregando..." : pixels.length ? `↺ Recarregar (${pixels.length})` : "Carregar pixels"}
              </button>
            </div>
            <p className="muted small" style=${{ margin: "0 0 12px" }}>
              Necessário para objetivos de Vendas / Cadastros. Vincula o pixel da conta ao conjunto.
            </p>
            <div className="filters">
              <div className="field">
                <label>Pixel</label>
                ${pixels.length > 0
                  ? html`
                    <select value=${pixelId} onChange=${(e) => setPixelId(e.target.value)}>
                      <option value="">Nenhum</option>
                      ${pixels.map((px) => html`
                        <option key=${px.id} value=${px.id}>
                          ${px.name || px.id} (${px.id})
                        </option>
                      `)}
                    </select>
                  `
                  : html`
                    <input type="text" value=${pixelId} onInput=${(e) => setPixelId(e.target.value)}
                      placeholder=${accountId ? "Carregue os pixels acima ou insira o ID manualmente" : "Preencha o Account ID primeiro"} />
                  `}
              </div>
              ${pixelId ? html`
                <div className="field">
                  <label>Evento de conversão</label>
                  <select value=${conversionEvent} onChange=${(e) => setConversionEvent(e.target.value)}>
                    ${CONVERSION_EVENTS.map((ev) => html`<option key=${ev.value} value=${ev.value}>${ev.label}</option>`)}
                  </select>
                </div>
              ` : null}
            </div>
          </div>

          ${!cbo ? html`
            <div style=${{ padding: "14px 16px", border: "1px solid var(--border)", borderRadius: "12px", background: "#f8f9ff" }}>
              <strong style=${{ display: "block", marginBottom: "12px", fontSize: "0.9rem" }}>Orçamento do conjunto *</strong>
              <div className="filters">
                <div className="field">
                  <label>Tipo</label>
                  <select value=${adsetBudgetType} onChange=${(e) => setAdsetBudgetType(e.target.value)}>
                    <option value="daily">Diário</option>
                    <option value="lifetime">Vitalício</option>
                  </select>
                </div>
                <div className="field">
                  <label>Valor (R$) *</label>
                  <input type="number" min="1" step="0.01" value=${adsetBudget} onInput=${(e) => setAdsetBudget(e.target.value)} placeholder="Ex: 30.00" />
                </div>
              </div>
            </div>
          ` : null}

          <div style=${{ padding: "14px 16px", border: "1px solid var(--border)", borderRadius: "12px", background: "#f8f9ff" }}>
            <strong style=${{ display: "block", marginBottom: "10px", fontSize: "0.9rem" }}>Posicionamentos</strong>
            <div style=${{ display: "flex", gap: "20px", marginBottom: "12px", flexWrap: "wrap" }}>
              <label className="checkbox" style=${{ cursor: "pointer" }}>
                <input type="radio" name="placement" checked=${placementMode === "auto"} onChange=${() => setPlacementMode("auto")} />
                Automático (recomendado pelo Meta)
              </label>
              <label className="checkbox" style=${{ cursor: "pointer" }}>
                <input type="radio" name="placement" checked=${placementMode === "manual"} onChange=${() => setPlacementMode("manual")} />
                Manual
              </label>
            </div>
            ${placementMode === "manual" ? html`
              <div style=${{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px" }}>
                ${Object.entries(PLACEMENT_LABELS).map(([key, label]) => html`
                  <label key=${key} className="checkbox" style=${{ cursor: "pointer" }}>
                    <input type="checkbox"
                      checked=${manualPlacements[key]}
                      onChange=${(e) => setManualPlacements((prev) => ({ ...prev, [key]: e.target.checked }))}
                    />
                    ${label}
                  </label>
                `)}
              </div>
            ` : null}
          </div>

          <div style=${{ display: "flex", justifyContent: "space-between" }}>
            <button onClick=${() => setStep(1)}>← Voltar</button>
            <button className="primary" disabled=${!step2Valid} onClick=${() => setStep(3)}>
              Próximo: Anúncio →
            </button>
          </div>
        </section>
      `}

      ${/* ── Passo 3: Anúncio ── */ step === 3 && html`
        <section className="card wide">
          <div className="card-head">
            <div>
              <span className="eyebrow">Passo 3 de 4</span>
              <h2 className="section-title">Anúncio</h2>
            </div>
          </div>
          <div style=${{ padding: "12px 16px", border: "1px solid var(--border)", borderRadius: "12px", background: "#f8f9ff", marginBottom: "4px" }}>
            <label className="checkbox" style=${{ cursor: "pointer" }}>
              <input type="checkbox" checked=${skipAd} onChange=${(e) => setSkipAd(e.target.checked)} />
              <strong>Pular anúncio agora</strong> — criar somente campanha + conjunto, adicionar anúncio depois no Gerenciador
            </label>
          </div>
          ${!skipAd ? html`
            <div className="filters">
              <div className="field">
                <label>Nome do anúncio</label>
                <input type="text" value=${adName} onInput=${(e) => setAdName(e.target.value)} placeholder="Ex: Imagem 1 — Versão A" />
              </div>
              <div className="field">
                <label>
                  Página do Facebook *
                  ${pagesLoading ? html`<span className="muted small"> carregando...</span>` : null}
                </label>
                <select value=${pageId} onChange=${(e) => setPageId(e.target.value)}>
                  <option value="">Selecione uma página</option>
                  ${(pages || []).map((p) => html`<option key=${p.id} value=${p.id}>${p.name}</option>`)}
                </select>
                ${(!pages || pages.length === 0) && !pagesLoading ? html`
                  <button className="ghost small" onClick=${onLoadPages} style=${{ marginTop: "6px" }}>
                    Carregar páginas
                  </button>
                ` : null}
              </div>
              <div className="field">
                <label>ID da conta do Instagram <span className="muted small">— opcional</span></label>
                <input type="text" value=${igActorId} onInput=${(e) => setIgActorId(e.target.value)} placeholder="Ex: 17841400000000000" />
              </div>
              <div className="field" style=${{ gridColumn: "1 / -1" }}>
                <label>Formato do criativo</label>
                <div style=${{ display: "flex", gap: "12px", marginTop: "4px" }}>
                  ${["image", "video"].map((fmt) => html`
                    <label key=${fmt} className="checkbox" style=${{ cursor: "pointer", fontWeight: adFormat === fmt ? 700 : 400 }}>
                      <input type="radio" name="adFormat" checked=${adFormat === fmt} onChange=${() => setAdFormat(fmt)} />
                      ${fmt === "image" ? "🖼️ Imagem" : "🎬 Vídeo"}
                    </label>
                  `)}
                </div>
              </div>
              ${adFormat === "image" ? html`
                <div className="field" style=${{ gridColumn: "1 / -1" }}>
                  <label>URL da imagem * (.jpg, .png — mín. 1080×1080 recomendado)</label>
                  <input type="url" value=${imageUrl} onInput=${(e) => setImageUrl(e.target.value)} placeholder="https://seusite.com/imagem.jpg" />
                </div>
                ${imageUrl ? html`
                  <div style=${{ gridColumn: "1 / -1", padding: "12px", border: "1px solid var(--border)", borderRadius: "12px", background: "#f8f9ff" }}>
                    <p className="muted small" style=${{ margin: "0 0 8px" }}>Pré-visualização:</p>
                    <img src=${imageUrl} alt="preview" style=${{ maxWidth: "320px", maxHeight: "180px", borderRadius: "8px", objectFit: "contain", display: "block" }}
                      onError=${(e) => { e.target.style.display = "none"; }} />
                  </div>
                ` : null}
              ` : html`
                <div className="field" style=${{ gridColumn: "1 / -1" }}>
                  <label>ID do vídeo no Facebook *</label>
                  <input type="text" value=${videoId} onInput=${(e) => setVideoId(e.target.value)} placeholder="ID do vídeo (ex: 123456789) — já deve estar na biblioteca de mídia da página" />
                </div>
                <div className="field" style=${{ gridColumn: "1 / -1" }}>
                  <label>URL da thumbnail <span className="muted small">— opcional</span></label>
                  <input type="url" value=${thumbUrl} onInput=${(e) => setThumbUrl(e.target.value)} placeholder="https://seusite.com/thumb.jpg" />
                </div>
              `}
              <div className="field" style=${{ gridColumn: "1 / -1" }}>
                <label>Título (headline) * — máx. 40 caracteres</label>
                <input type="text" value=${headline} onInput=${(e) => setHeadline(e.target.value)} placeholder="Ex: Você precisa ler isso!" maxLength="40" />
                <span className="muted small">${headline.length}/40</span>
              </div>
              <div className="field" style=${{ gridColumn: "1 / -1" }}>
                <label>Texto principal — máx. 125 caracteres</label>
                <textarea value=${adBody} onInput=${(e) => setAdBody(e.target.value)}
                  placeholder="Texto que aparece acima do criativo..."
                  rows="3" maxLength="125"
                  style=${{ width: "100%", padding: "9px 12px", borderRadius: "10px", border: "1px solid var(--border)", background: "#fbfbff", fontSize: "0.9rem", resize: "vertical", fontFamily: "inherit" }}
                ></textarea>
                <span className="muted small">${adBody.length}/125</span>
              </div>
              <div className="field">
                <label>Descrição do link — máx. 30 caracteres</label>
                <input type="text" value=${adDescription} onInput=${(e) => setAdDescription(e.target.value)} placeholder="Ex: Leia grátis agora" maxLength="30" />
                <span className="muted small">${adDescription.length}/30</span>
              </div>
              <div className="field">
                <label>Botão (CTA)</label>
                <select value=${ctaType} onChange=${(e) => setCtaType(e.target.value)}>
                  ${CTA_TYPES.map((c) => html`<option key=${c.value} value=${c.value}>${c.label}</option>`)}
                </select>
              </div>
              <div className="field" style=${{ gridColumn: "1 / -1" }}>
                <label>URL de destino * (inclua UTMs!)</label>
                <input type="url" value=${destUrl} onInput=${(e) => setDestUrl(e.target.value)} placeholder="https://seusite.com/artigo?utm_source=fb&utm_medium=cpc&utm_content={{ad.name}}" />
                <div style=${{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                  <span className="muted small" style=${{ alignSelf: "center" }}>Macros:</span>
                  ${UTM_MACROS.map((m) => html`
                    <button key=${m.label} className="ghost small" title=${m.tip}
                      onClick=${(e) => { e.preventDefault(); setDestUrl((prev) => prev + m.label); }}
                      style=${{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                      ${m.label}
                    </button>
                  `)}
                </div>
              </div>
            </div>
          ` : null}
          <div style=${{ display: "flex", justifyContent: "space-between" }}>
            <button onClick=${() => setStep(2)}>← Voltar</button>
            <button className="primary" disabled=${!step3Valid} onClick=${() => setStep(4)}>
              Revisar →
            </button>
          </div>
        </section>
      `}

      ${/* ── Passo 4: Revisão ── */ step === 4 && html`
        <section className="card wide">
          <div className="card-head">
            <div>
              <span className="eyebrow">Passo 4 de 4</span>
              <h2 className="section-title">Revisão final</h2>
            </div>
          </div>
          <div style=${{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
            <div style=${{ padding: "16px", border: "2px solid var(--accent)", borderRadius: "14px", background: "#f3f4ff" }}>
              <p className="eyebrow" style=${{ marginBottom: "12px" }}>🎯 Campanha</p>
              <p><strong>Nome:</strong> ${campName}</p>
              <p><strong>Objetivo:</strong> ${OBJECTIVES.find((o) => o.value === objective)?.label}</p>
              <p><strong>Status:</strong> ${campStatus === "PAUSED" ? "Pausado" : "Ativo"}</p>
              ${specialCat !== "NONE" ? html`<p><strong>Categoria especial:</strong> ${specialCat}</p>` : null}
              ${cbo ? html`<p><strong>CBO:</strong> R$ ${campBudget} (${campBudgetType === "daily" ? "diário" : "vitalício"})</p>` : null}
              ${spendingLimit ? html`<p><strong>Limite de gastos:</strong> R$ ${spendingLimit}</p>` : null}
            </div>
            <div style=${{ padding: "16px", border: "1px solid var(--border)", borderRadius: "14px", background: "#f8f9ff" }}>
              <p className="eyebrow" style=${{ marginBottom: "12px" }}>📦 Conjunto</p>
              <p><strong>Nome:</strong> ${adsetName || `${campName} — Conjunto`}</p>
              ${!cbo ? html`<p><strong>Orçamento:</strong> R$ ${adsetBudget} (${adsetBudgetType === "daily" ? "diário" : "vitalício"})</p>` : null}
              <p><strong>Países:</strong> ${(Array.isArray(countries) ? countries : countries.split(",")).map((c) => `${flagEmoji(c.trim())} ${COUNTRY_MAP[c.trim()]?.name || c.trim()}`).join(" · ")}</p>
              <p><strong>Idiomas:</strong> ${locLanguages.length === 0 ? "Todos" : locLanguages.map((id) => LANGUAGE_LIST.find((l) => l.id === id)?.label || id).join(", ")}</p>
              <p><strong>Faixa etária:</strong> ${ageMin}–${ageMax} anos</p>
              <p><strong>Gênero:</strong> ${gender === "all" ? "Todos" : gender === "male" ? "Masculino" : "Feminino"}</p>
              <p><strong>Dispositivos:</strong> ${devicePlatforms.length ? devicePlatforms.join(", ") : "Todos"}</p>
              <p><strong>Otimização:</strong> ${availableGoals.find((g) => g.value === optGoal)?.label}</p>
              <p><strong>Lance:</strong> ${
                bidStrategy === "LOWEST_COST_WITHOUT_CAP" ? "Custo mais baixo" :
                bidStrategy === "LOWEST_COST_WITH_BID_CAP" ? `Limite R$ ${bidAmount}` :
                `Meta CPA R$ ${bidAmount}`}</p>
              <p><strong>Posicionamentos:</strong> ${placementMode === "auto" ? "Automático" : "Manual"}</p>
              ${pixelId ? html`<p><strong>Pixel:</strong> ${pixels.find((px) => px.id === pixelId)?.name || pixelId} — ${CONVERSION_EVENTS.find((e) => e.value === conversionEvent)?.label}</p>` : null}
            </div>
            <div style=${{ padding: "16px", border: "1px solid var(--border)", borderRadius: "14px", background: "#f8f9ff" }}>
              <p className="eyebrow" style=${{ marginBottom: "12px" }}>📣 Anúncio</p>
              ${skipAd ? html`<p className="muted small">Não incluído — adicionar depois.</p>` : html`
                <p><strong>Nome:</strong> ${adName || `${campName} — Anúncio`}</p>
                <p><strong>Formato:</strong> ${adFormat === "image" ? "Imagem" : "Vídeo"}</p>
                ${igActorId ? html`<p><strong>Conta IG:</strong> ${igActorId}</p>` : null}
                <p><strong>Título:</strong> ${headline}</p>
                <p><strong>CTA:</strong> ${CTA_TYPES.find((c) => c.value === ctaType)?.label}</p>
                <p style=${{ wordBreak: "break-all", fontSize: "0.82rem" }}><strong>URL:</strong> ${destUrl}</p>
              `}
            </div>
          </div>
          <div style=${{ padding: "14px 16px", border: "1px solid #f1c27d", borderRadius: "12px", background: "#fff4e5" }}>
            <strong>⚠️ Atenção:</strong> tudo será criado com status <strong>${campStatus === "PAUSED" ? "Pausado" : "Ativo"}</strong>.
            ${campStatus === "ACTIVE" ? html` <span className="muted small">Isso significa que os anúncios entrarão em veiculação imediatamente após aprovação do Meta.</span>` : null}
          </div>
          <div style=${{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick=${() => setStep(3)} disabled=${publishing}>← Voltar</button>
            <button className="primary" onClick=${handlePublish} disabled=${publishing} style=${{ minWidth: "180px" }}>
              ${publishing ? "Criando..." : "🚀 Publicar campanha"}
            </button>
          </div>
        </section>
      `}
    </div>
  `;
}

function LoginView({ onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (data.code === "success") {
        onAuthed(email.trim());
      } else {
        setError(data.message || "Erro ao fazer login.");
      }
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  };

  return html`
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-icon-wrap">📊</div>
          <h1>Dashboard</h1>
          <p>Arbitragem de tráfego · Acesso restrito</p>
        </div>
        <form onSubmit=${handleSubmit} className="login-form">
          ${error ? html`<div className="login-error">${error}</div>` : null}
          <div className="field">
            <label>E-mail</label>
            <input
              type="email"
              value=${email}
              onInput=${(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label>Senha</label>
            <div style=${{ position: "relative" }}>
              <input
                type=${showPwd ? "text" : "password"}
                value=${password}
                onInput=${(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                style=${{ paddingRight: "44px", width: "100%" }}
              />
              <button
                type="button"
                onClick=${() => setShowPwd(!showPwd)}
                style=${{
                  position: "absolute", right: "10px", top: "50%",
                  transform: "translateY(-50%)", background: "none",
                  border: "none", cursor: "pointer", color: "var(--muted)",
                  fontSize: "0.8rem", padding: "0",
                }}
              >${showPwd ? "Ocultar" : "Ver"}</button>
            </div>
          </div>
          <button type="submit" className="primary login-btn" disabled=${loading || !email || !password}>
            ${loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  `;
}

function App() {
  const [filters, setFilters] = useState({
    ...defaultDates(),
    domain: "",
    reportType: "Analytical",
    metaAccountId: "act_728792692620145",
    adsetFilter: "",
    includeAssets: false,
  });
  const [superFilter, setSuperFilter] = useState([]);
  const [topUrls, setTopUrls] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [earningsAll, setEarningsAll] = useState([]);
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
  const [budgetLoading, setBudgetLoading] = useState({});
  const [bidLoading, setBidLoading] = useState({});
  const [appliedFilters, setAppliedFilters] = useState(null);
  const [dupCampaigns, setDupCampaigns] = useState([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupStatusLoading, setDupStatusLoading] = useState(false);
  const [dupError, setDupError] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [copyCounts, setCopyCounts] = useState({});
  const [publishing, setPublishing] = useState(false);
  const [selectedAdsets, setSelectedAdsets] = useState({});
  const [tokenInfo, setTokenInfo] = useState(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [adsetStatusLoading, setAdsetStatusLoading] = useState({});
  const [editAds, setEditAds] = useState([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState({});
  const [editVerifying, setEditVerifying] = useState({});
  const [editRenaming, setEditRenaming] = useState({});
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesError, setPagesError] = useState("");
  const [pagesList, setPagesList] = useState([]);
  const [pixelsLoading, setPixelsLoading] = useState(false);
  const [pixelsList, setPixelsList] = useState([]);
  const [adDestMap, setAdDestMap] = useState({});
  const [editCampaignFilter, setEditCampaignFilter] = useState("");

  // ── Auth ──────────────────────────────────────────────────
  const [authed, setAuthed]       = useState(null); // null=checking | false=login | true=ok
  const [authEmail, setAuthEmail] = useState("");

  useEffect(() => {
    fetch("/api/auth-check")
      .then((r) => r.json())
      .then((d) => { if (d.ok) { setAuthed(true); setAuthEmail(d.email || ""); } else setAuthed(false); })
      .catch(() => setAuthed(false));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth-logout", { method: "POST" }).catch(() => {});
    setAuthed(false);
    setAuthEmail("");
  };
  // ─────────────────────────────────────────────────────────

  const totals = useTotalsFromEarnings(earnings, superFilter);
  const brlRate = usdBrl || 0;

  const pushLog = (source, err) => {
    const detail =
      err?.data?.details !== undefined
        ? err.data.details
        : err?.data ?? null;
    const entry = {
      time: new Date(),
      source,
      message: formatError(err),
      detail,
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
        }).toString()}`,
        {
          cacheTtlMs: 3 * 60 * 1000,
          cacheKey: `top-url:${filters.domain}:${filters.startDate}:${filters.endDate}`,
        }
      );

      const earningsPromise = fetchJson(
        `${API_BASE}/earnings?${new URLSearchParams({
          start_date: filters.startDate,
          end_date: filters.endDate,
          domain: filters.domain.trim(),
        }).toString()}`,
        {
          cacheTtlMs: 3 * 60 * 1000,
          cacheKey: `earnings:${filters.domain}:${filters.startDate}:${filters.endDate}`,
        }
      );
      const earningsAllPromise = fetchJson(
        `${API_BASE}/earnings?${new URLSearchParams({
          start_date: filters.startDate,
          end_date: filters.endDate,
        }).toString()}`,
        {
          cacheTtlMs: 3 * 60 * 1000,
          cacheKey: `earnings:all:${filters.startDate}:${filters.endDate}`,
        }
      ).catch((err) => {
        pushLog("earnings-all", err);
        return { data: [] };
      });
      // super-filter utm_content — sequencial necessário pela lógica de fallback
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

      // Todas as demais requisições independentes em paralelo (elimina 4 awaits sequenciais)
      const editListPromise = fetchJson(
        `${API_BASE}/meta-ad-edit-list?${new URLSearchParams({
          account_id: filters.metaAccountId.trim(),
        }).toString()}`,
        {
          cacheTtlMs: 5 * 60 * 1000,
          cacheKey: `meta-edit-list:${filters.metaAccountId.trim()}`,
        }
      ).catch((err) => {
        pushLog("meta-edit-list-load", err);
        return { data: [] };
      });

      const [
        topRes,
        earningsRes,
        earningsAllRes,
        editListRes,
        superTermRes,
        keyValueContentRes,
        metaSourceRes,
        metaMediumRes,
      ] = await Promise.all([
        topPromise,
        earningsPromise,
        earningsAllPromise,
        editListPromise,
        fetchJson(`${API_BASE}/super-filter`, {
          method: "POST",
          body: JSON.stringify({
            start_date: filters.startDate,
            end_date: filters.endDate,
            "domain[]": [filters.domain.trim()],
            custom_key: "utm_term",
            group: ["domain", "custom_value"],
          }),
        }).catch((err) => { pushLog("super-filter-term", err); return { data: [] }; }),
        fetchJson(
          `${API_BASE}/key-value?${new URLSearchParams({
            start_date: filters.startDate,
            end_date: filters.endDate,
            domain: filters.domain.trim(),
            report_type: filters.reportType || "Analytical",
            custom_key: "utm_campaign",
          }).toString()}`,
          {
            cacheTtlMs: 3 * 60 * 1000,
            cacheKey: `key-value:${filters.domain}:${filters.startDate}:${filters.endDate}:${filters.reportType}`,
          }
        ).catch((err) => { pushLog("key-value-content", err); return { data: [] }; }),
        fetchJson(`${API_BASE}/super-filter`, {
          method: "POST",
          body: JSON.stringify({
            start_date: filters.startDate,
            end_date: filters.endDate,
            "domain[]": [filters.domain.trim()],
            custom_key: "utm_source",
            group: ["domain", "custom_value"],
          }),
        }).catch((err) => { pushLog("meta-utmsource", err); return { data: [] }; }),
        fetchJson(`${API_BASE}/super-filter`, {
          method: "POST",
          body: JSON.stringify({
            start_date: filters.startDate,
            end_date: filters.endDate,
            "domain[]": [filters.domain.trim()],
            custom_key: "utm_medium",
            group: ["domain", "custom_value"],
          }),
        }).catch((err) => { pushLog("meta-utmmedium", err); return { data: [] }; }),
      ]);

      // Reutiliza keyValueContentRes para paramPairs — elimina 2 fetches duplicados ao mesmo endpoint
      const kvMap = new Map();
      (keyValueContentRes?.data || []).forEach((row) => {
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
      setParamPairs(Array.from(kvMap.values()));

      try {
        const metaParams = new URLSearchParams({
          account_id: filters.metaAccountId.trim(),
          start_date: filters.startDate,
          end_date: filters.endDate,
          include_assets: filters.includeAssets ? "1" : "0",
        });
        if (filters.endDate === formatDate(new Date())) {
          metaParams.set("_ts", String(Date.now()));
        }
        const metaRes = await fetchJson(
          `${API_BASE}/meta-insights?${metaParams.toString()}`,
          {
            cacheTtlMs: filters.includeAssets ? 2 * 60 * 1000 : 8 * 60 * 1000,
            cacheKey: `meta-insights:${metaParams.toString()}`,
          }
        );
      setMetaRows(Array.isArray(metaRes?.data) ? metaRes.data : []);
      const destMap = {};
      (editListRes?.data || []).forEach((row) => {
        if (row?.id) {
          destMap[row.id] = row.destination_url || row.url || "";
        }
      });
      setAdDestMap(destMap);
      } catch (err) {
        pushLog("meta", err);
        setMetaRows([]);
      }

      setSuperFilter(Array.isArray(superRes?.data) ? superRes.data : []);
      setSuperKey(superKeyUsed || "utm_content");
      setSuperTermRows(Array.isArray(superTermRes?.data) ? superTermRes.data : []);
      setTopUrls(Array.isArray(topRes?.data) ? topRes.data : []);
      setEarnings(Array.isArray(earningsRes?.data) ? earningsRes.data : []);
      setEarningsAll(Array.isArray(earningsAllRes?.data) ? earningsAllRes.data : []);
      setKeyValueContent(Array.isArray(keyValueContentRes?.data) ? keyValueContentRes.data : []);
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

      const totalsAll = (Array.isArray(earningsRes?.data) ? earningsRes.data : []).reduce(
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
      setAppliedFilters({ ...filters });
      setLastRefreshed(new Date());
    } catch (err) {
      const msg = formatError(err) || "Erro ao buscar dados.";
      setError(msg);
      pushLog("load", err);
      setSuperFilter([]);
      setTopUrls([]);
      setEarnings([]);
      setEarningsAll([]);
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
      const res = await fetchJson(`${API_BASE}/domains?${params.toString()}`, {
        cacheTtlMs: 10 * 60 * 1000,
        cacheKey: `domains:${filters.startDate}:${filters.endDate}`,
      });
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

  const handleLoadDuplicar = async (force = false) => {
    if (!filters.metaAccountId.trim()) {
      setDupError("Informe o ID da conta de anúncios (Meta).");
      return;
    }
    setDupLoading(true);
    setDupError("");
    try {
      const res = await fetchJson(
        `${API_BASE}/meta-structure?${new URLSearchParams({
          account_id: filters.metaAccountId.trim(),
        }).toString()}`,
        {
          cacheTtlMs: 10 * 60 * 1000,
          cacheKey: `meta-structure:${filters.metaAccountId.trim()}`,
          force,
        }
      );
      setDupCampaigns(res.data || []);
      try {
        const payload = {
          time: Date.now(),
          account: filters.metaAccountId.trim(),
          data: res.data || [],
        };
        localStorage.setItem("__cd_dup_campaigns__", JSON.stringify(payload));
      } catch (e) {
        // ignore cache errors
      }
    } catch (err) {
      setDupError(formatError(err));
      pushLog("duplicar-load", err);
      setDupCampaigns([]);
    } finally {
      setDupLoading(false);
    }
  };

  const handleRefreshDuplicarStatus = async () => {
    if (!dupCampaigns || dupCampaigns.length === 0) return;
    setDupStatusLoading(true);
    try {
      const campaignIds = [];
      const adsetIds = [];
      const adIds = [];
      (dupCampaigns || []).forEach((camp) => {
        if (camp?.id) campaignIds.push(camp.id);
        (camp.adsets || []).forEach((adset) => {
          if (adset?.id) adsetIds.push(adset.id);
          (adset.ads || []).forEach((ad) => {
            if (ad?.id) adIds.push(ad.id);
          });
        });
      });

      const statusRes = await fetchJson(`${API_BASE}/meta-status-bulk`, {
        method: "POST",
        body: JSON.stringify({
          campaign_ids: campaignIds,
          adset_ids: adsetIds,
          ad_ids: adIds,
        }),
      });

      const campaignMap = statusRes.campaigns || {};
      const adsetMap = statusRes.adsets || {};
      const adMap = statusRes.ads || {};

      setDupCampaigns((prev) =>
        (prev || []).map((camp) => ({
          ...camp,
          status: campaignMap[camp.id]?.status || camp.status,
          effective_status:
            campaignMap[camp.id]?.effective_status || camp.effective_status,
          adsets: (camp.adsets || []).map((adset) => ({
            ...adset,
            status: adsetMap[adset.id]?.status || adset.status,
            effective_status:
              adsetMap[adset.id]?.effective_status || adset.effective_status,
            ads: (adset.ads || []).map((ad) => ({
              ...ad,
              status: adMap[ad.id]?.status || ad.status,
              effective_status:
                adMap[ad.id]?.effective_status || ad.effective_status,
            })),
          })),
        }))
      );
    } catch (err) {
      pushLog("duplicar-status", err);
    } finally {
      setDupStatusLoading(false);
    }
  };

  const toggleSelectAdset = (adsetId) => {
    if (!adsetId) return;
    setSelectedAdsets((prev) => {
      const next = { ...(prev || {}) };
      if (next[adsetId]) {
        delete next[adsetId];
      } else {
        next[adsetId] = true;
      }
      return next;
    });
  };

  const handleDeleteAdsets = async () => {
    const ids = Object.keys(selectedAdsets || {});
    if (!ids.length) return;
    const confirm = window.confirm(
      `Apagar ${ids.length} conjunto(s) selecionado(s)? Esta acao nao pode ser desfeita.`
    );
    if (!confirm) return;
    try {
      for (const id of ids) {
        await fetchJson(`${API_BASE}/meta-adset-delete`, {
          method: "POST",
          body: JSON.stringify({ adset_id: id }),
        });
      }
      setDupCampaigns((prev) =>
        (prev || []).map((camp) => ({
          ...camp,
          adsets: (camp.adsets || []).filter((adset) => !ids.includes(adset.id)),
        }))
      );
      setSelectedAdsets({});
      pushLog("duplicar-delete", {
        message: `Conjuntos apagados: ${ids.length}`,
      });
    } catch (err) {
      pushLog("duplicar-delete", err);
    }
  };

  const loadEditDestinationCache = () => {
    try {
      const raw = localStorage.getItem("__cd_edit_dest__");
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  };

  const saveEditDestinationCache = (map) => {
    try {
      localStorage.setItem("__cd_edit_dest__", JSON.stringify(map));
    } catch (e) {
      // ignore
    }
  };

  const handleLoadEditar = async () => {
    if (!filters.metaAccountId.trim()) {
      setEditError("Informe o ID da conta de anúncios (Meta).");
      return;
    }
    setEditLoading(true);
    setEditError("");
    try {
      const res = await fetchJson(
        `${API_BASE}/meta-ad-edit-list?${new URLSearchParams({
          account_id: filters.metaAccountId.trim(),
        }).toString()}`,
        {
          cacheTtlMs: 5 * 60 * 1000,
          cacheKey: `meta-edit-list:${filters.metaAccountId.trim()}`,
          force: true,
        }
      );
      const cache = loadEditDestinationCache();
      const rows = (res.data || []).map((row) => {
        if (row.destination_url) return row;
        const cached = cache[row.id];
        return cached ? { ...row, destination_url: cached } : row;
      });
      setEditAds(rows);
    } catch (err) {
      setEditError(formatError(err));
      pushLog("meta-edit-list", err);
      setEditAds([]);
    } finally {
      setEditLoading(false);
    }
  };

  const updateEditAdField = (adId, patch) => {
    if (!adId) return;
    setEditAds((prev) =>
      (prev || []).map((row) =>
        row.id === adId ? { ...row, ...patch } : row
      )
    );
  };

  const handleLoadPages = async () => {
    setPagesLoading(true);
    setPagesError("");
    try {
      const res = await fetchJson(`${API_BASE}/meta-pages`, {
        cacheTtlMs: 5 * 60 * 1000,
        cacheKey: "meta-pages",
        force: true,
      });
      setPagesList(res.data || []);
    } catch (err) {
      setPagesError(formatError(err));
      pushLog("meta-pages", err);
      setPagesList([]);
    } finally {
      setPagesLoading(false);
    }
  };

  const handleLoadPixels = async (accountId) => {
    if (!accountId) return;
    setPixelsLoading(true);
    try {
      const res = await fetchJson(`${API_BASE}/meta-pixels?account_id=${encodeURIComponent(accountId)}`, {
        cacheTtlMs: 5 * 60 * 1000,
        cacheKey: `meta-pixels-${accountId}`,
        force: true,
      });
      setPixelsList(res.data || []);
    } catch (err) {
      pushLog("meta-pixels", err);
      setPixelsList([]);
    } finally {
      setPixelsLoading(false);
    }
  };

  const handleSaveEditAd = async (row) => {
    if (!row?.id) return;
    setEditSaving((prev) => ({ ...prev, [row.id]: true }));
    try {
      const res = await fetchJson(`${API_BASE}/meta-ad-copy-url`, {
        method: "POST",
        body: JSON.stringify({
          ad_id: row.id,
          adset_id: row.adset_id,
          link_url: row.url || "",
          url_tags: row.url_tags || "",
          name: row.name,
          status_option: "PAUSED",
        }),
      });
      if (res?.data?.ad_ids?.length) {
        updateEditAdField(row.id, {
          updated_time: new Date().toISOString(),
        });
      }
      pushLog("meta-edit-save", {
        message: `Anuncio duplicado: ${row.name || row.id}`,
      });
    } catch (err) {
      pushLog("meta-edit-save", err);
    } finally {
      setEditSaving((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  const extractUrlFromSpec = (spec) => {
    if (!spec || typeof spec !== "object") return "";
    if (spec.link_data?.link) return spec.link_data.link;
    const linkFromVideo = spec.video_data?.call_to_action?.value?.link;
    if (linkFromVideo) return linkFromVideo;
    return "";
  };

  const resolvePostDestination = async (storyId) => {
    if (!storyId) return "";
    try {
      const res = await fetchJson(
        `${API_BASE}/meta-post-destination?${new URLSearchParams({
          object_story_id: storyId,
        }).toString()}`,
        {
          cacheTtlMs: 10 * 60 * 1000,
          cacheKey: `post-dest:${storyId}`,
        }
      );
      return (
        res?.data?.link ||
        res?.data?.attachment_url ||
        res?.data?.permalink_url ||
        ""
      );
    } catch (e) {
      return "";
    }
  };

  const handleResolveDestination = async (row) => {
    if (!row?.object_story_id) return;
    setEditVerifying((prev) => ({ ...prev, [row.id]: true }));
    try {
      const destination = await resolvePostDestination(row.object_story_id);
      updateEditAdField(row.id, {
        destination_url: destination || row.destination_url || "",
        verified_time: new Date().toISOString(),
      });
      const cache = loadEditDestinationCache();
      cache[row.id] = destination || row.destination_url || "";
      saveEditDestinationCache(cache);
    } finally {
      setEditVerifying((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  const handleVerifyEditAd = async (row) => {
    if (!row?.id) return;
    setEditVerifying((prev) => ({ ...prev, [row.id]: true }));
    try {
      const res = await fetchJson(
        `${API_BASE}/meta-ad-verify?${new URLSearchParams({
          ad_id: row.id,
        }).toString()}`
      );
      const data = res?.data || {};
      const spec = data?.creative?.object_story_spec || {};
      const url = extractUrlFromSpec(spec) || row.url;
      const urlTags = data?.creative?.url_tags ?? row.url_tags ?? "";
      const storyId = data?.creative?.object_story_id || row.object_story_id || "";
      let destination =
        data?.creative?.link_url ||
        data?.creative?.object_url ||
        extractUrlFromSpec(spec) ||
        row.destination_url ||
        row.url ||
        "";
      if (!destination && storyId) {
        destination = await resolvePostDestination(storyId);
      }
      updateEditAdField(row.id, {
        status: data.status || row.status,
        effective_status: data.effective_status || row.effective_status,
        url,
        url_tags: urlTags,
        object_story_id: storyId,
        destination_url: destination,
        verified_time: new Date().toISOString(),
      });
        const cache = loadEditDestinationCache();
        cache[row.id] = destination || "";
        saveEditDestinationCache(cache);
    } catch (err) {
      pushLog("meta-edit-verify", err);
    } finally {
      setEditVerifying((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  const handleRenameObject = async (objectId, name, key) => {
    if (!objectId || !name) return;
    setEditRenaming((prev) => ({ ...prev, [key]: true }));
    try {
      await fetchJson(`${API_BASE}/meta-rename`, {
        method: "POST",
        body: JSON.stringify({ object_id: objectId, name }),
      });
      if (key.startsWith("adset:")) {
        updateEditAdField(objectId, {});
        setEditAds((prev) =>
          (prev || []).map((row) =>
            row.adset_id === objectId ? { ...row, adset_name: name } : row
          )
        );
      }
      if (key.startsWith("ad:")) {
        setEditAds((prev) =>
          (prev || []).map((row) =>
            row.id === objectId ? { ...row, name } : row
          )
        );
      }
      pushLog("meta-rename", { message: `Renomeado: ${name}` });
    } catch (err) {
      pushLog("meta-rename", err);
    } finally {
      setEditRenaming((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const cleanUtmValue = (value) =>
    (value ?? "")
      .toString()
      .replace(/[{}]/g, "")
      .trim();

  const buildUtmTags = (row) => {
    const campaignRaw = row.campaign_name || row.campaign_id || "";
    const adsetRaw = row.adset_name || row.adset_id || "";
    const adRaw = row.name || row.ad_id || "";
    const adIdRaw = row.ad_id || row.id || "";
    const campaign = encodeURIComponent(cleanUtmValue(campaignRaw));
    const adset = encodeURIComponent(cleanUtmValue(adsetRaw));
    const ad = encodeURIComponent(cleanUtmValue(adRaw));
    const adId = encodeURIComponent(cleanUtmValue(adIdRaw));
    return `utm_source=fb&utm_medium=cpc&utm_campaign=${campaign}&utm_term=${adset}&utm_content=${ad}&ad_id=${adId}`;
  };

  const stripQuery = (url) => {
    if (!url) return "";
    const idx = url.indexOf("?");
    return idx >= 0 ? url.slice(0, idx) : url;
  };

  const handleCleanParams = async (row) => {
    if (!row?.id || !row.url) return;
    const baseUrl = stripQuery(row.url);
    const newTags = buildUtmTags(row);
    const newUrl = `${baseUrl}?${newTags}`;
    updateEditAdField(row.id, { url: newUrl, url_tags: "" });
    await handleSaveEditAd({ ...row, url: newUrl, url_tags: "" });
  };

  const handleTokenCheck = async () => {
    setTokenLoading(true);
    setTokenError("");
    try {
      const res = await fetchJson(`${API_BASE}/meta-token-debug`);
      setTokenInfo(res.data || res);
    } catch (err) {
      setTokenError(formatError(err));
      pushLog("meta-token", err);
    } finally {
      setTokenLoading(false);
    }
  };


  const setCopyCount = (adsetId, value) => {
    setCopyCounts((prev) => ({ ...prev, [adsetId]: value }));
  };

  const addDraftFromAdset = (campaign, adset, countRaw) => {
    const count = Math.max(1, Number(countRaw) || 1);
    const created = {
      id: `${adset.id}-${Date.now()}`,
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      source_adset_id: adset.id,
      source_adset_name: adset.name,
      adset_new_name: adset.name,
      daily_budget_brl: "",
      copies: count,
      ads: (adset.ads || []).map((ad) => ({
        id: ad.id,
        name: ad.name,
        new_name: ad.name,
        removed: false,
      })),
    };
    setDrafts((prev) => [created, ...prev]);
  };

  const removeDraft = (draftId) => {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
  };

  const updateDraft = (draftId, patch) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id === draftId ? { ...draft, ...patch } : draft
      )
    );
  };

  const updateDraftAd = (draftId, adId, patch) => {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.id !== draftId) return draft;
        return {
          ...draft,
          ads: (draft.ads || []).map((ad) =>
            ad.id === adId ? { ...ad, ...patch } : ad
          ),
        };
      })
    );
  };

  const toggleDraftAd = (draftId, adId) => {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.id !== draftId) return draft;
        return {
          ...draft,
          ads: (draft.ads || []).map((ad) =>
            ad.id === adId ? { ...ad, removed: !ad.removed } : ad
          ),
        };
      })
    );
  };

  const handleToggleAd = async (adId, nextStatus) => {
    if (!adId) return;
    setAdStatusLoading((prev) => ({ ...prev, [adId]: true }));
    try {
      await fetchJson(`${API_BASE}/meta-ad-status`, {
        method: "POST",
        body: JSON.stringify({
          ad_id: adId,
          status: nextStatus,
        }),
      });
      setMetaRows((prev) =>
        (prev || []).map((row) =>
          row.ad_id === adId
            ? { ...row, ad_status: nextStatus, effective_status: nextStatus }
            : row
        )
      );
    } catch (err) {
      const subcode = err?.data?.details?.error?.error_subcode;
      if (subcode === 2446289) {
        const custom = new Error(
          "Nao foi possivel ativar: criativo/reel indisponivel no Meta."
        );
        custom.status = err?.status;
        custom.data = err?.data;
        pushLog("meta-status", custom);
      } else {
        pushLog("meta-status", err);
      }
    } finally {
      setAdStatusLoading((prev) => {
        const next = { ...prev };
        delete next[adId];
        return next;
      });
    }
  };

  const updateAdsetStatuses = async (adsetIds, nextStatus) => {
    const uniqueIds = Array.from(new Set(adsetIds || [])).filter(Boolean);
    if (!uniqueIds.length) return [];
    const updated = [];
    for (const id of uniqueIds) {
      setAdsetStatusLoading((prev) => ({ ...prev, [id]: true }));
      try {
        await fetchJson(`${API_BASE}/meta-adset-status`, {
          method: "POST",
          body: JSON.stringify({
            adset_id: id,
            status: nextStatus,
          }),
        });
        updated.push(id);
      } catch (err) {
        pushLog("meta-adset-status", err);
      } finally {
        setAdsetStatusLoading((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }
    if (updated.length) {
      setMetaRows((prev) =>
        (prev || []).map((row) =>
          updated.includes(row.adset_id)
            ? {
                ...row,
                adset_status: nextStatus,
                adset_effective_status: nextStatus,
              }
            : row
        )
      );
    }
    return updated;
  };

  const handleToggleAdset = async (adsetIds, nextStatus) => {
    await updateAdsetStatuses(adsetIds, nextStatus);
  };

  const handleUpdateBudget = async (adsetId, budgetValue) => {
    if (!adsetId) return;
    const raw = String(budgetValue ?? "").trim();
    if (!raw) return;
    const budgetNumber = Number(raw.replace(",", "."));
    if (!Number.isFinite(budgetNumber) || budgetNumber <= 0) {
      pushLog("meta-budget", { message: "Orcamento invalido" });
      return;
    }

    setBudgetLoading((prev) => ({ ...prev, [adsetId]: true }));
    try {
      const res = await fetchJson(`${API_BASE}/meta-adset-budget`, {
        method: "POST",
        body: JSON.stringify({
          adset_id: adsetId,
          daily_budget_brl: budgetNumber,
        }),
      });
      const updated = res?.adset || null;
      if (updated) {
        setMetaRows((prev) =>
          (prev || []).map((row) =>
            row.adset_id === adsetId
              ? {
                  ...row,
                  adset_daily_budget: updated.daily_budget,
                  adset_lifetime_budget: updated.lifetime_budget,
                  adset_budget_remaining: updated.budget_remaining,
                }
              : row
          )
        );
      }
      pushLog("meta-budget", {
        message: `Orcamento atualizado: ${adsetId} -> R$ ${budgetNumber.toFixed(
          2
        )}`,
      });
    } catch (err) {
      pushLog("meta-budget", err);
    } finally {
      setBudgetLoading((prev) => {
        const next = { ...prev };
        delete next[adsetId];
        return next;
      });
    }
  };

  const handleUpdateBid = async (adsetId, bidValue, bidMode = "with_bid") => {
    if (!adsetId) return;

    const bidStrategy = modeToStrategy(bidMode);
    const requiresBidValue = bidStrategy === BID_STRATEGY_WITH_BID;

    let bidNumber = null;
    if (requiresBidValue) {
      const raw = String(bidValue ?? "").trim();
      if (!raw) {
        pushLog("meta-bid", { message: "Informe o valor de custo para a estrategia selecionada." });
        return;
      }
      bidNumber = Number(raw.replace(",", "."));
      if (!Number.isFinite(bidNumber) || bidNumber <= 0) {
        pushLog("meta-bid", { message: "Custo alvo invalido" });
        return;
      }
    }

    setBidLoading((prev) => ({ ...prev, [adsetId]: true }));
    try {
      const payload = {
        adset_id: adsetId,
        bid_strategy: bidStrategy,
      };
      if (requiresBidValue) {
        payload.bid_amount_brl = bidNumber;
      }

      const res = await fetchJson(`${API_BASE}/meta-adset-bid`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const updated = res?.adset || null;
      if (updated) {
        setMetaRows((prev) =>
          (prev || []).map((row) =>
            row.adset_id === adsetId
              ? {
                  ...row,
                  adset_bid_amount: updated.bid_amount ?? null,
                  adset_bid_strategy: updated.bid_strategy,
                  adset_optimization_goal: updated.optimization_goal,
                  adset_bid_constraints: updated.bid_constraints,
                }
              : row
          )
        );
      }
      pushLog("meta-bid", {
        message: requiresBidValue
          ? `Custo atualizado (${formatBidStrategy(bidStrategy)}): ${adsetId} -> R$ ${bidNumber.toFixed(2)}`
          : `Estrategia atualizada (sem bid): ${adsetId}`,
      });
    } catch (err) {
      pushLog("meta-bid", err);
    } finally {
      setBidLoading((prev) => {
        const next = { ...prev };
        delete next[adsetId];
        return next;
      });
    }
  };
  const handlePublishDrafts = async () => {
    if (!drafts.length) return;
    setPublishing(true);
    const forceUtmCopy = true;
    const remaining = [];
    for (const draft of drafts) {
      let step = "copy";
      let manualCopyAds = forceUtmCopy;
      let adCopyMode = forceUtmCopy ? "create" : "copy";
      try {
        step = "copy";
        let copyRes;
        if (forceUtmCopy) {
          copyRes = await fetchJson(`${API_BASE}/meta-adset-copy`, {
            method: "POST",
            body: JSON.stringify({
              adset_id: draft.source_adset_id,
              status_option: DUPLICATE_STATUS,
              rename_strategy: "DEEP_RENAME",
              rename_options: { prefix: "Copia - ", suffix: "" },
              number_of_copies: draft.copies || 1,
              include_creative: false,
              deep_copy: false,
            }),
          });
        } else {
          try {
            copyRes = await fetchJson(`${API_BASE}/meta-adset-copy`, {
              method: "POST",
              body: JSON.stringify({
                adset_id: draft.source_adset_id,
                status_option: DUPLICATE_STATUS,
                rename_strategy: "DEEP_RENAME",
                rename_options: { prefix: "Copia - ", suffix: "" },
                number_of_copies: draft.copies || 1,
                include_creative: true,
                deep_copy: true,
              }),
            });
          } catch (err) {
            const subcode =
              err?.data?.details?.error?.error_subcode ||
              err?.data?.details?.error_subcode;
            if (subcode === 1885194) {
              manualCopyAds = true;
              pushLog("duplicar-copy", {
                message:
                  "Limite Meta ao copiar muitos anuncios. Fazendo copia simples e replicando anuncios individualmente.",
              });
              copyRes = await fetchJson(`${API_BASE}/meta-adset-copy`, {
                method: "POST",
                body: JSON.stringify({
                  adset_id: draft.source_adset_id,
                  status_option: DUPLICATE_STATUS,
                  rename_strategy: "DEEP_RENAME",
                  rename_options: { prefix: "Copia - ", suffix: "" },
                  number_of_copies: draft.copies || 1,
                  include_creative: false,
                  deep_copy: false,
                }),
              });
            } else if (subcode === 3858504) {
              manualCopyAds = true;
              adCopyMode = "create";
              pushLog("duplicar-copy", {
                message:
                  "Criativo com aprimoramentos padrao descontinuado. Copiando conjunto e recriando anuncios.",
              });
              copyRes = await fetchJson(`${API_BASE}/meta-adset-copy`, {
                method: "POST",
                body: JSON.stringify({
                  adset_id: draft.source_adset_id,
                  status_option: DUPLICATE_STATUS,
                  rename_strategy: "DEEP_RENAME",
                  rename_options: { prefix: "Copia - ", suffix: "" },
                  number_of_copies: draft.copies || 1,
                  include_creative: false,
                  deep_copy: false,
                }),
              });
            } else {
              throw err;
            }
          }
        }
        const adsetIds =
          copyRes.data?.adset_ids ||
          (copyRes.new_adset_id ? [copyRes.new_adset_id] : null) ||
          (copyRes.data?.copied_adset_id ? [copyRes.data.copied_adset_id] : null) ||
          (copyRes.data?.id ? [copyRes.data.id] : null) ||
          [];
        const adIdsMatrix = copyRes.data?.ad_ids || [];
        if (!adsetIds.length) {
          throw new Error("Nao foi possivel obter o ID do novo conjunto.");
        }

        for (let i = 0; i < adsetIds.length; i += 1) {
          const newAdsetId = adsetIds[i];

          if (draft.adset_new_name && draft.adset_new_name.trim()) {
            step = "rename-adset";
            await fetchJson(`${API_BASE}/meta-rename`, {
              method: "POST",
              body: JSON.stringify({
                object_id: newAdsetId,
                name: draft.adset_new_name.trim(),
              }),
            });
          }

          if (draft.daily_budget_brl) {
            step = "budget";
            await fetchJson(`${API_BASE}/meta-adset-budget`, {
              method: "POST",
              body: JSON.stringify({
                adset_id: newAdsetId,
                daily_budget_brl: draft.daily_budget_brl,
              }),
            });
          }

          let newAds = adIdsMatrix[i] || [];
          let adMappings = [];

          if (manualCopyAds) {
            let sourceAds = (draft.ads || []).filter((ad) => !ad.removed);
            try {
              const liveAdsRes = await fetchJson(
                `${API_BASE}/meta-adset-ads?${new URLSearchParams({
                  adset_id: draft.source_adset_id,
                }).toString()}`
              );
              const liveAds = liveAdsRes.data || [];
              const liveMap = new Map(
                liveAds.map((ad) => [ad.id, { id: ad.id, name: ad.name }])
              );
              const before = sourceAds.length;
              sourceAds = sourceAds
                .filter((ad) => liveMap.has(ad.id))
                .map((ad) => {
                  const live = liveMap.get(ad.id);
                  return live ? { ...ad, name: live.name } : ad;
                });
              if (before !== sourceAds.length) {
                pushLog("duplicar-validate", {
                  message: `Removidos ${before - sourceAds.length} anuncios inexistentes do rascunho.`,
                });
              }
            } catch (err) {
              pushLog("duplicar-validate", err);
            }
            for (let a = 0; a < sourceAds.length; a += 1) {
              const ad = sourceAds[a];
              let newAdId = null;
              if (adCopyMode === "create") {
                step = "create-ad";
                try {
                  const createRes = await retryOnSubcode33(() =>
                    fetchJson(`${API_BASE}/meta-ad-create`, {
                      method: "POST",
                      body: JSON.stringify({
                        ad_id: ad.id,
                        adset_id: newAdsetId,
                        name: ad.new_name || ad.name,
                        status: DUPLICATE_STATUS,
                        utm_tags: DEFAULT_UTM_TAGS,
                        sanitize_video_placements: true,
                      }),
                    })
                  );
                  newAdId = createRes.new_ad_id || createRes.data?.id || null;
                } catch (err) {
                  const subcode =
                    err?.data?.details?.error?.error_subcode ||
                    err?.data?.details?.error_subcode;
                  if (subcode === 33) {
                    pushLog("duplicar-create", {
                      message: `Anuncio nao encontrado ou sem permissao: ${ad.id}`,
                      detail: err?.data?.details || err?.data,
                    });
                    newAdId = null;
                  } else {
                    throw err;
                  }
                }
              } else {
                step = "copy-ad";
                try {
                  const copyAdRes = await retryOnSubcode33(() =>
                    fetchJson(`${API_BASE}/meta-ad-copy`, {
                      method: "POST",
                      body: JSON.stringify({
                        ad_id: ad.id,
                        adset_id: newAdsetId,
                        status_option: DUPLICATE_STATUS,
                        rename_strategy: "DEEP_RENAME",
                        rename_options: { prefix: "Copia - ", suffix: "" },
                      }),
                    })
                  );
                  newAdId =
                    copyAdRes.new_ad_id ||
                    copyAdRes.data?.copied_ad_id ||
                    copyAdRes.data?.id ||
                    null;
                } catch (err) {
                  const subcode =
                    err?.data?.details?.error?.error_subcode ||
                    err?.data?.details?.error_subcode;
                  if (subcode === 3858504) {
                    step = "create-ad";
                    try {
                      const createRes = await retryOnSubcode33(() =>
                        fetchJson(`${API_BASE}/meta-ad-create`, {
                          method: "POST",
                          body: JSON.stringify({
                            ad_id: ad.id,
                            adset_id: newAdsetId,
                            name: ad.new_name || ad.name,
                            status: DUPLICATE_STATUS,
                            utm_tags: DEFAULT_UTM_TAGS,
                            sanitize_video_placements: true,
                          }),
                        })
                      );
                      newAdId =
                        createRes.new_ad_id || createRes.data?.id || null;
                    } catch (errCreate) {
                      const subcodeCreate =
                        errCreate?.data?.details?.error?.error_subcode ||
                        errCreate?.data?.details?.error_subcode;
                      if (subcodeCreate === 33) {
                        pushLog("duplicar-create", {
                          message: `Anuncio nao encontrado ou sem permissao: ${ad.id}`,
                          detail: errCreate?.data?.details || errCreate?.data,
                        });
                        newAdId = null;
                      } else {
                        throw errCreate;
                      }
                    }
                  } else if (subcode === 33) {
                    pushLog("duplicar-copy", {
                      message: `Anuncio nao encontrado ou sem permissao: ${ad.id}`,
                      detail: err?.data?.details || err?.data,
                    });
                    newAdId = null;
                  } else {
                    throw err;
                  }
                }
              }
              adMappings.push({ source: ad, newId: newAdId });
            }
          } else {
            if (!newAds.length) {
              step = "list-ads";
              const adsRes = await fetchJson(
                `${API_BASE}/meta-adset-ads?${new URLSearchParams({
                  adset_id: newAdsetId,
                }).toString()}`
              );
              newAds = (adsRes.data || []).map((ad) => ad.id);
            }
            adMappings = (draft.ads || []).map((ad, idx) => ({
              source: ad,
              newId: newAds[idx],
            }));
          }

          for (let a = 0; a < adMappings.length; a += 1) {
            const { source: ad, newId: targetId } = adMappings[a];
            if (!targetId) continue;
            if (!manualCopyAds && ad.removed) {
              step = "delete-ad";
              await fetchJson(`${API_BASE}/meta-delete-ad`, {
                method: "POST",
                body: JSON.stringify({
                  ad_id: targetId,
                }),
              });
              continue;
            }
            if (ad.removed) continue;
            const nextName = (ad.new_name || "").trim();
            if (nextName && nextName !== ad.name) {
              step = "rename-ad";
              await fetchJson(`${API_BASE}/meta-rename`, {
                method: "POST",
                body: JSON.stringify({
                  object_id: targetId,
                  name: nextName,
                }),
              });
            }
          }
        }

        pushLog("duplicar", {
          message: `Publicado: ${draft.source_adset_name} -> ${draft.adset_new_name}`,
        });
      } catch (err) {
        pushLog(`duplicar-${step}`, err);
        remaining.push(draft);
      }
    }
    setDrafts(remaining);
    setPublishing(false);
  };

  useEffect(() => {
    handleLoadDomains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const mergedMeta = useMemo(() => {
    if (!metaRows?.length) return [];
    const superRows = Array.isArray(superFilter) ? superFilter : [];
    const termRows = Array.isArray(superTermRows) ? superTermRows : [];
    const appliedDomain = appliedFilters?.domain || filters.domain || "";
    const domainKey = normalizeKey(appliedDomain);
    const domainFilteredSuper = superRows.filter((row) => {
      const d = normalizeKey(row.domain || row.name || "");
      return domainKey ? d === domainKey : true;
    });
    const domainFilteredTerm = termRows.filter((row) => {
      const d = normalizeKey(row.domain || row.name || "");
      return domainKey ? d === domainKey : true;
    });
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

    const superByCustom = new Map();
    const contentSet = new Set();
    domainFilteredSuper.forEach((row) => {
      const keyNorm = normalizeKey(row.custom_value);
      if (!keyNorm) return;
      contentSet.add(keyNorm);
      const entry = superByCustom.get(keyNorm) || {
        impressions: 0,
        clicks: 0,
        revenue: 0,
        revenue_client: 0,
        ecpm: null,
        ecpm_client: null,
      };
      entry.impressions += toNumber(row.impressions);
      entry.clicks += toNumber(row.clicks);
      entry.revenue += toNumber(row.revenue);
      entry.revenue_client += toNumber(row.revenue_client);
      if (row.ecpm != null) entry.ecpm = toNumber(row.ecpm);
      if (row.ecpm_client != null) entry.ecpm_client = toNumber(row.ecpm_client);
      superByCustom.set(keyNorm, entry);
    });

    const kvByCustom = new Map();
    kvContent.forEach((row) => {
      const keyNorm = normalizeKey(row.custon_value || row.custom_value);
      if (!keyNorm) return;
      const entry = kvByCustom.get(keyNorm) || {
        impressions: 0,
        clicks: 0,
        revenue: 0,
        revenue_client: 0,
        ecpm: null,
        ecpm_client: null,
      };
      entry.impressions += toNumber(row.impressions);
      entry.clicks += toNumber(row.clicks);
      entry.revenue += toNumber(row.earnings || row.earnings_client);
      entry.revenue_client += toNumber(row.earnings_client);
      if (row.ecpm != null) entry.ecpm = toNumber(row.ecpm);
      if (row.ecpm_client != null) entry.ecpm_client = toNumber(row.ecpm_client);
      kvByCustom.set(keyNorm, entry);
    });

    const termSet = new Set(
      domainFilteredTerm
        .map((r) => normalizeKey(r.custom_value))
        .filter(Boolean)
    );
    const hasTermData = termSet.size > 0;
    const hasContentData = contentSet.size > 0;

    return metaRows.map((row) => {
      const date = row.date_start || row.date || "";
      const join = earningsByDate[date] || {};
      const nameKey = normalizeKey(row.ad_name);
      const adIdKey = normalizeKey(row.ad_id || "");
      const adsetKey = normalizeKey(row.adset_name || "");

      const fromCustom =
        superByCustom.get(nameKey) ||
        superByCustom.get(adIdKey) ||
        {};

      const fromKv =
        kvByCustom.get(nameKey) ||
        kvByCustom.get(adIdKey) ||
        {};

      const matchedByContent = contentSet.has(nameKey) || contentSet.has(adIdKey);
      const matchedByTerm = termSet.has(adsetKey);
      const hasJoinads = hasContentData
        ? matchedByContent ||
          Object.keys(fromCustom).length > 0 ||
          Object.keys(fromKv).length > 0
        : hasTermData
        ? matchedByTerm
        : false;

      const impressionsJoin = toNumber(
        fromKv.impressions ?? fromCustom.impressions ?? null
      );

      const ecpmClient =
        fromKv.ecpm_client ??
        fromKv.ecpm ??
        fromCustom.ecpm_client ??
        fromCustom.ecpm ??
        (impressionsJoin
          ? ((fromKv.revenue_client ??
              fromKv.revenue ??
              fromCustom.revenue_client ??
              fromCustom.revenue) /
              impressionsJoin) *
            1000
          : null);

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
      const dailyBudgetBrl =
        row.adset_daily_budget != null
          ? toNumber(row.adset_daily_budget) / 100
          : null;
      const lifetimeBudgetBrl =
        row.adset_lifetime_budget != null
          ? toNumber(row.adset_lifetime_budget) / 100
          : null;
      const rawBid =
        row.adset_bid_amount != null
          ? row.adset_bid_amount
          : row.adset_bid_constraints &&
            (row.adset_bid_constraints.cost_cap ??
              row.adset_bid_constraints.bid_cap ??
              row.adset_bid_constraints?.cost_per_result_goal);
      const bidAmountBrl =
        rawBid != null ? toNumber(rawBid) / 100 : null;

      return {
        ...row,
        date,
        destination_url: adDestMap[row.ad_id] || row.destination_url || "",
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
        adset_daily_budget_brl: dailyBudgetBrl,
        adset_lifetime_budget_brl: lifetimeBudgetBrl,
        adset_bid_amount_brl: bidAmountBrl,
        adset_bid_strategy: row.adset_bid_strategy,
        adset_optimization_goal: row.adset_optimization_goal,
        adset_bid_constraints: row.adset_bid_constraints,
      };
    });
  }, [
    metaRows,
    earnings,
    superFilter,
    superTermRows,
    keyValueContent,
    brlRate,
    superKey,
    appliedFilters,
    adDestMap,
  ]);

  const isTodaySelected = useMemo(() => {
    const endRaw = appliedFilters?.endDate || filters.endDate;
    if (!endRaw) return false;
    return endRaw === formatDate(new Date());
  }, [appliedFilters, filters.endDate]);

  const metaDomainFiltered = useMemo(() => {
    const term = filters.adsetFilter.trim().toLowerCase();
    const domainKey = normalizeKey(appliedFilters?.domain || filters.domain || "");
    const base = mergedMeta.filter((row) => {
      if (!domainKey) return true;
      const host = getHostname(row.destination_url);
      if (!host) return true;
      return normalizeKey(host) === domainKey;
    });
    if (!term) return base;
    return base.filter((row) =>
      (row.adset_name || "").toLowerCase().includes(term)
    );
  }, [mergedMeta, filters.adsetFilter, appliedFilters, filters.domain]);

  const filteredMeta = useMemo(() => {
    if (isTodaySelected) {
      // Hoje: mantém linhas Meta mesmo sem match JoinAds (JoinAds pode atrasar).
      return metaDomainFiltered;
    }
    return metaDomainFiltered.filter((row) => row.joinads_matched);
  }, [metaDomainFiltered, isTodaySelected]);

  const dupNameMap = useMemo(() => {
    const map = new Map();
    (dupCampaigns || []).forEach((camp) => {
      (camp.adsets || []).forEach((adset) => {
        const key = normalizeKey(adset.name || "");
        if (!key) return;
        const entry =
          map.get(key) || { name: adset.name, ids: new Set(), statuses: new Map() };
        if (adset.id) entry.ids.add(adset.id);
        const status =
          (adset.effective_status || adset.status || "").toUpperCase();
        if (adset.id && status) {
          entry.statuses.set(adset.id, status);
        }
        map.set(key, entry);
      });
    });
    const duplicates = new Map();
    map.forEach((entry, key) => {
      if (entry.ids.size > 1) {
        duplicates.set(key, entry);
      }
    });
    return duplicates;
  }, [dupCampaigns]);

  const joinadsByTerm = useMemo(() => {
    const rows = Array.isArray(superTermRows) ? superTermRows : [];
    const domainKey = normalizeKey(appliedFilters?.domain || filters.domain || "");
    const map = new Map();
    rows.forEach((row) => {
      const d = normalizeKey(row.domain || row.name || "");
      if (domainKey && d !== domainKey) return;
      const key = normalizeKey(row.custom_value);
      if (!key) return;
      const entry = map.get(key) || {
        impressions: 0,
        clicks: 0,
        revenue: 0,
        ecpm: 0,
      };
      entry.impressions += toNumber(row.impressions);
      entry.clicks += toNumber(row.clicks);
      entry.revenue += toNumber(row.revenue_client || row.revenue);
      map.set(key, entry);
    });
    return map;
  }, [superTermRows, appliedFilters, filters.domain]);


  const metaTotals = useMemo(() => {
    const spendBrl = (metaDomainFiltered || []).reduce(
      (acc, row) => acc + toNumber(row.spend_value || row.spend),
      0
    );
    return { spendBrl };
  }, [metaDomainFiltered]);

  const filteredEditAds = useMemo(() => {
    const term = editCampaignFilter.trim().toLowerCase();
    if (!term) return editAds;
    return (editAds || []).filter((row) =>
      (row.campaign_name || "").toLowerCase().includes(term)
    );
  }, [editAds, editCampaignFilter]);

  const isMultiDay = useMemo(() => {
    const startRaw = appliedFilters?.startDate || filters.startDate;
    const endRaw = appliedFilters?.endDate || filters.endDate;
    const start = new Date(startRaw);
    const end = new Date(endRaw);
    if (!startRaw || !endRaw || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return false;
    }
    const diffMs = end.getTime() - start.getTime();
    return diffMs >= 24 * 60 * 60 * 1000;
  }, [appliedFilters, filters.startDate, filters.endDate]);

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem("__cd_dup_campaigns__");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.data || !parsed?.time) return;
      const isSameAccount =
        (parsed.account || "").trim() === filters.metaAccountId.trim();
      const maxAge = 10 * 60 * 1000;
      if (isSameAccount && Date.now() - parsed.time <= maxAge) {
        setDupCampaigns(parsed.data);
      }
    } catch (e) {
      // ignore cache errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (authed === null) return html`
    <div className="login-page">
      <div className="login-checking">
        <span className="login-spinner"></span>
        Verificando sessão...
      </div>
    </div>
  `;

  if (!authed) return html`
    <${LoginView} onAuthed=${(em) => { setAuthed(true); setAuthEmail(em); }} />
  `;

  return html`
    <div className="layout">
      <header className="topbar">
        <div>
          <h1>Dashboard de Publisher</h1>
          <p className="subtitle">
            Arbitragem de tráfego com dados em tempo real da JoinAds.
            <span className="muted small"> • Versão ${APP_VERSION}</span>
          </p>
        </div>
        <div className="actions">
          <div className="muted small">
            ${usdBrl ? `USD hoje: R$ ${usdBrl.toFixed(2)}` : "Atualizando cotação..."}
          </div>
          <div className="muted small">
            Ultima atualizacao: ${formatDateTime(lastRefreshed)}
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
          <div className="login-topbar-user">
            <span className="login-topbar-email">${authEmail}</span>
            <button className="ghost" style=${{ fontSize: "0.8rem", padding: "5px 12px" }} onClick=${handleLogout}>
              Sair
            </button>
          </div>
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
          className=${`tab ${activeTab === "duplicar" ? "active" : ""}`}
          onClick=${() => setActiveTab("duplicar")}
        >
          Duplicar
        </button>
        <button
          className=${`tab ${activeTab === "editar" ? "active" : ""}`}
          onClick=${() => setActiveTab("editar")}
        >
          Editar
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
        <button
          className=${`tab ${activeTab === "token" ? "active" : ""}`}
          onClick=${() => setActiveTab("token")}
        >
          Token Meta
        </button>
        <button
          className=${`tab ${activeTab === "pages" ? "active" : ""}`}
          onClick=${() => setActiveTab("pages")}
        >
          Páginas
        </button>
        <button
          className=${`tab ${activeTab === "criar" ? "active" : ""}`}
          onClick=${() => setActiveTab("criar")}
          style=${{ background: activeTab === "criar" ? "var(--accent)" : "#e8f5e9", borderColor: activeTab === "criar" ? "transparent" : "#a5d6a7", color: activeTab === "criar" ? "#fff" : "#1b5e20" }}
        >
          + Criar campanha
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
                  onBudgetUpdate=${handleUpdateBudget}
                  budgetLoading=${budgetLoading}
                  onBidUpdate=${handleUpdateBid}
                  bidLoading=${bidLoading}
                  isMultiDay=${isMultiDay}
                />
              `}
              ${html`<${MetaJoinAdsetTable} rows=${filteredMeta} joinadsRows=${superTermRows} brlRate=${brlRate} />`}
              ${html`<${SemUtmAttribution} semUtmRow=${semUtmRow} joinadsRows=${superTermRows} metaRows=${filteredMeta} brlRate=${brlRate} />`}
              ${html`<${MetaJoinGroupedTable} rows=${filteredMeta} />`}
              ${html`<${EarningsTable} rows=${earningsAll} />`}
            </main>
          `
        : activeTab === "duplicar"
        ? html`
            <${DuplicarView}
              campaigns=${dupCampaigns}
              loading=${dupLoading}
              error=${dupError}
              onLoad=${handleLoadDuplicar}
              onRefreshStatus=${handleRefreshDuplicarStatus}
              statusLoading=${dupStatusLoading}
              copyCounts=${copyCounts}
              setCopyCount=${setCopyCount}
              onAddDraft=${addDraftFromAdset}
              drafts=${drafts}
              onRemoveDraft=${removeDraft}
              onUpdateDraft=${updateDraft}
              onUpdateDraftAd=${updateDraftAd}
              onToggleDraftAd=${toggleDraftAd}
              onPublish=${handlePublishDrafts}
              publishing=${publishing}
              selectedAdsets=${selectedAdsets}
              onToggleAdset=${toggleSelectAdset}
              onDeleteAdsets=${handleDeleteAdsets}
            />
          `
        : activeTab === "editar"
        ? html`
            <${EditarView}
              ads=${filteredEditAds}
              loading=${editLoading}
              error=${editError}
              onLoad=${handleLoadEditar}
              onUpdateField=${updateEditAdField}
              onSave=${handleSaveEditAd}
              saving=${editSaving}
              campaignFilter=${editCampaignFilter}
              onCampaignFilter=${setEditCampaignFilter}
              onCleanParams=${handleCleanParams}
              onVerify=${handleVerifyEditAd}
              verifying=${editVerifying}
              onRenameAd=${(id, name, key) =>
                handleRenameObject(id, name, key)}
              onRenameAdset=${(id, name, key) =>
                handleRenameObject(id, name, key)}
              editRenaming=${editRenaming}
              onResolveDestination=${handleResolveDestination}
            />
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
        : activeTab === "token"
        ? html`
            <${MetaTokenView}
              info=${tokenInfo}
              loading=${tokenLoading}
              error=${tokenError}
              onCheck=${handleTokenCheck}
            />
          `
        : activeTab === "pages"
        ? html`
            <main className="grid">
              <section className="card wide">
                <div className="card-head">
                  <div>
                    <span className="eyebrow">Meta</span>
                    <h2 className="section-title">Páginas gerenciadas</h2>
                  </div>
                  <div className="chip-group">
                    <button className="ghost" onClick=${handleLoadPages} disabled=${pagesLoading}>
                      ${pagesLoading ? "Carregando..." : "Carregar páginas"}
                    </button>
                    <span className="chip neutral">${pagesList.length} páginas</span>
                  </div>
                </div>
                ${pagesError
                  ? html`<div className="status error"><strong>Erro:</strong> ${pagesError}</div>`
                  : null}
                <div className="table-wrapper scroll-x">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Nome</th>
                        <th>Categoria</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${pagesList.length === 0
                        ? html`<tr><td colSpan="3" className="muted">Sem páginas carregadas.</td></tr>`
                        : pagesList.map(
                            (page) => html`
                              <tr key=${page.id}>
                                <td>${page.id}</td>
                                <td>${page.name}</td>
                                <td>${page.category || "-"}</td>
                              </tr>
                            `
                          )}
                    </tbody>
                  </table>
                </div>
              </section>
            </main>
          `
        : activeTab === "criar"
        ? html`
            <main className="grid">
              <${CriarCampanhaView}
                accountId=${filters.metaAccountId.trim()}
                pages=${pagesList}
                pagesLoading=${pagesLoading}
                onLoadPages=${handleLoadPages}
                pixels=${pixelsList}
                pixelsLoading=${pixelsLoading}
                onLoadPixels=${handleLoadPixels}
              />
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
                  domain=${appliedFilters?.domain || filters.domain}
                  superKey=${superKey}
                />
              `}
              ${html`<${DiagnosticsNoUtmSummary} row=${semUtmRow} />`}
            </main>
          `}

    </div>
  `;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(html`<${App} />`);
}












