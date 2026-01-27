import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.2.0";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(React.createElement);
const API_BASE = "/api";
const DEFAULT_UTM_TAGS =
  "utm_source=fb&utm_medium=cpc&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&ad_id={{ad.id}}";
const DUPLICATE_STATUS = "ACTIVE";
const APP_VERSION_BUILD = 25;
const APP_VERSION = (APP_VERSION_BUILD / 100).toFixed(2);
const CPA_MIN_ACTIVE = 2;

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
  const method = (options.method || "GET").toUpperCase();
  const cacheTtl = options.cacheTtlMs || 0;
  const cacheKey = options.cacheKey || path;
  if (method === "GET" && cacheTtl && !options.force) {
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
  if (method === "GET" && cacheTtl) {
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
  refresh,
  loading,
  error,
  onCheck,
  onRefresh,
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
  const tokenText = refresh?.access_token || "";
  const refreshExpiresAt =
    refresh?.expires_at ? new Date(refresh.expires_at * 1000) : null;

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
            <button className="primary" onClick=${onRefresh} disabled=${loading}>
              ${loading ? "Renovando..." : "Renovar token"}
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

        <div className="token-note">
          <p className="muted small">
            Para renovar via API, configure <strong>META_APP_ID</strong> e
            <strong> META_APP_SECRET</strong> no Cloudflare. O novo token nao eh
            salvo automaticamente.
          </p>
        </div>

        ${refresh
          ? html`
              <div className="token-output">
                <div className="token-output-head">
                  <div>
                    <strong>Novo token gerado</strong>
                    ${refreshExpiresAt
                      ? html`<div className="muted small">
                          Expira em ${refreshExpiresAt.toLocaleString("pt-BR")}
                        </div>`
                      : null}
                  </div>
                  <button
                    className="ghost small"
                    onClick=${() =>
                      tokenText &&
                      navigator.clipboard?.writeText(tokenText).catch(() => {})}
                  >
                    Copiar
                  </button>
                </div>
                <textarea readonly value=${tokenText}></textarea>
                <div className="muted small">
                  Cole este token em <strong>META_ACCESS_TOKEN</strong> no
                  Cloudflare.
                </div>
              </div>
            `
          : null}
      </section>
    </main>
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
const normalizeKey = (value) =>
  (value ?? "")
    .toString()
    .trim()
    .toLowerCase();

function buildAdsetGrouped(rows, joinadsRows, brlRate) {
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

function MetaJoinTable({
  rows,
  adsetFilter,
  onFilterChange,
  onToggleAd,
  statusLoading,
  onBudgetUpdate,
  budgetLoading,
}) {
  const asText = (value) => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };
  const [budgetInputs, setBudgetInputs] = useState({});

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
                    <td colSpan="14" className="muted">Sem dados para o periodo.</td>
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
                              const current =
                                row.adset_daily_budget_brl != null
                                  ? currencyBRL.format(row.adset_daily_budget_brl)
                                  : row.adset_lifetime_budget_brl != null
                                  ? `${currencyBRL.format(row.adset_lifetime_budget_brl)} (vitalicio)`
                                  : "-";
                              const fallbackValue =
                                row.adset_daily_budget_brl != null
                                  ? row.adset_daily_budget_brl.toFixed(2)
                                  : "";
                              return html`<div className="budget-cell">
                                <div className="budget-meta">
                                  <span className="muted small">Atual: ${current}</span>
                                </div>
                                <div className="budget-actions">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="R$"
                                    value=${getBudget(row.adset_id, fallbackValue)}
                                    onChange=${(e) =>
                                      setBudget(row.adset_id, e.target.value)}
                                    onKeyDown=${(e) => {
                                      if (e.key === "Enter") {
                                        onBudgetUpdate?.(
                                          row.adset_id,
                                          getBudget(row.adset_id, fallbackValue)
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
                                        getBudget(row.adset_id, fallbackValue)
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

function CPAView({
  groups,
  totals,
  filter,
  onFilterChange,
  rule,
  onRuleChange,
  onApplyRule,
  ruleLoading,
  onToggleGroup,
  statusLoading,
  watchMap,
  onToggleWatch,
}) {
  return html`
    <main className="grid">
      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">CPA Farming</span>
            <h2 className="section-title">Conjuntos agrupados</h2>
          </div>
          <div className="chip-group">
            <span className="chip neutral">${groups.length} grupos</span>
            <span className="chip neutral">${totals.adsets} conjuntos</span>
            <span className="chip neutral">
              Gasto total: ${currencyBRL.format(totals.spend)}
            </span>
          </div>
        </div>
        ${cpaSyncError
          ? html`<div className="status error">
              <strong>Erro KV:</strong> ${cpaSyncError}
            </div>`
          : null}

        <div className="filters">
          <label className="field">
            <span>Filtrar por conjunto</span>
            <input
              type="text"
              placeholder="Ex: cpa-farming"
              value=${filter}
              onInput=${(e) => onFilterChange?.(e.target.value)}
            />
          </label>
          <label className="field">
            <span>CPA máximo (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.05"
              value=${rule.cpa || ""}
              onInput=${(e) =>
                onRuleChange?.({ ...rule, cpa: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Gasto máximo (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.05"
              value=${rule.spend || ""}
              onInput=${(e) =>
                onRuleChange?.({ ...rule, spend: e.target.value })}
            />
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button
              className="ghost"
              disabled=${ruleLoading}
              onClick=${onApplyRule}
            >
              ${ruleLoading ? "Aplicando..." : "Aplicar regra"}
            </button>
          </div>
        </div>
        ${watchMap && Object.keys(watchMap).length
          ? html`<div className="status neutral" style=${{ marginTop: "12px" }}>
              Vigilância ativa em ${Object.keys(watchMap).length} conjunto(s).
              Requer atualizar os dados para acompanhar.
            </div>`
          : null}

        <div className="table-wrapper scroll-x" style=${{ marginTop: "12px" }}>
          <table>
            <thead>
              <tr>
                <th>Conjunto</th>
                <th>Qtd. conjuntos</th>
                <th>Resultados</th>
                <th>CPA</th>
                <th>Valor gasto</th>
                <th>ROAS</th>
                <th>Receita JoinAds</th>
                <th>eCPM JoinAds</th>
                <th>Impressões JoinAds</th>
                <th>Status</th>
                <th>Vigiar</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              ${groups.length === 0
                ? html`<tr><td colSpan="12" className="muted">Sem dados para o período.</td></tr>`
                : groups.map((group) => {
                    const busy = group.adset_ids.some(
                      (id) => statusLoading && statusLoading[id]
                    );
                    const toggleLabel = group.all_active ? "Desligar" : "Ligar";
                    const nextStatus = group.all_active ? "PAUSED" : "ACTIVE";
                    const watch = watchMap && watchMap[group.key];
                    return html`
                      <tr key=${group.key}>
                        <td>${group.name}</td>
                        <td>${number.format(group.adset_count)}</td>
                        <td>${number.format(group.results || 0)}</td>
                        <td>${group.cpa_value != null ? currencyBRL.format(group.cpa_value) : "-"}</td>
                        <td>${currencyBRL.format(group.spend)}</td>
                        <td>${group.roas != null ? `${group.roas.toFixed(2)}x` : "-"}</td>
                        <td>${group.revenue_usd != null ? currencyUSD.format(group.revenue_usd) : "-"}</td>
                        <td>${group.ecpm != null ? currencyUSD.format(group.ecpm) : "-"}</td>
                        <td>${group.impressions ? number.format(group.impressions) : "-"}</td>
                        <td>
                          <span className=${`status-badge ${group.status_tone}`}>
                            ${group.status_label}
                          </span>
                          <div className="muted small">
                            ${group.active_count} ativos • ${group.paused_count} pausados
                          </div>
                        </td>
                        <td>
                          <button
                            className=${`toggle ${watch ? "on" : "off"}`}
                            onClick=${() => onToggleWatch?.(group)}
                          >
                            ${watch ? "Vigiando" : "Desligado"}
                          </button>
                          ${watch
                            ? html`<div className="muted small">
                                ${watch.cpa ? `CPA<=${watch.cpa}` : ""}
                                ${watch.cpa && watch.spend ? " • " : ""}
                                ${watch.spend ? `Gasto<=${watch.spend}` : ""}
                              </div>`
                            : null}
                        </td>
                        <td>
                          <button
                            className=${`toggle ${group.all_active ? "on" : "off"}`}
                            disabled=${busy}
                            onClick=${() => onToggleGroup?.(group.adset_ids, nextStatus)}
                          >
                            ${busy ? "..." : toggleLabel}
                          </button>
                        </td>
                      </tr>
                    `;
                  })}
            </tbody>
          </table>
          ${groups.length
            ? html`<div className="totals-row">
                <div><strong>Totais</strong></div>
                <div>Gasto: ${currencyBRL.format(totals.spend)}</div>
                <div>Receita: ${currencyUSD.format(totals.revenue_usd)}</div>
                <div>Impressões: ${number.format(totals.impressions)}</div>
              </div>`
            : null}
        </div>
      </section>
    </main>
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
  const [tokenRefresh, setTokenRefresh] = useState(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [cpaFilter, setCpaFilter] = useState("");
  const [cpaRule, setCpaRule] = useState({ cpa: "", spend: "" });
  const [cpaRuleLoading, setCpaRuleLoading] = useState(false);
  const [adsetStatusLoading, setAdsetStatusLoading] = useState({});
  const [cpaWatch, setCpaWatch] = useState({});
  const [cpaSyncError, setCpaSyncError] = useState("");

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
      // key-value mantido em utm_campaign para evitar 422 em tokens que não aceitam utm_content
      const keyValueContentPromise = fetchJson(
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
          }).toString()}`,
          {
            cacheTtlMs: 3 * 60 * 1000,
            cacheKey: `key-value:${filters.domain}:${filters.startDate}:${filters.endDate}:${filters.reportType}`,
          }
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

      const [topRes, earningsRes, earningsAllRes] = await Promise.all([
        topPromise,
        earningsPromise,
        earningsAllPromise,
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
        const metaParams = new URLSearchParams({
          account_id: filters.metaAccountId.trim(),
          start_date: filters.startDate,
          end_date: filters.endDate,
          include_assets: filters.includeAssets ? "1" : "0",
        });
        const metaRes = await fetchJson(
          `${API_BASE}/meta-insights?${metaParams.toString()}`,
          {
            cacheTtlMs: filters.includeAssets ? 2 * 60 * 1000 : 8 * 60 * 1000,
            cacheKey: `meta-insights:${metaParams.toString()}`,
          }
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
      setEarningsAll(earningsAllRes.data || []);
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

  const handleTokenRefresh = async () => {
    setTokenLoading(true);
    setTokenError("");
    try {
      const res = await fetchJson(`${API_BASE}/meta-token-refresh`, {
        method: "POST",
      });
      setTokenRefresh(res);
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

  const saveCpaRules = async (nextWatch) => {
    if (!filters.metaAccountId.trim()) return;
    const rules = {};
    Object.entries(nextWatch || {}).forEach(([key, rule]) => {
      const group = cpaGroups.find((g) => g.key === key);
      if (!group) return;
      rules[key] = {
        name: group.name,
        adset_ids: group.adset_ids,
        cpa: rule.cpa ?? null,
        spend: rule.spend ?? null,
      };
    });
    try {
      await fetchJson(
        `${API_BASE}/cpa-rules?${new URLSearchParams({
          account_id: filters.metaAccountId.trim(),
        }).toString()}`,
        {
          method: "POST",
          body: JSON.stringify({ rules }),
        }
      );
      setCpaSyncError("");
    } catch (err) {
      setCpaSyncError(formatError(err));
      pushLog("cpa-rules", err);
    }
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

  const handleApplyCpaRule = async () => {
    const cpaLimit = Number(String(cpaRule.cpa || "").replace(",", "."));
    const spendLimit = Number(String(cpaRule.spend || "").replace(",", "."));
    const hasCpa = Number.isFinite(cpaLimit) && cpaLimit > 0;
    const hasSpend = Number.isFinite(spendLimit) && spendLimit > 0;
    if (!hasCpa && !hasSpend) {
      pushLog("cpa-rule", { message: "Informe um CPA ou gasto máximo." });
      return;
    }
    const watchedKeys = Object.keys(cpaWatch || {});
    if (!watchedKeys.length) {
      pushLog("cpa-rule", { message: "Selecione conjuntos para vigiar." });
      return;
    }
    const updatedWatch = { ...cpaWatch };
    watchedKeys.forEach((key) => {
      updatedWatch[key] = {
        cpa: hasCpa ? cpaLimit : null,
        spend: hasSpend ? spendLimit : null,
      };
    });
    setCpaWatch(updatedWatch);
    await saveCpaRules(updatedWatch);
    const toPause = [];
    cpaGroups.forEach((group) => {
      if (!updatedWatch[group.key]) return;
      const exceedSpend =
        hasSpend && group.spend > spendLimit;
      let exceedCpa = false;
      if (hasCpa) {
        if (group.cpa_value != null) {
          exceedCpa = group.cpa_value > cpaLimit;
        } else {
          exceedCpa = group.spend > 0;
        }
      }
      if ((exceedSpend || exceedCpa) && group.all_active) {
        toPause.push(...group.adset_ids);
      }
    });
    if (!toPause.length) {
      pushLog("cpa-rule", { message: "Nenhum conjunto atingiu a regra." });
      return;
    }
    setCpaRuleLoading(true);
    try {
      await updateAdsetStatuses(toPause, "PAUSED");
      pushLog("cpa-rule", {
        message: `Regra aplicada em ${new Set(toPause).size} conjuntos.`,
      });
    } catch (err) {
      pushLog("cpa-rule", err);
    } finally {
      setCpaRuleLoading(false);
    }
  };

  const handleToggleWatch = (group) => {
    if (!group?.key) return;
    setCpaWatch((prev) => {
      const next = { ...prev };
      if (next[group.key]) {
        delete next[group.key];
        saveCpaRules(next);
        return next;
      }
      const cpaValue = Number(String(cpaRule.cpa || "").replace(",", "."));
      const spendValue = Number(String(cpaRule.spend || "").replace(",", "."));
      const hasCpa = Number.isFinite(cpaValue) && cpaValue > 0;
      const hasSpend = Number.isFinite(spendValue) && spendValue > 0;
      next[group.key] = {
        cpa: hasCpa ? cpaValue : null,
        spend: hasSpend ? spendValue : null,
      };
      saveCpaRules(next);
      return next;
    });
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

    const superByCustom = {};
    const contentSet = new Set();
    domainFilteredSuper.forEach((row) => {
      const keyNorm = normalizeKey(row.custom_value);
      if (keyNorm) {
        superByCustom[keyNorm] = row;
        contentSet.add(keyNorm);
      }
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

    const termSet = new Set(
      domainFilteredTerm
        .map((r) => normalizeKey(r.custom_value))
        .filter(Boolean)
    );
    const hasTermData = termSet.size > 0;

    return metaRows.map((row) => {
      const date = row.date_start || row.date || "";
      const join = earningsByDate[date] || {};
      const nameKey = normalizeKey(row.ad_name);
      const adIdKey = normalizeKey(row.ad_id || "");
      const adsetKey = normalizeKey(row.adset_name || "");

      const fromCustom =
        superByCustom[nameKey] ||
        superByCustom[adIdKey] ||
        {};

      const fromKv =
        kvByCustom[nameKey] ||
        kvByCustom[adIdKey] ||
        {};

      const matchedByContent = contentSet.has(nameKey) || contentSet.has(adIdKey);
      const matchedByTerm = termSet.has(adsetKey);
      const hasJoinads = hasTermData
        ? matchedByTerm
        : matchedByContent ||
          Object.keys(fromCustom).length > 0 ||
          Object.keys(fromKv).length > 0;

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
      const dailyBudgetBrl =
        row.adset_daily_budget != null
          ? toNumber(row.adset_daily_budget) / 100
          : null;
      const lifetimeBudgetBrl =
        row.adset_lifetime_budget != null
          ? toNumber(row.adset_lifetime_budget) / 100
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
        adset_daily_budget_brl: dailyBudgetBrl,
        adset_lifetime_budget_brl: lifetimeBudgetBrl,
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
  ]);

  const filteredMeta = useMemo(() => {
    const term = filters.adsetFilter.trim().toLowerCase();
    const base = mergedMeta.filter((row) => row.joinads_matched);
    if (!term) return base;
    return base.filter((row) =>
      (row.adset_name || "").toLowerCase().includes(term)
    );
  }, [mergedMeta, filters.adsetFilter]);

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

  const cpaGroups = useMemo(() => {
    const term = cpaFilter.trim().toLowerCase();
    const map = new Map();
    (mergedMeta || []).forEach((row) => {
      const name = (row.adset_name || "").trim();
      if (!name) return;
      if (term && !name.toLowerCase().includes(term)) return;
      const key = normalizeKey(name);
      const entry =
        map.get(key) || {
          key,
          name,
          adsetIds: new Set(),
          statusById: new Map(),
          spend: 0,
          results: 0,
        };
      const spendValue = toNumber(row.spend_value || row.spend);
      entry.spend += spendValue;
      entry.results += toNumber(row.results_meta || row.results);
      if (row.adset_id) {
        entry.adsetIds.add(row.adset_id);
        if (!entry.statusById.has(row.adset_id)) {
          const status =
            (row.adset_effective_status || row.adset_status || "").toUpperCase();
          entry.statusById.set(row.adset_id, status);
        }
      }
      map.set(key, entry);
    });

    dupNameMap.forEach((entry, key) => {
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: entry.name,
          adsetIds: new Set(entry.ids),
          statusById: new Map(entry.statuses),
          spend: 0,
          results: 0,
        });
      } else {
        const existing = map.get(key);
        entry.ids.forEach((id) => existing.adsetIds.add(id));
        entry.statuses.forEach((status, id) => {
          if (!existing.statusById.has(id)) {
            existing.statusById.set(id, status);
          }
        });
      }
    });

    return Array.from(map.values())
      .map((entry) => {
      const duplicateName =
        entry.adsetIds.size > 1 || dupNameMap.has(entry.key);
      const join = joinadsByTerm.get(entry.key) || {};
      const impressions = toNumber(join.impressions);
      const revenueUsd = toNumber(join.revenue);
      const ecpm =
        impressions > 0 ? (revenueUsd / impressions) * 1000 : null;
      const revenueBrl = brlRate ? revenueUsd * brlRate : null;
      const roas =
        revenueBrl != null && entry.spend > 0 ? revenueBrl / entry.spend : null;
      const cpaValue =
        entry.results > 0 ? entry.spend / entry.results : null;

      const statuses = Array.from(entry.statusById.values());
      const activeCount = statuses.filter((s) => s === "ACTIVE").length;
      const pausedCount = statuses.filter((s) => s === "PAUSED").length;
      const otherCount = Math.max(0, statuses.length - activeCount - pausedCount);
      const allActive = statuses.length > 0 && pausedCount === 0 && otherCount === 0;
      const allPaused = statuses.length > 0 && activeCount === 0 && otherCount === 0;
      const statusLabel = allActive
        ? "Ativo"
        : allPaused
        ? "Pausado"
        : statuses.length
        ? "Misto"
        : "Sem status";
      const statusTone = allActive
        ? "on"
        : allPaused
        ? "off"
        : "warn";

      return {
        key: entry.key,
        name: entry.name,
        adset_ids: Array.from(entry.adsetIds),
        adset_count: entry.adsetIds.size,
        spend: entry.spend,
        results: entry.results,
        cpa_value: cpaValue,
        impressions,
        revenue_usd: revenueUsd,
        ecpm,
        roas,
        status_label: statusLabel,
        status_tone: statusTone,
        all_active: allActive,
        active_count: activeCount,
        paused_count: pausedCount,
        duplicate_name: duplicateName,
      };
    })
      .filter(
        (group) =>
          group.duplicate_name &&
          group.paused_count === 0 &&
          group.active_count >= CPA_MIN_ACTIVE
      )
      .sort((a, b) => (b.spend || 0) - (a.spend || 0));
  }, [mergedMeta, joinadsByTerm, cpaFilter, brlRate, dupNameMap]);

  const cpaTotals = useMemo(() => {
    const totals = {
      groups: cpaGroups.length,
      adsets: 0,
      spend: 0,
      impressions: 0,
      revenue_usd: 0,
    };
    cpaGroups.forEach((group) => {
      totals.adsets += group.adset_count || 0;
      totals.spend += group.spend || 0;
      totals.impressions += group.impressions || 0;
      totals.revenue_usd += group.revenue_usd || 0;
    });
    return totals;
  }, [cpaGroups]);

  useEffect(() => {
    if (!Object.keys(cpaWatch || {}).length) return;
    const evaluate = async () => {
      const toPause = [];
      const watchKeys = Object.keys(cpaWatch || {});
      const watchMap = new Map(watchKeys.map((key) => [key, cpaWatch[key]]));
      cpaGroups.forEach((group) => {
        const rule = watchMap.get(group.key);
        if (!rule) return;
        if (!group.all_active) return;
        const exceedSpend =
          rule.spend != null && group.spend > rule.spend;
        let exceedCpa = false;
        if (rule.cpa != null) {
          if (group.cpa_value != null) {
            exceedCpa = group.cpa_value > rule.cpa;
          } else {
            exceedCpa = group.spend > 0;
          }
        }
        if (exceedSpend || exceedCpa) {
          toPause.push(...group.adset_ids);
        }
      });
      if (toPause.length) {
        await updateAdsetStatuses(toPause, "PAUSED");
        pushLog("cpa-watch", {
          message: `Regra automática aplicada em ${new Set(toPause).size} conjuntos.`,
        });
      }
    };
    const timer = setInterval(() => {
      evaluate().catch((err) => pushLog("cpa-watch", err));
    }, 2 * 60 * 1000);
    return () => clearInterval(timer);
  }, [cpaWatch, cpaGroups]);

  const metaTotals = useMemo(() => {
    const spendBrl = (filteredMeta || []).reduce(
      (acc, row) => acc + toNumber(row.spend_value || row.spend),
      0
    );
    return { spendBrl };
  }, [filteredMeta]);

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem("__cd_cpa_watch__");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setCpaWatch(parsed);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!filters.metaAccountId.trim()) return;
    (async () => {
      try {
        const res = await fetchJson(
          `${API_BASE}/cpa-rules?${new URLSearchParams({
            account_id: filters.metaAccountId.trim(),
          }).toString()}`
        );
        if (res?.data) {
          setCpaWatch(res.data);
        }
        setCpaSyncError("");
      } catch (err) {
        setCpaSyncError(formatError(err));
        pushLog("cpa-rules", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.metaAccountId]);

  useEffect(() => {
    try {
      localStorage.setItem("__cd_cpa_watch__", JSON.stringify(cpaWatch));
    } catch (e) {
      // ignore
    }
  }, [cpaWatch]);

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
          className=${`tab ${activeTab === "duplicar" ? "active" : ""}`}
          onClick=${() => setActiveTab("duplicar")}
        >
          Duplicar
        </button>
        <button
          className=${`tab ${activeTab === "cpa" ? "active" : ""}`}
          onClick=${() => setActiveTab("cpa")}
        >
          CPA Farming
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
        : activeTab === "cpa"
        ? html`
            <${CPAView}
              groups=${cpaGroups}
              totals=${cpaTotals}
              filter=${cpaFilter}
              onFilterChange=${setCpaFilter}
              rule=${cpaRule}
              onRuleChange=${setCpaRule}
              onApplyRule=${handleApplyCpaRule}
              ruleLoading=${cpaRuleLoading}
              onToggleGroup=${handleToggleAdset}
              statusLoading=${adsetStatusLoading}
              watchMap=${cpaWatch}
              onToggleWatch=${handleToggleWatch}
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
              refresh=${tokenRefresh}
              loading=${tokenLoading}
              error=${tokenError}
              onCheck=${handleTokenCheck}
              onRefresh=${handleTokenRefresh}
            />
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

      ${html`<${LogsCard} logs=${logs} onClear=${() => setLogs([])} />`}
    </div>
  `;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(html`<${App} />`);
}
