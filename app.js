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
const BID_STRATEGY_COST_CAP = "COST_CAP";
const BID_STRATEGY_DEFAULT = BID_STRATEGY_WITH_BID;
const APP_VERSION_BUILD = 132;
const APP_VERSION = (APP_VERSION_BUILD / 100).toFixed(2);
const FX_CACHE_KEY = "__dashboard_fx_usd_brl__";
const FX_CACHE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const FX_FETCH_TIMEOUT_MS = 9000;
const OPTIONAL_LTV_DAYS = [4, 5, 6, 7];

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

const fxRateNumber = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
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

const formatFxDate = (value) => {
  if (!value) return "-";
  const [y, m, d] = String(value).split("-");
  if (!y || !m || !d) return String(value);
  return `${d}/${m}/${y}`;
};

const readCachedFxInfo = (requestedDate = "") => {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(FX_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const rate = Number(parsed?.rate);
    const savedAt = Number(parsed?.savedAt);
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(savedAt)) return null;
    if (Date.now() - savedAt > FX_CACHE_MAX_AGE_MS) return null;
    const cachedRequestedDate = parsed.requestedDate || parsed.effectiveDate || "";
    if (requestedDate && cachedRequestedDate !== requestedDate) return null;
    return {
      rate,
      requestedDate: cachedRequestedDate || formatDate(new Date()),
      effectiveDate: parsed.effectiveDate || parsed.requestedDate || formatDate(new Date()),
      source: "cache",
    };
  } catch (e) {
    return null;
  }
};

const parseFxRate = (value) => {
  const rate = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Cotacao USD/BRL indisponivel");
  }
  return rate;
};

const compactDate = (value) => String(value || "").replaceAll("-", "");

const excelXmlEscape = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function downloadExcelWorkbook(fileName, sheets) {
  const cellXml = (value, header = false) => {
    const descriptor = value && typeof value === "object" && !Array.isArray(value) ? value : null;
    const rawValue = descriptor ? descriptor.value : value;
    const numeric = typeof rawValue === "number" && Number.isFinite(rawValue);
    const type = numeric ? "Number" : "String";
    const styleId = header ? "Header" : descriptor?.style || (numeric ? "Number" : "");
    const style = styleId ? ` ss:StyleID="${styleId}"` : "";
    const formula = descriptor?.formula ? ` ss:Formula="${excelXmlEscape(descriptor.formula)}"` : "";
    return `<Cell${style}${formula}><Data ss:Type="${type}">${excelXmlEscape(rawValue)}</Data></Cell>`;
  };
  const worksheetXml = sheets
    .map(({ name, columns, rows }) => {
      const widths = columns.map((column) => {
        const longest = Math.max(
          String(column.label).length,
          ...rows.slice(0, 250).map((row) => {
            const value = row[column.key];
            return String(value && typeof value === "object" ? value.value ?? "" : value ?? "").length;
          })
        );
        return Math.min(320, Math.max(75, longest * 7 + 18));
      });
      return `<Worksheet ss:Name="${excelXmlEscape(name.slice(0, 31))}"><Table>${widths
        .map((width) => `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`)
        .join("")}<Row>${columns.map((column) => cellXml(column.label, true)).join("")}</Row>${rows
        .map((row) => `<Row>${columns.map((column) => cellXml(row[column.key])).join("")}</Row>`)
        .join("")}</Table><AutoFilter x:Range="R1C1:R${Math.max(1, rows.length + 1)}C${columns.length}" xmlns="urn:schemas-microsoft-com:office:excel"/><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet>`;
    })
    .join("");
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel"><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11"/></Style><Style ss:ID="Header"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2563EB" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style><Style ss:ID="Number"><NumberFormat ss:Format="0.00########"/></Style><Style ss:ID="Money"><NumberFormat ss:Format="R$ #,##0.00"/></Style><Style ss:ID="Usd"><NumberFormat ss:Format="$ #,##0.00"/></Style><Style ss:ID="Percent"><NumberFormat ss:Format="0.00%"/></Style><Style ss:ID="Green"><Interior ss:Color="#C6EFCE" ss:Pattern="Solid"/><Font ss:Color="#006100" ss:Bold="1"/></Style><Style ss:ID="Yellow"><Interior ss:Color="#FFEB9C" ss:Pattern="Solid"/><Font ss:Color="#9C6500" ss:Bold="1"/></Style><Style ss:ID="Red"><Interior ss:Color="#FFC7CE" ss:Pattern="Solid"/><Font ss:Color="#9C0006" ss:Bold="1"/></Style><Style ss:ID="Input"><Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/><Font ss:Bold="1"/><NumberFormat ss:Format="0.0000"/></Style></Styles>${worksheetXml}</Workbook>`;
  const blob = new Blob(["\ufeff", xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fetchJsonForFx = async (url, signal) => {
  const response = await fetch(url, { signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Erro ao consultar cotacao (${response.status})`);
    error.data = data;
    throw error;
  }
  return data;
};

const fetchFrankfurterFx = async (requestedDate, today, signal) => {
  const url =
    requestedDate === today
      ? "https://api.frankfurter.dev/v2/rates?base=USD&quotes=BRL"
      : `https://api.frankfurter.dev/v2/rates?base=USD&quotes=BRL&date=${encodeURIComponent(
          requestedDate
        )}`;
  const data = await fetchJsonForFx(url, signal);
  return {
    rate: parseFxRate(data?.rates?.BRL),
    requestedDate,
    effectiveDate: data?.date || requestedDate,
    source: "frankfurter",
  };
};

const fetchAwesomeFx = async (requestedDate, today, signal) => {
  const url =
    requestedDate === today
      ? "https://economia.awesomeapi.com.br/json/last/USD-BRL"
      : `https://economia.awesomeapi.com.br/json/daily/USD-BRL/1?start_date=${compactDate(
          requestedDate
        )}&end_date=${compactDate(requestedDate)}`;
  const data = await fetchJsonForFx(url, signal);
  const row = requestedDate === today ? data?.USDBRL : Array.isArray(data) ? data[0] : null;
  return {
    rate: parseFxRate(row?.bid || row?.ask || row?.high),
    requestedDate,
    effectiveDate: row?.create_date ? String(row.create_date).slice(0, 10) : requestedDate,
    source: "awesomeapi",
  };
};

const fetchOpenExchangeFx = async (requestedDate, today, signal) => {
  const data = await fetchJsonForFx("https://open.er-api.com/v6/latest/USD", signal);
  return {
    rate: parseFxRate(data?.rates?.BRL),
    requestedDate,
    effectiveDate: data?.time_last_update_utc
      ? formatDate(new Date(data.time_last_update_utc))
      : today,
    source: "open-er-api",
  };
};

const fetchFxWithProviders = async (requestedDate, signal) => {
  const today = formatDate(new Date());
  const providers =
    requestedDate === today
      ? [fetchFrankfurterFx, fetchAwesomeFx, fetchOpenExchangeFx]
      : [fetchFrankfurterFx, fetchAwesomeFx];
  const errors = [];
  for (const provider of providers) {
    try {
      return await provider(requestedDate, today, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      errors.push(`${provider.name}: ${formatError(error)}`);
    }
  }
  const error = new Error("Nenhuma API de cotacao USD/BRL respondeu com valor valido");
  error.data = { providers: errors };
  throw error;
};

const saveCachedFxInfo = (info) => {
  if (typeof localStorage === "undefined" || !info?.rate) return;
  try {
    localStorage.setItem(
      FX_CACHE_KEY,
      JSON.stringify({
        rate: info.rate,
        requestedDate: info.requestedDate,
        effectiveDate: info.effectiveDate,
        savedAt: Date.now(),
      })
    );
  } catch (e) {
    // Cache failure should never block the dashboard.
  }
};

const formatFxLabel = (fxInfo, fxStatus) => {
  if (!fxInfo?.rate) {
    return fxStatus === "loading"
      ? "Consultando cotacao USD/BRL..."
      : "USD/BRL indisponivel";
  }
  const sourceLabel =
    fxInfo.source === "awesomeapi"
      ? "AwesomeAPI"
      : fxInfo.source === "open-er-api"
      ? "ExchangeRate"
      : fxInfo.source === "cache"
      ? "cache"
      : "";
  const suffix =
    fxStatus === "loading"
      ? " - atualizando"
      : fxStatus === "stale"
      ? " - ultimo valor"
      : sourceLabel
      ? ` - ${sourceLabel}`
      : "";
  return `USD/BRL ref. ${formatFxDate(fxInfo.effectiveDate)}: R$ ${fxRateNumber.format(
    fxInfo.rate
  )}${suffix}`;
};

const ROLE_TABS = {
  admin: ["dashboard", "metricas_mensagens", "duplicar", "editar", "urls", "meta", "diag", "token", "pages", "configuracoes", "criar"],
  gestor: ["dashboard", "metricas_mensagens", "criar"],
  editor: [],
};

const TAB_LABELS = {
  dashboard: "Dashboard",
  metricas_mensagens: "Metricas Mensagens",
  duplicar: "Duplicar",
  editar: "Editar",
  urls: "URLs com Parametros",
  meta: "Fontes",
  diag: "Diagnostico JoinAds",
  token: "Token Meta",
  pages: "Paginas",
  configuracoes: "Configuracoes",
  criar: "+ Criar campanha",
};

function getSessionName(session) {
  if (!session) return "";
  return session.nome || session.username || session.email || "";
}

function isGestorSession(session) {
  return session?.role === "gestor";
}

function normalizeCommissionPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 100);
}

function performanceUnitLabel(useUserLabel) {
  return useUserLabel ? "GPM" : "eCPM";
}

const defaultDates = () => {
  const today = new Date();
  return {
    startDate: formatDate(today),
    endDate: formatDate(today),
  };
};

function parseIsoDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function listIsoDatesInRange(startDate, endDate, maxDays = 15) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || start > end) return [];
  const dates = [];
  for (let cursor = new Date(start); cursor <= end && dates.length < maxDays; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function daysBetweenIsoDates(startDate, endDate) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function addIsoDays(dateString, days) {
  const date = parseIsoDate(dateString);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value.replace?.(",", ".") || value);
    return Number.isFinite(n) ? n : 0;
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

function calculateMetaCharge(spendValue, rowDate, settings = {}) {
  const reportedSpend = Math.max(0, toNumber(spendValue));
  const ratePercent = Math.min(99.99, Math.max(0, toNumber(settings.metaTaxRatePercent ?? 12.15)));
  const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(String(settings.metaTaxEffectiveDate || ""))
    ? String(settings.metaTaxEffectiveDate)
    : "2026-01-01";
  const date = String(rowDate || "").slice(0, 10);
  const applies = settings.metaTaxEnabled !== false && ratePercent > 0 && (!date || date >= effectiveDate);
  if (!applies) return { mediaSpend: reportedSpend, tax: 0, total: reportedSpend, multiplier: 1 };
  const rate = ratePercent / 100;
  if (settings.metaTaxMode === "included") {
    const mediaSpend = reportedSpend * (1 - rate);
    return { mediaSpend, tax: reportedSpend - mediaSpend, total: reportedSpend, multiplier: 1 };
  }
  const multiplier = rate < 1 ? 1 / (1 - rate) : 1;
  const total = reportedSpend * multiplier;
  return { mediaSpend: reportedSpend, tax: total - reportedSpend, total, multiplier };
}

async function fetchJson(path, options = {}) {
  const {
    cacheTtlMs,
    cacheKey: cacheKeyOverride,
    cacheScope,
    force,
    cacheMode,
    ...fetchOptions
  } = options || {};
  const method = (fetchOptions.method || "GET").toUpperCase();
  const cacheTtl = cacheTtlMs || 0;
  const scope =
    cacheScope ||
    (typeof window !== "undefined" ? window.__cd_session_scope__ || "anon" : "anon");
  const cacheKey = `${scope}:${cacheKeyOverride || path}`;

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
        acc.revenue += toNumber(row.revenue ?? row.earnings ?? 0);
        acc.revenueClient += toNumber(row.revenue_client ?? row.earnings_client ?? 0);
        acc.impressions += toNumber(row.impressions);
        acc.clicks += toNumber(row.clicks);
        const imps = toNumber(row.impressions);
        acc.ecpmWeighted += toNumber(row.ecpm) * imps;
        acc.ecpmClientWeighted += toNumber(row.ecpm_client) * imps;
        acc.activeViewWeighted += toNumber(row.active_view) * imps;
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

function toggleTheme() {
  try {
    const root = document.documentElement;
    let cur = root.getAttribute("data-theme");
    if (!cur) {
      cur = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    const next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("cd-theme", next);
  } catch (e) {
    /* ignore */
  }
}

function ThemeToggle() {
  return html`
    <button
      className="ghost theme-toggle"
      type="button"
      title="Alternar tema claro/escuro"
      aria-label="Alternar tema claro/escuro"
      onClick=${toggleTheme}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2"></circle>
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"></path>
      </svg>
    </button>
  `;
}

function TabButton({ tab, label, activeTab, onSelect, style }) {
  const touchRef = useRef(null);
  const active = activeTab === tab;
  const select = () => onSelect(tab);

  const handleTouchStart = (event) => {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    touchRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      moved: false,
    };
  };

  const handleTouchMove = (event) => {
    const start = touchRef.current;
    const touch = event.touches && event.touches[0];
    if (!start || !touch) return;
    if (
      Math.abs(touch.clientX - start.x) > 12 ||
      Math.abs(touch.clientY - start.y) > 12
    ) {
      start.moved = true;
    }
  };

  const handleTouchEnd = (event) => {
    const start = touchRef.current;
    const touch = event.changedTouches && event.changedTouches[0];
    touchRef.current = null;
    if (!start || !touch || start.moved) return;
    if (
      Math.abs(touch.clientX - start.x) <= 12 &&
      Math.abs(touch.clientY - start.y) <= 12
    ) {
      event.preventDefault();
      select();
    }
  };

  return html`
    <button
      className=${`tab ${active ? "active" : ""}`}
      onClick=${select}
      onTouchStart=${handleTouchStart}
      onTouchMove=${handleTouchMove}
      onTouchEnd=${handleTouchEnd}
      style=${style}
    >
      ${label}
    </button>
  `;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, ms, fallback) {
  let timer = null;
  return new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

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
  DRAFT: "Rascunho",
  RASCUNHO: "Rascunho",
  ATIVADO: "Ativado",
  DESATIVADO: "Desativado",
  ARQUIVADO: "Arquivado",
  EXCLUIDO: "Excluido",
  INDEFINIDO: "Indefinido",
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
  DRAFT: "warn",
  RASCUNHO: "warn",
  ATIVADO: "on",
  DESATIVADO: "off",
  ARQUIVADO: "neutral",
  EXCLUIDO: "neutral",
  INDEFINIDO: "neutral",
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

function Metrics({ totals, usdToBrl, metaSpendBrl, fxDateLabel, usePmLabels = false }) {
  const unitLabel = performanceUnitLabel(usePmLabels);
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
      helper: "Valor líquido informado pela API (após revshare; sem novo desconto)",
      tone: "primary",
    },
    {
      label: "Receita cliente (BRL)",
      value: revenueClientBrl != null ? currencyBRL.format(revenueClientBrl) : "-",
      helper: usdToBrl
        ? `Conversão USD->BRL${fxDateLabel ? ` (${fxDateLabel})` : ""}`
        : "Aguardando cotação",
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
      label: `${unitLabel} cliente`,
      value: currencyUSD.format(totals.ecpmClient || 0),
      helper: usePmLabels ? "Ganho por mil" : "Receita por mil",
    },
    {
      label: `${unitLabel} bruto`,
      value: currencyUSD.format(totals.ecpm || 0),
      helper: usePmLabels ? "Ganho por mil antes do revshare" : "Antes do revshare",
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

function MetricInfo({ text, label = "Explicação da métrica" }) {
  return html`
    <span className="metric-info">
      <button type="button" className="metric-info-button" aria-label=${label}>i</button>
      <span className="metric-info-popup" role="tooltip">${text}</span>
    </span>
  `;
}

function UserCommissionOverview({ totals, usdToBrl, commissionPercent, fxDateLabel }) {
  const percent = normalizeCommissionPercent(commissionPercent);
  const revenueClientUsd = Number(totals?.revenueClient || 0);
  const revenueClientBrl =
    usdToBrl ? revenueClientUsd * Number(usdToBrl || 0) : null;
  const userProfit =
    revenueClientBrl == null
      ? null
      : revenueClientBrl < 0
      ? revenueClientBrl
      : (revenueClientBrl * percent) / 100;
  const ruleLabel =
    revenueClientBrl == null
      ? "Aguardando cotacao"
      : revenueClientBrl < 0
      ? "Receita negativa repassada integralmente"
      : "Calculado sobre o resultado positivo do periodo";

  return html`
    <section className="card wide">
      <div className="card-head">
        <div>
          <span className="eyebrow">Comissao</span>
          <h2 className="section-title">Visao geral</h2>
        </div>
        <span className="chip neutral">Usuario</span>
      </div>
      <div className="metrics-grid">
        <div className="metric-card" data-tone="primary">
          <div className="metric-label">Lucro do usuario</div>
          <div className="metric-value">${userProfit != null ? currencyBRL.format(userProfit) : "-"}</div>
          <div className="metric-helper">${ruleLabel}</div>
        </div>
      </div>
    </section>
  `;
}

function isEngagementObjective(value) {
  const objective = String(value || "").toUpperCase();
  return objective === "OUTCOME_ENGAGEMENT" || objective === "ENGAGEMENT";
}

function hasMessengerSignal(row) {
  const text = [
    row?.campaign_name,
    row?.adset_name,
    row?.ad_name,
    row?.name,
    row?.destination_url,
    row?.url,
    row?.url_tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    text.includes("messenger") ||
    text.includes("mensagem") ||
    text.includes("mensagens") ||
    text.includes("m.me/") ||
    text.includes("messenger.com")
  );
}

function isMessageMetricsRow(row) {
  return isEngagementObjective(row?.objective) || hasMessengerSignal(row);
}

function isMessagingConversationAction(actionType) {
  const type = String(actionType || "").toLowerCase();
  return (
    type.includes("messaging_conversation_started") ||
    type.includes("messaging_conversations_started")
  );
}

function getActionMetric(actions, matcher) {
  if (!Array.isArray(actions)) return null;
  let found = false;
  const total = actions.reduce((acc, action) => {
    if (!matcher(action?.action_type)) return acc;
    found = true;
    return acc + toNumber(action?.value ?? action?.values?.[0]?.value);
  }, 0);
  return found ? total : null;
}

function getMessagingConversationStarts(row) {
  return getActionMetric(row?.actions_count || row?.actions, isMessagingConversationAction);
}

function getMessagingConversationCost(row) {
  const value = getActionMetric(
    row?.cost_per_action_type,
    isMessagingConversationAction
  );
  return value != null ? value : null;
}

function calculateUserCommission(revenueBrl, commissionPercent) {
  const value = Number(revenueBrl);
  if (!Number.isFinite(value)) return null;
  if (value < 0) return value;
  return (value * normalizeCommissionPercent(commissionPercent)) / 100;
}

// Audita a ponte de atribuicao do funil Messenger: src_ (JoinAds) -> adId (Messenlead) -> anuncio Meta.
// Percorre as linhas utm_campaign da JoinAds que comecam com "src_" e classifica a receita de cada
// uma no estagio onde ela "vaza" (nao resolve, anuncio fora do conjunto, conflito com utm_content) ou
// onde efetivamente entra na tabela. Espelha a mesma logica de casamento usada em mergedMeta para que
// o valor "atribuido" reconcilie com o que aparece em Metricas Mensagens.
function buildMessengerAttributionAudit({
  campaignRows = [],
  contentRows = [],
  metaRows = [],
  messenleadSources = [],
  messenleadUnresolved = [],
  domainKey = "",
  brlRate = 0,
}) {
  const inDomain = (row) => {
    if (!domainKey) return true;
    return normalizeKey(row.domain || row.name || "") === domainKey;
  };
  const srcRevenue = (row) =>
    toNumber(row.revenue_client ?? row.earnings_client ?? 0);

  const metaAdIds = new Set(
    (metaRows || []).map((row) => normalizeKey(row.ad_id || "")).filter(Boolean)
  );
  const sourceKeyToAdId = new Map(
    (messenleadSources || [])
      .filter((item) => item?.sourceKey && item?.adId)
      .map((item) => [normalizeKey(item.sourceKey), normalizeKey(item.adId)])
  );
  // Sobreposicao com utm_content e diagnostica. Um src_ valido continua sendo a fonte oficial
  // de atribuicao e nunca deve ser rebaixado apenas porque o mesmo anuncio apareceu em outro relatorio.
  const contentAdIdSet = new Set();
  (contentRows || []).forEach((row) => {
    if (!inDomain(row)) return;
    const adId = normalizeKey(row.custom_value);
    if (adId && metaAdIds.has(adId)) contentAdIdSet.add(adId);
  });

  const bucket = () => ({ keys: new Set(), rows: 0, revenueUsd: 0 });
  const audit = {
    gross: bucket(),
    attributed: bucket(),
    unresolved: bucket(),
    adNotLoaded: bucket(),
    contentConflict: bucket(),
    matchedAdIds: new Set(),
  };

  (campaignRows || []).forEach((row) => {
    if (!inDomain(row)) return;
    const key = normalizeKey(row.custom_value);
    if (!key.startsWith("src_")) return;
    const rev = srcRevenue(row);
    const add = (b) => {
      b.keys.add(key);
      b.rows += 1;
      b.revenueUsd += rev;
    };
    add(audit.gross);

    const adId = sourceKeyToAdId.get(key);
    if (!adId) {
      add(audit.unresolved);
      return;
    }
    if (!metaAdIds.has(adId)) {
      add(audit.adNotLoaded);
      return;
    }
    if (contentAdIdSet.has(adId)) {
      add(audit.contentConflict);
    }
    add(audit.attributed);
    audit.matchedAdIds.add(adId);
  });

  const toBrl = (usd) => (brlRate ? usd * brlRate : 0);
  const pack = (b) => ({
    keys: b.keys.size,
    rows: b.rows,
    revenueUsd: b.revenueUsd,
    revenueBrl: toBrl(b.revenueUsd),
  });
  const grossUsd = audit.gross.revenueUsd;
  const leakedUsd =
    audit.unresolved.revenueUsd +
    audit.adNotLoaded.revenueUsd;

  return {
    domainScoped: !!domainKey,
    gross: pack(audit.gross),
    attributed: pack(audit.attributed),
    unresolved: pack(audit.unresolved),
    adNotLoaded: pack(audit.adNotLoaded),
    contentConflict: pack(audit.contentConflict),
    matchedAds: audit.matchedAdIds.size,
    leaked: { revenueUsd: leakedUsd, revenueBrl: toBrl(leakedUsd) },
    leakPercent: grossUsd > 0 ? (leakedUsd / grossUsd) * 100 : 0,
    apiUnresolvedKeys: Array.isArray(messenleadUnresolved)
      ? messenleadUnresolved.length
      : 0,
  };
}

function MetricasMensagensView({
  rows = [],
  earningsRows = [],
  joinadsDetailRows = [],
  advertiserRows = [],
  advertiserDiagnostics = {},
  messenleadSources = [],
  reportFilters = {},
  usePmLabels = false,
  brlRate = 0,
  metaTaxSettings = {},
  commissionPercent = 0,
  showUserCommission = false,
  diagnostics = {},
  mediumRows = [],
  termRows = [],
  termDailyRows = [],
  leadRows = [],
  ltvMetaRows = [],
  unresolvedLeadIds = [],
  onBudgetUpdate,
  budgetLoading = {},
  onBidUpdate,
  bidLoading = {},
  bidFeedback = {},
  bidHistoryRows = [],
  allowBidControl = false,
  showLtvTable = true,
  ltvExtraDays = [],
  attributionAudit = null,
  pageScoped = false,
}) {
  const label = performanceUnitLabel(usePmLabels);
  const safeRows = Array.isArray(rows) ? rows : [];
  const isTodayOnly =
    reportFilters.startDate === formatDate(new Date()) &&
    reportFilters.endDate === formatDate(new Date());
  const domainTotalsWithoutUtmFilter = (Array.isArray(earningsRows) ? earningsRows : []).reduce(
    (acc, row) => {
      acc.revenueUsd += toNumber(row.revenue_client ?? row.earnings_client ?? 0);
      acc.grossRevenueUsd += toNumber(row.revenue ?? row.earnings ?? 0);
      acc.impressions += toNumber(row.impressions);
      acc.clicks += toNumber(row.clicks);
      return acc;
    },
    { revenueUsd: 0, grossRevenueUsd: 0, impressions: 0, clicks: 0 }
  );
  const earningsCacheDiagnostics = diagnostics?.joinadsSuperFilterDiagnostics?.earnings?.cache || {};
  const earningsUsedSameDayFallback = (earningsCacheDiagnostics.sameDayFallbackDays || []).includes(
    reportFilters.endDate
  );
  const selectedLtvExtraDays = OPTIONAL_LTV_DAYS.filter((day) =>
    (Array.isArray(ltvExtraDays) ? ltvExtraDays : []).map(Number).includes(day)
  );
  const visibleLtvDays = [0, 1, 2, 3, ...selectedLtvExtraDays];
  const maxVisibleLtvDay = visibleLtvDays[visibleLtvDays.length - 1] || 3;
  const ltvWindow = diagnostics?.messenleadLeadDiagnostics?.ltvWindow || {};
  const ltvWindowStart = ltvWindow.startDate || "";
  const ltvWindowEnd = ltvWindow.endDate || "";
  const [messageBudgetInputs, setMessageBudgetInputs] = useState({});
  const [messageBidInputs, setMessageBidInputs] = useState({});
  const [messageBidStrategies, setMessageBidStrategies] = useState({});
  const exportMessagesExcel = () => {
    const dimensionKey = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("pt-BR");
    const countryAliases = [
      ["República Dominicana", ["republica dominicana", "dominican republic"]],
      ["Estados Unidos", ["estados unidos", "united states", "eua", "usa"]],
      ["Costa Rica", ["costa rica"]],
      ["Porto Rico", ["porto rico", "puerto rico"]],
      ["El Salvador", ["el salvador"]],
      ["Reino Unido", ["reino unido", "united kingdom", "uk"]],
      ["México", ["mexico"]], ["Argentina", ["argentina"]], ["Brasil", ["brasil", "brazil"]],
      ["Espanha", ["espanha", "spain"]], ["Chile", ["chile"]], ["Colômbia", ["colombia"]],
      ["Peru", ["peru"]], ["Portugal", ["portugal"]], ["Equador", ["equador", "ecuador"]],
      ["Guatemala", ["guatemala"]], ["Honduras", ["honduras"]], ["Nicarágua", ["nicaragua"]],
      ["Panamá", ["panama"]], ["Paraguai", ["paraguai", "paraguay"]], ["Uruguai", ["uruguai", "uruguay"]],
      ["Bolívia", ["bolivia"]], ["Venezuela", ["venezuela"]],
    ];
    const inferDimensions = (name) => {
      const text = String(name || "").replace(/\s*\|\s*/g, " | ").trim();
      const normalized = ` ${dimensionKey(text).replace(/[^a-z0-9]+/g, " ")} `;
      const countryEntry = countryAliases.find(([, aliases]) => aliases.some((alias) => normalized.includes(` ${alias} `)));
      const country = countryEntry?.[0] || "Não identificado — revisar";
      const parts = text.split("|").map((part) => part.trim()).filter(Boolean);
      const countryKeys = new Set(countryAliases.flatMap(([, aliases]) => aliases));
      const accountCandidate = parts.find((part) => {
        const key = dimensionKey(part).replace(/[^a-z0-9]+/g, " ").trim();
        return key && !countryKeys.has(key) && !/^(facebook|instagram|meta|messenger|fb|ig)$/.test(key);
      });
      const account = accountCandidate || "Não identificada — revisar";
      const platform = normalized.includes(" instagram ") || normalized.includes(" ig ") ? "Instagram" : normalized.includes(" facebook ") || normalized.includes(" fb ") ? "Facebook" : "Meta/Messenger";
      return {
        normalized_name: text,
        country,
        country_key: dimensionKey(country),
        account,
        account_key: dimensionKey(account),
        platform,
        platform_key: dimensionKey(platform),
      };
    };
    const resolveAdUnit = (row) => {
      const direct = row.ad_unit || row.adUnit || row.AD_UNIT || row.ad_unit_name || row.AD_UNIT_NAME || row.block || row.placement;
      if (direct) return String(direct);
      const searchable = Object.values(row || {}).filter((value) => typeof value === "string").join(" ");
      const match = searchable.match(/(?:^|[_\s-])(Anchor|Content\s*[1-9]|Interstitial|Rewards?)(?:[_\s-]|$)/i);
      return match ? match[1].replace(/\s+/g, "") : "Sem bloco informado";
    };
    const sourceToAd = new Map(
      (Array.isArray(messenleadSources) ? messenleadSources : [])
        .filter((item) => item?.sourceKey && item?.adId)
        .map((item) => [normalizeKey(item.sourceKey), String(item.adId)])
    );
    const metaByAd = new Map();
    safeRows.filter(isMessageMetricsRow).forEach((row) => {
      const adId = String(row.ad_id || "");
      const key = normalizeKey(adId || row.ad_name || "sem_anuncio");
      const item = metaByAd.get(key) || {
        ad_id: adId,
        ad_name: row.ad_name || "-",
        adset_id: row.adset_id || "",
        adset_name: row.adset_name || "-",
        campaign_id: row.campaign_id || "",
        campaign_name: row.campaign_name || "-",
        meta_impressions: 0,
        meta_clicks: 0,
        conversations: 0,
        spend_brl: 0,
        media_spend_brl: 0,
        meta_tax_brl: 0,
        reach: 0,
        frequency_weighted: 0,
        frequency_weight: 0,
        meta_cpm_weighted: 0,
        has_period_reach: false,
        has_period_frequency: false,
      };
      item.meta_impressions += toNumber(row.meta_impressions_value ?? row.impressions);
      item.meta_clicks += toNumber(row.meta_clicks_value ?? row.clicks);
      item.conversations += toNumber(row.messaging_conversations_started);
      item.spend_brl += toNumber(row.spend_value ?? row.spend);
      item.media_spend_brl += toNumber(row.spend_media_value ?? row.spend_value ?? row.spend);
      item.meta_tax_brl += toNumber(row.meta_tax_value);
      if (row.period_reach != null) {
        item.reach = Math.max(item.reach, toNumber(row.period_reach));
        item.has_period_reach = true;
      } else if (!item.has_period_reach) {
        item.reach += toNumber(row.reach);
      }
      if (row.period_frequency != null) {
        item.frequency_weighted = toNumber(row.period_frequency);
        item.frequency_weight = 1;
        item.has_period_frequency = true;
      } else if (!item.has_period_frequency) {
        item.frequency_weighted += toNumber(row.frequency) * toNumber(row.impressions);
        item.frequency_weight += toNumber(row.impressions);
      }
      item.meta_cpm_weighted += toNumber(row.cpm) * toNumber(row.impressions);
      metaByAd.set(key, item);
    });

    const detail = (Array.isArray(joinadsDetailRows) ? joinadsDetailRows : [])
      .filter((row) => normalizeKey(row.custon_value ?? row.custom_value).startsWith("src_"))
      .map((row) => {
        const source = String(row.custon_value ?? row.custom_value ?? "");
        const adId = sourceToAd.get(normalizeKey(source)) || "";
        const meta = metaByAd.get(normalizeKey(adId)) || {};
        return {
          date: row.date || "",
          source,
          status: adId ? (meta.ad_name ? "Atribuido" : "Anuncio fora do recorte Meta") : "Sem resolucao Messenlead",
          ad_unit: resolveAdUnit(row),
          joinads_country: row.country || row.COUNTRY || "Nao informado",
          domain: row.name || row.domain || reportFilters.domain || "",
          ad_id: adId,
          ad_name: meta.ad_name || "",
          adset_name: meta.adset_name || "",
          campaign_name: meta.campaign_name || "",
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          earnings_usd: toNumber(row.earnings ?? row.revenue),
          earnings_client_usd: toNumber(row.earnings_client ?? row.revenue_client),
          ecpm_client_usd: toNumber(row.ecpm_client ?? 0),
          ctr_percent: toNumber(row.ctr),
          active_view_percent: toNumber(row.active_view_viewable ?? row.active_view),
          requests: toNumber(row.requests_served ?? row.ad_requests ?? row.elegible_ad_requests ?? row.eligible_ad_requests),
        };
      });

    const joinByAd = new Map();
    detail.forEach((row) => {
      const key = normalizeKey(row.ad_id || row.source);
      const item = joinByAd.get(key) || {
        sources: new Set(), blocks: new Set(), countries: new Set(), impressions: 0, clicks: 0,
        earnings_usd: 0, earnings_client_usd: 0,
      };
      item.sources.add(row.source);
      item.blocks.add(row.ad_unit);
      if (row.joinads_country) item.countries.add(row.joinads_country);
      item.impressions += row.impressions;
      item.clicks += row.clicks;
      item.earnings_usd += row.earnings_usd;
      item.earnings_client_usd += row.earnings_client_usd;
      joinByAd.set(key, item);
    });
    const crossing = Array.from(metaByAd.values()).map((meta) => {
      const join = joinByAd.get(normalizeKey(meta.ad_id)) || {};
      const revenueBrl = toNumber(join.earnings_client_usd) * toNumber(brlRate);
      const roasValue = meta.spend_brl > 0 ? revenueBrl / meta.spend_brl : 0;
      const statusValue = roasValue >= 1.45 ? "Escalar" : roasValue >= 1 ? "Observar" : "Cortar";
      const dimensions = inferDimensions(meta.campaign_name);
      return {
        ...meta,
        ...dimensions,
        sources: join.sources ? Array.from(join.sources).join(" | ") : "Sem atribuicao JoinAds",
        ad_units: join.blocks ? Array.from(join.blocks).sort().join(" | ") : "",
        joinads_countries: join.countries ? Array.from(join.countries).sort().join(" | ") : "",
        frequency: meta.frequency_weight > 0 ? meta.frequency_weighted / meta.frequency_weight : 0,
        meta_cpm: meta.meta_impressions > 0 ? meta.meta_cpm_weighted / meta.meta_impressions : 0,
        conversations_reach_percent: meta.reach > 0 ? meta.conversations / meta.reach : 0,
        joinads_impressions: toNumber(join.impressions),
        joinads_clicks: toNumber(join.clicks),
        revenue_client_usd: toNumber(join.earnings_client_usd),
        exchange_rate: { value: toNumber(brlRate), formula: "=Parametros!R2C2", style: "Input" },
        revenue_client_brl: { value: revenueBrl, formula: "=RC[-2]*RC[-1]", style: "Money" },
        cpa_brl: { value: meta.conversations > 0 ? meta.spend_brl / meta.conversations : 0, formula: "=IF(RC[-7]>0,RC[-6]/RC[-7],0)", style: "Money" },
        revenue_per_conversation_brl: { value: meta.conversations > 0 ? revenueBrl / meta.conversations : 0, formula: "=IF(RC[-8]>0,RC[-2]/RC[-8],0)", style: "Money" },
        impressions_per_conversation: { value: meta.conversations > 0 ? toNumber(join.impressions) / meta.conversations : 0, formula: "=IF(RC[-9]>0,RC[-7]/RC[-9],0)" },
        effective_ecpm_usd: { value: toNumber(join.impressions) > 0 ? toNumber(join.earnings_client_usd) / toNumber(join.impressions) * 1000 : 0, formula: "=IF(RC[-8]>0,RC[-6]/RC[-8]*1000,0)", style: "Usd" },
        joinads_ctr_percent: { value: toNumber(join.impressions) > 0 ? toNumber(join.clicks) / toNumber(join.impressions) * 100 : 0, formula: "=IF(RC[-9]>0,RC[-8]/RC[-9]*100,0)" },
        roas: { value: roasValue, formula: "=IF(RC[-11]>0,RC[-6]/RC[-11],0)", style: roasValue >= 1.45 ? "Green" : roasValue >= 1 ? "Yellow" : "Red" },
        profit_brl: { value: revenueBrl - meta.spend_brl, formula: "=RC[-7]-RC[-12]", style: revenueBrl - meta.spend_brl >= 0 ? "Green" : "Red" },
        margin_percent: { value: revenueBrl > 0 ? (revenueBrl - meta.spend_brl) / revenueBrl * 100 : 0, formula: "=IF(RC[-8]>0,RC[-1]/RC[-8]*100,0)" },
        status: { value: statusValue, formula: '=IF(RC[-3]>=Parametros!R3C2+0.2,"Escalar",IF(RC[-3]>=1,"Observar","Cortar"))', style: statusValue === "Escalar" ? "Green" : statusValue === "Observar" ? "Yellow" : "Red" },
        delivery_relevance: meta.spend_brl < 1 || meta.meta_impressions < 100 ? "Entrega residual/insuficiente" : "Entrega relevante",
      };
    });
    const blockMap = new Map();
    detail.forEach((row) => {
      const key = row.ad_unit || "Sem bloco informado";
      const item = blockMap.get(key) || { ad_unit: key, sources: new Set(), ads: new Set(), impressions: 0, clicks: 0, requests: 0, earnings_client_usd: 0 };
      item.sources.add(row.source);
      if (row.ad_name) item.ads.add(row.ad_name);
      item.impressions += row.impressions;
      item.clicks += row.clicks;
      item.requests += row.requests;
      item.earnings_client_usd += row.earnings_client_usd;
      blockMap.set(key, item);
    });
    const totalRevenue = detail.reduce((sum, row) => sum + row.earnings_client_usd, 0);
    const blocks = Array.from(blockMap.values()).map((item) => ({
      ...item, sources: Array.from(item.sources).join(" | "), ads: Array.from(item.ads).join(" | "),
      revenue_client_brl: item.earnings_client_usd * toNumber(brlRate),
      revenue_share_percent: totalRevenue > 0 ? item.earnings_client_usd / totalRevenue * 100 : 0,
      ecpm_client_usd: item.impressions > 0 ? (item.earnings_client_usd / item.impressions) * 1000 : 0,
      fill_rate_percent: item.requests > 0 ? item.impressions / item.requests * 100 : null,
    })).filter((item) => item.ad_unit !== "Sem bloco informado");
    const pending = detail.filter((row) => row.status !== "Atribuido");
    const numericValue = (value) => toNumber(value && typeof value === "object" ? value.value : value);
    const buildSummary = (groupKey, groupLabel) => {
      const map = new Map();
      crossing.forEach((row) => {
        const displayValue = row[groupKey] || "Não identificado — revisar";
        const key = row[`${groupKey}_key`] || dimensionKey(displayValue);
        const item = map.get(key) || { group: displayValue, meta_impressions: 0, conversations: 0, spend_brl: 0, media_spend_brl: 0, meta_tax_brl: 0, joinads_impressions: 0, joinads_clicks: 0, revenue_client_usd: 0 };
        ["meta_impressions", "conversations", "spend_brl", "media_spend_brl", "meta_tax_brl", "joinads_impressions", "joinads_clicks", "revenue_client_usd"].forEach((field) => { item[field] += numericValue(row[field]); });
        map.set(key, item);
      });
      const rows = Array.from(map.values());
      const total = rows.reduce((acc, row) => {
        ["meta_impressions", "conversations", "spend_brl", "media_spend_brl", "meta_tax_brl", "joinads_impressions", "joinads_clicks", "revenue_client_usd"].forEach((field) => { acc[field] += row[field]; });
        return acc;
      }, { group: "TOTAL GERAL", meta_impressions: 0, conversations: 0, spend_brl: 0, media_spend_brl: 0, meta_tax_brl: 0, joinads_impressions: 0, joinads_clicks: 0, revenue_client_usd: 0 });
      return [...rows, total].map((row) => {
        const revenueBrl = row.revenue_client_usd * toNumber(brlRate);
        return {
          ...row,
          group_label: groupLabel,
          revenue_client_brl: revenueBrl,
          cpa_brl: row.conversations > 0 ? row.spend_brl / row.conversations : 0,
          revenue_per_conversation_brl: row.conversations > 0 ? revenueBrl / row.conversations : 0,
          impressions_per_conversation: row.conversations > 0 ? row.joinads_impressions / row.conversations : 0,
          effective_ecpm_usd: row.joinads_impressions > 0 ? row.revenue_client_usd / row.joinads_impressions * 1000 : 0,
          joinads_ctr_percent: row.joinads_impressions > 0 ? row.joinads_clicks / row.joinads_impressions * 100 : 0,
          roas: row.spend_brl > 0 ? revenueBrl / row.spend_brl : 0,
          profit_brl: revenueBrl - row.spend_brl,
          margin_percent: revenueBrl > 0 ? (revenueBrl - row.spend_brl) / revenueBrl * 100 : 0,
        };
      });
    };
    const withSummaryFormulas = (rows) => rows.map((row) => ({
      ...row,
      revenue_client_brl: { value: row.revenue_client_brl || 0, formula: "=RC[-1]*Parametros!R2C2", style: "Money" },
      cpa_brl: { value: row.cpa_brl || 0, formula: "=IF(RC[-6]>0,RC[-5]/RC[-6],0)", style: "Money" },
      revenue_per_conversation_brl: { value: row.revenue_per_conversation_brl || 0, formula: "=IF(RC[-7]>0,RC[-2]/RC[-7],0)", style: "Money" },
      impressions_per_conversation: { value: row.impressions_per_conversation || 0, formula: "=IF(RC[-8]>0,RC[-6]/RC[-8],0)" },
      effective_ecpm_usd: { value: row.effective_ecpm_usd || 0, formula: "=IF(RC[-7]>0,RC[-5]/RC[-7]*1000,0)", style: "Usd" },
      joinads_ctr_percent: { value: row.joinads_ctr_percent || 0, formula: "=IF(RC[-8]>0,RC[-7]/RC[-8]*100,0)" },
      roas: { value: row.roas || 0, formula: "=IF(RC[-10]>0,RC[-6]/RC[-10],0)" },
      profit_brl: { value: row.profit_brl || 0, formula: "=RC[-7]-RC[-11]", style: "Money" },
      margin_percent: { value: row.margin_percent || 0, formula: "=IF(RC[-8]>0,RC[-1]/RC[-8]*100,0)" },
    }));
    const countrySummary = withSummaryFormulas(buildSummary("country", "Pais"));
    const accountSummary = withSummaryFormulas(buildSummary("account", "Conta"));
    const rawBlockReport = [...blocks];
    if (blocks.length) {
      rawBlockReport.push(blocks.reduce((acc, row) => {
        acc.earnings_client_usd += row.earnings_client_usd;
        acc.impressions += row.impressions;
        acc.requests += row.requests;
        acc.clicks += row.clicks;
        return acc;
      }, { ad_unit: "TOTAL GERAL", earnings_client_usd: 0, impressions: 0, requests: 0, clicks: 0 }));
    }
    const blockReport = rawBlockReport.map((row) => ({
      ...row,
      revenue_client_brl: { value: row.earnings_client_usd * toNumber(brlRate), formula: "=RC[-1]*Parametros!R2C2", style: "Money" },
      revenue_share_percent: { value: totalRevenue > 0 ? row.earnings_client_usd / totalRevenue * 100 : 0, formula: "=IF(Parametros!R5C2>0,RC[-2]/Parametros!R5C2*100,0)" },
      fill_rate_percent: { value: row.requests > 0 ? row.impressions / row.requests * 100 : 0, formula: "=IF(RC[-1]>0,RC[-2]/RC[-1]*100,0)" },
      ecpm_client_usd: { value: row.impressions > 0 ? row.earnings_client_usd / row.impressions * 1000 : 0, formula: "=IF(RC[-4]>0,RC[-7]/RC[-4]*1000,0)", style: "Usd" },
      ctr_percent: { value: row.impressions > 0 ? row.clicks / row.impressions * 100 : 0, formula: "=IF(RC[-5]>0,RC[-2]/RC[-5]*100,0)" },
    }));
    const countryAccountMap = new Map();
    crossing.forEach((row) => {
      const key = `${row.country_key || dimensionKey(row.country)}|||${row.account_key || dimensionKey(row.account)}`;
      const item = countryAccountMap.get(key) || { country: row.country, account: row.account, conversations: 0, spend_brl: 0, media_spend_brl: 0, meta_tax_brl: 0, joinads_impressions: 0, revenue_client_usd: 0 };
      item.conversations += numericValue(row.conversations);
      item.spend_brl += numericValue(row.spend_brl);
      item.media_spend_brl += numericValue(row.media_spend_brl);
      item.meta_tax_brl += numericValue(row.meta_tax_brl);
      item.joinads_impressions += numericValue(row.joinads_impressions);
      item.revenue_client_usd += numericValue(row.revenue_client_usd);
      countryAccountMap.set(key, item);
    });
    const countryAccountSummary = Array.from(countryAccountMap.values()).map((row) => {
      const revenueBrl = row.revenue_client_usd * toNumber(brlRate);
      return {
        ...row,
        revenue_client_brl: { value: revenueBrl, formula: "=RC[-1]*Parametros!R2C2", style: "Money" },
        cpa_brl: { value: row.conversations > 0 ? row.spend_brl / row.conversations : 0, formula: "=IF(RC[-5]>0,RC[-4]/RC[-5],0)", style: "Money" },
        impressions_per_conversation: { value: row.conversations > 0 ? row.joinads_impressions / row.conversations : 0, formula: "=IF(RC[-6]>0,RC[-4]/RC[-6],0)" },
        revenue_per_conversation_brl: { value: row.conversations > 0 ? revenueBrl / row.conversations : 0, formula: "=IF(RC[-7]>0,RC[-3]/RC[-7],0)", style: "Money" },
        roas: { value: row.spend_brl > 0 ? revenueBrl / row.spend_brl : 0, formula: "=IF(RC[-7]>0,RC[-4]/RC[-7],0)" },
      };
    }).sort((a, b) => String(a.country).localeCompare(String(b.country)) || String(a.account).localeCompare(String(b.account)));
    const dailyMap = new Map();
    safeRows.filter(isMessageMetricsRow).forEach((row) => {
      const date = row.date_start || row.date || "Sem data";
      const item = dailyMap.get(date) || { date, spend_brl: 0, media_spend_brl: 0, meta_tax_brl: 0, conversations: 0, meta_impressions: 0, joinads_impressions: 0, revenue_client_usd: 0 };
      item.spend_brl += toNumber(row.spend_value ?? row.spend);
      item.media_spend_brl += toNumber(row.spend_media_value ?? row.spend_value ?? row.spend);
      item.meta_tax_brl += toNumber(row.meta_tax_value);
      item.conversations += toNumber(row.messaging_conversations_started);
      item.meta_impressions += toNumber(row.meta_impressions_value ?? row.impressions);
      dailyMap.set(date, item);
    });
    detail.forEach((row) => {
      const item = dailyMap.get(row.date) || { date: row.date || "Sem data", spend_brl: 0, media_spend_brl: 0, meta_tax_brl: 0, conversations: 0, meta_impressions: 0, joinads_impressions: 0, revenue_client_usd: 0 };
      item.joinads_impressions += row.impressions;
      item.revenue_client_usd += row.earnings_client_usd;
      dailyMap.set(item.date, item);
    });
    const daily = Array.from(dailyMap.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))).map((row) => {
      const revenueBrl = row.revenue_client_usd * toNumber(brlRate);
      return { ...row,
        revenue_client_brl: { value: revenueBrl, formula: "=RC[-1]*Parametros!R2C2", style: "Money" },
        impressions_per_conversation: { value: row.conversations > 0 ? row.joinads_impressions / row.conversations : 0, formula: "=IF(RC[-5]>0,RC[-3]/RC[-5],0)" },
        roas: { value: row.spend_brl > 0 ? revenueBrl / row.spend_brl : 0, formula: "=IF(RC[-5]>0,RC[-2]/RC[-5],0)" },
      };
    });
    const attributedDetail = detail.filter((row) => row.status === "Atribuido");
    const attributedRevenue = attributedDetail.reduce((sum, row) => sum + row.earnings_client_usd, 0);
    const attributedImpressions = attributedDetail.reduce((sum, row) => sum + row.impressions, 0);
    const originMap = new Map();
    (Array.isArray(mediumRows) ? mediumRows : []).forEach((row) => {
      const origin = String(row.custom_value || row.custon_value || "Sem utm_medium").trim() || "Sem utm_medium";
      const key = normalizeKey(origin) || "sem_utm_medium";
      const item = originMap.get(key) || {
        origin,
        domain: row.domain || row.name || reportFilters.domain || "",
        impressions: 0,
        clicks: 0,
        revenue_client_usd: 0,
      };
      item.impressions += toNumber(row.impressions);
      item.clicks += toNumber(row.clicks);
      item.revenue_client_usd += toNumber(row.revenue_client ?? row.earnings_client ?? 0);
      originMap.set(key, item);
    });
    if (!originMap.has("organic")) {
      originMap.set("organic", { origin: "organic", domain: reportFilters.domain || "", impressions: 0, clicks: 0, revenue_client_usd: 0 });
    }
    const rawOriginRows = Array.from(originMap.values());
    const originTotals = rawOriginRows.reduce((acc, row) => {
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      acc.revenue_client_usd += row.revenue_client_usd;
      return acc;
    }, { origin: "TOTAL GERAL", domain: reportFilters.domain || "", impressions: 0, clicks: 0, revenue_client_usd: 0 });
    const originRows = [...rawOriginRows, originTotals].map((row) => ({
      ...row,
      impression_share_percent: originTotals.impressions > 0 ? row.impressions / originTotals.impressions * 100 : 0,
      ctr_percent: row.impressions > 0 ? row.clicks / row.impressions * 100 : 0,
      ecpm_client_usd: row.impressions > 0 ? row.revenue_client_usd / row.impressions * 1000 : 0,
      revenue_client_brl: row.revenue_client_usd * toNumber(brlRate),
    }));
    const organicExportRow = originRows.find((row) => normalizeKey(row.origin) === "organic");
    const messengerExportRow = originRows.find((row) => normalizeKey(row.origin) === "messenger") || {};
    const campaignRawRows = Array.isArray(joinadsDetailRows) ? joinadsDetailRows : [];
    const aggregateCampaignRows = (predicate) => campaignRawRows.reduce((acc, row) => {
      const value = normalizeKey(row.custon_value ?? row.custom_value);
      if (!predicate(value, row)) return acc;
      acc.impressions += toNumber(row.impressions);
      acc.clicks += toNumber(row.clicks);
      acc.revenue_client_usd += toNumber(row.earnings_client ?? row.revenue_client ?? 0);
      return acc;
    }, { impressions: 0, clicks: 0, revenue_client_usd: 0 });
    const srcCampaignTotal = aggregateCampaignRows((value) => value.startsWith("src_"));
    const evoOrganicTotal = aggregateCampaignRows((value) => value === "organic" || value.startsWith("organic_"));
    const otherCampaignTotal = aggregateCampaignRows((value) => Boolean(value) && !value.startsWith("src_") && value !== "organic" && !value.startsWith("organic_"));
    const messengerTotal = {
      impressions: toNumber(messengerExportRow.impressions),
      clicks: toNumber(messengerExportRow.clicks),
      revenue_client_usd: toNumber(messengerExportRow.revenue_client_usd),
    };
    const messengerUnclassified = {
      impressions: Math.max(0, messengerTotal.impressions - srcCampaignTotal.impressions - evoOrganicTotal.impressions - otherCampaignTotal.impressions),
      clicks: Math.max(0, messengerTotal.clicks - srcCampaignTotal.clicks - evoOrganicTotal.clicks - otherCampaignTotal.clicks),
      revenue_client_usd: Math.max(0, messengerTotal.revenue_client_usd - srcCampaignTotal.revenue_client_usd - evoOrganicTotal.revenue_client_usd - otherCampaignTotal.revenue_client_usd),
    };
    const paidCandidateRevenue = Math.max(attributedRevenue, messengerTotal.revenue_client_usd - evoOrganicTotal.revenue_client_usd);
    const paidCandidateImpressions = Math.max(attributedImpressions, messengerTotal.impressions - evoOrganicTotal.impressions);
    const revenueCoverage = paidCandidateRevenue > 0 ? attributedRevenue / paidCandidateRevenue : 0;
    const impressionCoverage = paidCandidateImpressions > 0 ? attributedImpressions / paidCandidateImpressions : 0;
    const totalMetaSpend = crossing.reduce((sum, row) => sum + toNumber(row.spend_brl), 0);
    const totalMediaSpend = crossing.reduce((sum, row) => sum + toNumber(row.media_spend_brl), 0);
    const totalMetaTax = crossing.reduce((sum, row) => sum + toNumber(row.meta_tax_brl), 0);
    const trackedRoas = totalMetaSpend > 0 ? attributedRevenue * toNumber(brlRate) / totalMetaSpend : 0;
    const economicRoas = totalMetaSpend > 0 ? paidCandidateRevenue * toNumber(brlRate) / totalMetaSpend : 0;
    const reconciliationBase = [
      { category: "Messenger pago atribuido (src_)", ...{ impressions: attributedImpressions, revenue_client_usd: attributedRevenue }, spend_brl: totalMetaSpend, media_spend_brl: totalMediaSpend, meta_tax_brl: totalMetaTax, treatment: "Entra no ROAS atribuido; custo Meta com impostos." },
      { category: "Messenger src_ sem campanha Meta", impressions: Math.max(0, srcCampaignTotal.impressions - attributedImpressions), revenue_client_usd: Math.max(0, srcCampaignTotal.revenue_client_usd - attributedRevenue), spend_brl: 0, media_spend_brl: 0, meta_tax_brl: 0, treatment: "Pendente de resolucao; nenhum custo estimado." },
      { category: "Messenger organico do Evo (organic_)", ...evoOrganicTotal, spend_brl: 0, media_spend_brl: 0, meta_tax_brl: 0, treatment: "Organico: sem gasto e sem imposto." },
      { category: "Outras campanhas UTM", ...otherCampaignTotal, spend_brl: 0, media_spend_brl: 0, meta_tax_brl: 0, treatment: "Separado para revisao; nao entra automaticamente no ROAS." },
      { category: "Messenger sem classificacao", ...messengerUnclassified, spend_brl: 0, media_spend_brl: 0, meta_tax_brl: 0, treatment: "Diferenca entre utm_medium e utm_campaign; investigar." },
      { category: "Organico externo (utm_medium=organic)", impressions: toNumber(organicExportRow?.impressions), clicks: toNumber(organicExportRow?.clicks), revenue_client_usd: toNumber(organicExportRow?.revenue_client_usd), spend_brl: 0, media_spend_brl: 0, meta_tax_brl: 0, treatment: "Organico: sem gasto e sem imposto." },
    ];
    const reconciliationRows = reconciliationBase.map((row) => ({
      ...row,
      revenue_client_brl: row.revenue_client_usd * toNumber(brlRate),
      roas: row.spend_brl > 0 ? row.revenue_client_usd * toNumber(brlRate) / row.spend_brl : null,
    }));
    const metaColumns = [
      ["normalized_name", "Campanha Meta (padronizada)"], ["account", "Conta"], ["country", "Pais"], ["platform", "Plataforma"],
      ["campaign_id", "ID campanha"], ["adset_name", "Conjunto Meta"], ["adset_id", "ID conjunto"], ["ad_name", "Anuncio Meta"], ["ad_id", "ID anuncio"],
      ["sources", "Atribuicao Messenlead (src_)"], ["ad_units", "Blocos JoinAds (ad_unit)"], ["joinads_countries", "Paises JoinAds"],
      ["meta_impressions", "Impressoes Meta"], ["meta_clicks", "Cliques Meta"], ["reach", "Alcance Meta"], ["frequency", "Frequencia Meta"], ["meta_cpm", "CPM Meta BRL"],
      ["conversations_reach_percent", "Conversas / alcance"], ["conversations", "Conversas iniciadas"], ["spend_brl", "Gasto Meta total BRL"],
      ["joinads_impressions", "Impressoes JoinAds"], ["joinads_clicks", "Cliques JoinAds"], ["revenue_client_usd", "Receita cliente USD"],
      ["exchange_rate", "Cambio BRL/USD"], ["revenue_client_brl", "Receita cliente BRL"], ["cpa_brl", "CPA BRL"],
      ["revenue_per_conversation_brl", "Receita por conversa BRL"], ["impressions_per_conversation", "Impressoes por conversa"],
      ["effective_ecpm_usd", "eCPM efetivo USD"], ["joinads_ctr_percent", "CTR JoinAds (%)"], ["roas", "ROAS"],
      ["profit_brl", "Lucro operacional BRL"], ["margin_percent", "Margem (%)"], ["status", "Status"],
      ["delivery_relevance", "Qualidade da amostra"],
      ["media_spend_brl", "Gasto de midia Meta BRL"], ["meta_tax_brl", "Impostos Meta BRL"],
    ].map(([key, label]) => ({ key, label }));
    const detailColumns = [
      ["date", "Data"], ["source", "Atribuicao Messenlead (src_)"], ["status", "Status do cruzamento"], ["ad_unit", "Bloco JoinAds (ad_unit)"], ["joinads_country", "Pais JoinAds"],
      ["domain", "Dominio"], ["campaign_name", "Campanha Meta"], ["adset_name", "Conjunto Meta"], ["ad_name", "Anuncio Meta"], ["ad_id", "ID anuncio Meta"],
      ["impressions", "Impressoes JoinAds"], ["clicks", "Cliques JoinAds"], ["earnings_usd", "Receita bruta USD"],
      ["earnings_client_usd", "Receita cliente USD"], ["ecpm_client_usd", "eCPM cliente USD"], ["ctr_percent", "CTR (%)"], ["active_view_percent", "Active View (%)"],
    ].map(([key, label]) => ({ key, label }));
    const blockColumns = [
      ["ad_unit", "Bloco JoinAds (ad_unit)"], ["earnings_client_usd", "Receita cliente USD"], ["revenue_client_brl", "Receita cliente BRL"],
      ["revenue_share_percent", "% da receita total"], ["impressions", "Impressoes"], ["requests", "Solicitacoes"],
      ["fill_rate_percent", "Fill rate (%)"], ["clicks", "Cliques"], ["ecpm_client_usd", "eCPM cliente USD"], ["ctr_percent", "CTR (%)"],
    ].map(([key, label]) => ({ key, label }));
    const summaryColumns = [
      ["group", "Agrupamento"], ["meta_impressions", "Impressoes Meta"], ["conversations", "Conversas"], ["spend_brl", "Gasto Meta total BRL"],
      ["joinads_impressions", "Impressoes JoinAds"], ["joinads_clicks", "Cliques JoinAds"], ["revenue_client_usd", "Receita cliente USD"],
      ["revenue_client_brl", "Receita cliente BRL"], ["cpa_brl", "CPA BRL"], ["revenue_per_conversation_brl", "Receita por conversa BRL"],
      ["impressions_per_conversation", "Impressoes por conversa"], ["effective_ecpm_usd", "eCPM efetivo USD"], ["joinads_ctr_percent", "CTR JoinAds (%)"],
      ["roas", "ROAS"], ["profit_brl", "Lucro BRL"], ["margin_percent", "Margem (%)"],
      ["media_spend_brl", "Gasto de midia Meta BRL"], ["meta_tax_brl", "Impostos Meta BRL"],
    ].map(([key, label]) => ({ key, label }));
    const countryAccountColumns = [["country", "Pais"], ["account", "Conta"], ["conversations", "Conversas"], ["spend_brl", "Gasto Meta total BRL"], ["joinads_impressions", "Impressoes JoinAds"], ["revenue_client_usd", "Receita cliente USD"], ["revenue_client_brl", "Receita cliente BRL"], ["cpa_brl", "CPA BRL"], ["impressions_per_conversation", "Impressoes por conversa"], ["revenue_per_conversation_brl", "Receita por conversa BRL"], ["roas", "ROAS"], ["media_spend_brl", "Gasto de midia Meta BRL"], ["meta_tax_brl", "Impostos Meta BRL"]].map(([key, label]) => ({ key, label }));
    const dailyColumns = [["date", "Data"], ["meta_impressions", "Impressoes Meta"], ["conversations", "Conversas"], ["spend_brl", "Gasto Meta total BRL"], ["joinads_impressions", "Impressoes JoinAds"], ["revenue_client_usd", "Receita cliente USD"], ["revenue_client_brl", "Receita cliente BRL"], ["impressions_per_conversation", "Impressoes por conversa"], ["roas", "ROAS diario"], ["media_spend_brl", "Gasto de midia Meta BRL"], ["meta_tax_brl", "Impostos Meta BRL"]].map(([key, label]) => ({ key, label }));
    const originColumns = [
      ["origin", "Origem (utm_medium)"], ["domain", "Dominio"], ["impressions", "Impressoes JoinAds"],
      ["impression_share_percent", "% das impressoes"], ["clicks", "Cliques JoinAds"], ["ctr_percent", "CTR (%)"],
      ["revenue_client_usd", "Receita cliente USD"], ["revenue_client_brl", "Receita cliente BRL"], ["ecpm_client_usd", "eCPM cliente USD"],
    ].map(([key, label]) => ({ key, label }));
    const reconciliationColumns = [
      ["category", "Categoria reconciliada"], ["impressions", "Impressoes JoinAds"], ["clicks", "Cliques JoinAds"],
      ["revenue_client_usd", "Receita cliente USD"], ["revenue_client_brl", "Receita cliente BRL"],
      ["media_spend_brl", "Gasto de midia Meta BRL"], ["meta_tax_brl", "Impostos Meta BRL"], ["spend_brl", "Custo Meta total BRL"],
      ["roas", "ROAS"], ["treatment", "Tratamento"],
    ].map(([key, label]) => ({ key, label }));
    const formatHistoryDateTime = (value) => {
      if (!value) return "";
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return String(value);
      return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(parsed);
    };
    const historyStrategyLabel = (value) => ({
      LOWEST_COST_WITH_BID_CAP: "Limite de lance",
      COST_CAP: "Limite de custo",
      LOWEST_COST_WITHOUT_CAP: "Menor custo (sem limite)",
    })[String(value || "").toUpperCase()] || value || "Nao informado";
    const bidHistoryExport = (Array.isArray(bidHistoryRows) ? bidHistoryRows : [])
      .slice()
      .sort((a, b) => String(a.changed_at || "").localeCompare(String(b.changed_at || "")))
      .map((row) => {
        const previous = row.previous_amount_brl == null ? null : toNumber(row.previous_amount_brl);
        const requested = row.requested_amount_brl == null ? null : toNumber(row.requested_amount_brl);
        const confirmed = row.confirmed_amount_brl == null ? null : toNumber(row.confirmed_amount_brl);
        return {
          changed_at: formatHistoryDateTime(row.changed_at),
          actor: row.actor_username || row.actor_id || "Usuario do Dashboard",
          campaign_name: row.campaign_name || "-",
          campaign_id: row.campaign_id || "",
          adset_name: row.adset_name || "-",
          adset_id: row.adset_id || "",
          previous_strategy: historyStrategyLabel(row.previous_strategy),
          requested_strategy: historyStrategyLabel(row.requested_strategy),
          confirmed_strategy: historyStrategyLabel(row.confirmed_strategy),
          previous_amount_brl: previous == null ? "Nao conhecido" : { value: previous, style: "Money" },
          requested_amount_brl: requested == null ? "Sem valor" : { value: requested, style: "Money" },
          confirmed_amount_brl: confirmed == null ? "Sem limite" : { value: confirmed, style: "Money" },
          variation_brl: previous != null && confirmed != null ? { value: confirmed - previous, style: "Money" } : "",
          meta_updated_time_before: formatHistoryDateTime(row.meta_updated_time_before),
          meta_updated_time_after: formatHistoryDateTime(row.meta_updated_time_after),
          status: row.status === "confirmed" ? "Confirmado na Meta" : row.status || "",
          source: row.source === "dashboard" ? "Dashboard" : row.source || "",
        };
      });
    const bidHistoryColumns = [
      ["changed_at", "Alterado em (Sao Paulo)"], ["actor", "Responsavel"],
      ["campaign_name", "Campanha"], ["campaign_id", "ID campanha"],
      ["adset_name", "Conjunto"], ["adset_id", "ID conjunto"],
      ["previous_strategy", "Estrategia anterior"], ["requested_strategy", "Estrategia solicitada"],
      ["confirmed_strategy", "Estrategia confirmada"], ["previous_amount_brl", "Limite anterior BRL"],
      ["requested_amount_brl", "Limite solicitado BRL"], ["confirmed_amount_brl", "Limite confirmado BRL"],
      ["variation_brl", "Variacao BRL"], ["meta_updated_time_before", "Atualizacao Meta anterior"],
      ["meta_updated_time_after", "Atualizacao Meta atual"], ["status", "Status"], ["source", "Origem"],
    ].map(([key, label]) => ({ key, label }));
    const parameterColumns = [{ key: "parameter", label: "Parametro editavel" }, { key: "value", label: "Valor" }, { key: "note", label: "Como usar" }];
    const parameterRows = [
      { parameter: "Cambio BRL/USD", value: { value: toNumber(brlRate), style: "Input" }, note: "Altere esta celula; as formulas da aba Meta x JoinAds recalculam a receita em BRL." },
      { parameter: "ROAS alvo", value: { value: 1.25, style: "Input" }, note: "Escalar a partir do alvo + 0,20; observar acima de 1; cortar abaixo de 1." },
      { parameter: "Cobertura minima", value: { value: 0.9, style: "Input" }, note: "Referencia recomendada: 90%." },
      { parameter: "Receita src_ total USD", value: srcCampaignTotal.revenue_client_usd, note: "Todas as linhas utm_campaign=src_ no periodo." },
      { parameter: "Receita atribuida USD", value: attributedRevenue, note: "Receita ligada a anuncio Meta no recorte." },
      { parameter: "Cobertura real da receita", value: { value: revenueCoverage, style: revenueCoverage >= 0.9 ? "Green" : "Red" }, note: "Receita src_ atribuida / Messenger potencialmente pago, excluindo organic_." },
      { parameter: "Cobertura real das impressoes", value: { value: impressionCoverage, style: impressionCoverage >= 0.9 ? "Green" : "Red" }, note: "Impressoes src_ atribuidas / Messenger potencialmente pago, excluindo organic_." },
      { parameter: "ROAS atribuido", value: trackedRoas, note: "Somente receita ligada aos src_ das campanhas / custo Meta com impostos." },
      { parameter: "ROAS economico estimado", value: economicRoas, note: "Messenger menos organic_ / custo Meta com impostos. Nao distribui a diferenca entre campanhas." },
      { parameter: "Origem do gasto diario", value: "Meta date_start", note: "Somado diretamente das linhas diarias retornadas com time_increment=1; nao ha rateio nem acumulacao." },
      { parameter: "Impostos Meta ativos", value: metaTaxSettings.metaTaxEnabled !== false ? "Sim" : "Nao", note: "O gasto usado em CPA, ROAS, lucro e margem inclui o custo tributario configurado." },
      { parameter: "Aliquota Meta (%)", value: toNumber(metaTaxSettings.metaTaxRatePercent), note: `Vigencia: ${metaTaxSettings.metaTaxEffectiveDate || "2026-01-01"}.` },
      { parameter: "Modo do spend Meta", value: metaTaxSettings.metaTaxMode === "included" ? "Imposto ja incluido" : "Somar imposto", note: "Evita duplicar tributos se o campo spend da API mudar." },
      { parameter: "Impressoes organicas JoinAds", value: organicExportRow?.impressions || 0, note: "Total de utm_medium=organic no dominio e periodo selecionados. Veja a aba Resumo por Origem." },
      { parameter: "Alteracoes de limite registradas", value: bidHistoryExport.length, note: "Mudancas confirmadas pela Meta e gravadas pelo Dashboard no periodo. Consulte a aba Historico limite custo." },
    ];
    downloadExcelWorkbook(
      `metricas-mensagens_${reportFilters.domain || "dominio"}_${reportFilters.startDate || "inicio"}_${reportFilters.endDate || "fim"}.xls`,
      [
        { name: "Parametros", columns: parameterColumns, rows: parameterRows },
        { name: "Meta x JoinAds", columns: metaColumns, rows: crossing },
        { name: "Historico limite custo", columns: bidHistoryColumns, rows: bidHistoryExport },
        { name: "JoinAds por src e bloco", columns: detailColumns, rows: detail },
        { name: "Resumo por Pais", columns: summaryColumns, rows: countrySummary },
        { name: "Resumo por Conta", columns: summaryColumns, rows: accountSummary },
        { name: "Resumo por Bloco", columns: blockColumns, rows: blockReport },
        { name: "Resumo Pais x Conta", columns: countryAccountColumns, rows: countryAccountSummary },
        { name: "Visao diaria", columns: dailyColumns, rows: daily },
        { name: "Resumo por Origem", columns: originColumns, rows: originRows },
        { name: "Reconciliacao Origem", columns: reconciliationColumns, rows: reconciliationRows },
        { name: "Pendencias atribuicao", columns: detailColumns, rows: pending },
      ]
    );
  };
  const campaignRows = Array.from(
    safeRows
      .filter((row) => isMessageMetricsRow(row))
      .reduce((map, row) => {
        const key = row.campaign_id || row.campaign_name || "Sem campanha";
        const item =
          map.get(key) || {
            campaign_id: row.campaign_id || "",
            campaign_name: row.campaign_name || "-",
            objective: row.objective || "",
            meta_impressions: 0,
            joinads_impressions: 0,
            meta_clicks: 0,
            joinads_clicks: 0,
            spend_brl: 0,
            media_spend_brl: 0,
            meta_tax_brl: 0,
            revenue_usd: 0,
            revenue_brl: 0,
            conversations: 0,
            meta_results: 0,
            meta_cost_weighted: 0,
            meta_cost_weight: 0,
            meta_cost_sum: 0,
            meta_cost_count: 0,
            ads: new Set(),
            adsets: new Map(),
            attributionLevels: new Set(),
            sourceValues: new Set(),
            countedJoinadsAds: new Set(),
          };
        const revenueUsd = toNumber(row.revenue_client_value);
        const revenueBrl = row.revenue_client_brl_value != null
          ? toNumber(row.revenue_client_brl_value)
          : brlRate
          ? revenueUsd * brlRate
          : 0;
        const metaCostPerResult = toNumber(row.cost_per_result_value);
        const rowSpend = toNumber(row.spend_value || row.spend);
        // Metricas da Meta sao diarias (time_increment=1) -> somar por linha esta correto.
        item.meta_impressions += toNumber(row.meta_impressions_value || row.impressions);
        item.meta_clicks += toNumber(row.meta_clicks_value || row.clicks);
        item.spend_brl += rowSpend;
        item.media_spend_brl += toNumber(row.spend_media_value ?? row.spend_value ?? row.spend);
        item.meta_tax_brl += toNumber(row.meta_tax_value);
        item.conversations += toNumber(row.messaging_conversations_started);
        item.meta_results += toNumber(row.results_meta);
        // Metricas da JoinAds (receita/impressoes/cliques) sao TOTAIS do periodo repetidos em cada
        // linha diaria do mesmo anuncio. Contar uma unica vez por anuncio para nao multiplicar pelos dias.
        const joinadsAdKey = row.ad_id || row.ad_name || "";
        if (!joinadsAdKey || !item.countedJoinadsAds.has(joinadsAdKey)) {
          item.joinads_impressions += toNumber(row.impressions_joinads);
          item.joinads_clicks += toNumber(row.clicks_joinads);
          item.revenue_usd += revenueUsd;
          item.revenue_brl += revenueBrl;
          if (joinadsAdKey) item.countedJoinadsAds.add(joinadsAdKey);
        }
        if (metaCostPerResult > 0) {
          item.meta_cost_sum += metaCostPerResult;
          item.meta_cost_count += 1;
          if (rowSpend > 0) {
            item.meta_cost_weighted += metaCostPerResult * rowSpend;
            item.meta_cost_weight += rowSpend;
          }
        }
        if (row.ad_id || row.ad_name) item.ads.add(row.ad_id || row.ad_name);
        if (row.adset_id) {
          const current = item.adsets.get(row.adset_id) || {
            id: row.adset_id,
            name: row.adset_name || row.adset_id,
            campaignId: row.campaign_id || "",
            dailyBudgetBrl: null,
            lifetimeBudgetBrl: null,
            campaignDailyBudgetBrl: null,
            campaignLifetimeBudgetBrl: null,
            bidAmountBrl: null,
            bidStrategy: "",
            optimizationGoal: "",
          };
          if (!current.campaignId && row.campaign_id) current.campaignId = row.campaign_id;
          const dailyBudgetBrl =
            row.adset_daily_budget_brl != null
              ? toNumber(row.adset_daily_budget_brl)
              : row.adset_daily_budget != null
              ? toNumber(row.adset_daily_budget) / 100
              : null;
          const lifetimeBudgetBrl =
            row.adset_lifetime_budget_brl != null
              ? toNumber(row.adset_lifetime_budget_brl)
              : row.adset_lifetime_budget != null
              ? toNumber(row.adset_lifetime_budget) / 100
              : null;
          const campaignDailyBudgetBrl =
            row.campaign_daily_budget_brl != null
              ? toNumber(row.campaign_daily_budget_brl)
              : row.campaign_daily_budget != null
              ? toNumber(row.campaign_daily_budget) / 100
              : null;
          const campaignLifetimeBudgetBrl =
            row.campaign_lifetime_budget_brl != null
              ? toNumber(row.campaign_lifetime_budget_brl)
              : row.campaign_lifetime_budget != null
              ? toNumber(row.campaign_lifetime_budget) / 100
              : null;
          if (dailyBudgetBrl != null) current.dailyBudgetBrl = dailyBudgetBrl;
          if (lifetimeBudgetBrl != null) current.lifetimeBudgetBrl = lifetimeBudgetBrl;
          if (campaignDailyBudgetBrl != null) current.campaignDailyBudgetBrl = campaignDailyBudgetBrl;
          if (campaignLifetimeBudgetBrl != null) current.campaignLifetimeBudgetBrl = campaignLifetimeBudgetBrl;
          if (row.adset_bid_amount_brl != null) {
            current.bidAmountBrl = toNumber(row.adset_bid_amount_brl);
          }
          if (row.adset_bid_strategy) current.bidStrategy = row.adset_bid_strategy;
          if (row.adset_optimization_goal) current.optimizationGoal = row.adset_optimization_goal;
          item.adsets.set(row.adset_id, current);
        }
        if (row.data_level) item.attributionLevels.add(row.data_level);
        if (row.joinads_source_value) item.sourceValues.add(row.joinads_source_value);
        map.set(key, item);
        return map;
      }, new Map())
      .values()
  )
    .map((row) => ({
      ...row,
      roas: row.spend_brl > 0 ? row.revenue_brl / row.spend_brl : null,
      profit_brl: row.revenue_brl - row.spend_brl,
      ecpm: row.joinads_impressions > 0 ? (row.revenue_usd / row.joinads_impressions) * 1000 : null,
      meta_cost_per_result:
        row.meta_cost_weight > 0
          ? row.meta_cost_weighted / row.meta_cost_weight
          : row.meta_cost_count > 0
          ? row.meta_cost_sum / row.meta_cost_count
          : null,
      cost_per_conversation:
        row.conversations > 0 ? row.spend_brl / row.conversations : null,
      joinads_impressions_per_conversation:
        row.conversations > 0 ? row.joinads_impressions / row.conversations : null,
      revenue_per_conversation:
        row.conversations > 0 ? row.revenue_brl / row.conversations : null,
      profit_per_conversation:
        row.conversations > 0 ? (row.revenue_brl - row.spend_brl) / row.conversations : null,
      visits_per_conversation:
        row.conversations > 0 ? row.joinads_clicks / row.conversations : null,
      margin_pct: row.revenue_brl > 0 ? ((row.revenue_brl - row.spend_brl) / row.revenue_brl) * 100 : null,
      ctr_meta: row.meta_impressions > 0 ? (row.meta_clicks / row.meta_impressions) * 100 : null,
    }))
    .sort((a, b) => b.revenue_brl - a.revenue_brl);
  const totalsRow = campaignRows.reduce(
    (acc, row) => {
      acc.ads += row.ads.size || 0;
      acc.adsets += row.adsets.size || 0;
      acc.meta_impressions += row.meta_impressions || 0;
      acc.joinads_impressions += row.joinads_impressions || 0;
      acc.meta_clicks += row.meta_clicks || 0;
      acc.joinads_clicks += row.joinads_clicks || 0;
      acc.conversations += row.conversations || 0;
      acc.meta_results += row.meta_results || 0;
      acc.meta_cost_weighted += row.meta_cost_weighted || 0;
      acc.meta_cost_weight += row.meta_cost_weight || 0;
      acc.meta_cost_sum += row.meta_cost_sum || 0;
      acc.meta_cost_count += row.meta_cost_count || 0;
      acc.spend_brl += row.spend_brl || 0;
      acc.revenue_usd += row.revenue_usd || 0;
      acc.revenue_brl += row.revenue_brl || 0;
      return acc;
    },
    {
      ads: 0,
      adsets: 0,
      meta_impressions: 0,
      joinads_impressions: 0,
      meta_clicks: 0,
      joinads_clicks: 0,
      conversations: 0,
      meta_results: 0,
      meta_cost_weighted: 0,
      meta_cost_weight: 0,
      meta_cost_sum: 0,
      meta_cost_count: 0,
      spend_brl: 0,
      revenue_usd: 0,
      revenue_brl: 0,
    }
  );
  totalsRow.roas = totalsRow.spend_brl > 0 ? totalsRow.revenue_brl / totalsRow.spend_brl : null;
  totalsRow.profit_brl = totalsRow.revenue_brl - totalsRow.spend_brl;
  totalsRow.ecpm =
    totalsRow.joinads_impressions > 0
      ? (totalsRow.revenue_usd / totalsRow.joinads_impressions) * 1000
      : null;
  totalsRow.meta_cost_per_result =
    totalsRow.meta_cost_weight > 0
      ? totalsRow.meta_cost_weighted / totalsRow.meta_cost_weight
      : totalsRow.meta_cost_count > 0
      ? totalsRow.meta_cost_sum / totalsRow.meta_cost_count
      : null;
  totalsRow.cost_per_conversation =
    totalsRow.conversations > 0 ? totalsRow.spend_brl / totalsRow.conversations : null;
  totalsRow.joinads_impressions_per_conversation =
    totalsRow.conversations > 0
      ? totalsRow.joinads_impressions / totalsRow.conversations
      : null;
  totalsRow.revenue_per_conversation =
    totalsRow.conversations > 0 ? totalsRow.revenue_brl / totalsRow.conversations : null;
  totalsRow.profit_per_conversation =
    totalsRow.conversations > 0 ? totalsRow.profit_brl / totalsRow.conversations : null;
  totalsRow.visits_per_conversation =
    totalsRow.conversations > 0 ? totalsRow.joinads_clicks / totalsRow.conversations : null;
  totalsRow.margin_pct =
    totalsRow.revenue_brl > 0 ? (totalsRow.profit_brl / totalsRow.revenue_brl) * 100 : null;
  totalsRow.ctr_meta =
    totalsRow.meta_impressions > 0 ? (totalsRow.meta_clicks / totalsRow.meta_impressions) * 100 : null;
  const buildMediumSummary = (mediumName, spendBrl = 0) => {
    const rowsForMedium = (Array.isArray(mediumRows) ? mediumRows : []).filter(
      (row) => normalizeKey(row.custom_value) === normalizeKey(mediumName)
    );
    const summary = rowsForMedium.reduce(
      (acc, row) => {
        acc.impressions += toNumber(row.impressions);
        acc.clicks += toNumber(row.clicks);
        acc.revenue_usd += toNumber(row.revenue_client ?? row.earnings_client ?? 0);
        return acc;
      },
      { rows: rowsForMedium, impressions: 0, clicks: 0, revenue_usd: 0 }
    );
    summary.revenue_brl = brlRate ? summary.revenue_usd * brlRate : 0;
    summary.spend_brl = spendBrl || 0;
    summary.profit_brl = summary.revenue_brl - summary.spend_brl;
    summary.roas = summary.spend_brl > 0 ? summary.revenue_brl / summary.spend_brl : null;
    summary.ecpm =
      summary.impressions > 0 ? (summary.revenue_usd / summary.impressions) * 1000 : null;
    return summary;
  };
  let messengerMedium = buildMediumSummary("messenger", totalsRow.spend_brl || 0);
  let organicMedium = buildMediumSummary("organic", 0);
  const messengerMediumRows = messengerMedium.rows;
  const organicMediumRows = organicMedium.rows;
  // Com filtro de Pagina ativo, a receita por utm_medium e global (todas as paginas) e vazaria
  // ROAS/lucro/eCPM de outras paginas. Nesse caso usamos os totais ja escopados por pagina
  // (atribuicao por campanha) e zeramos o organico, que nao e atribuivel a uma pagina.
  if (pageScoped) {
    messengerMedium = {
      ...messengerMedium,
      impressions: totalsRow.joinads_impressions || 0,
      clicks: totalsRow.joinads_clicks || 0,
      revenue_usd: totalsRow.revenue_usd || 0,
      revenue_brl: totalsRow.revenue_brl || 0,
      spend_brl: totalsRow.spend_brl || 0,
      profit_brl: totalsRow.profit_brl || 0,
      roas: totalsRow.roas,
      ecpm: totalsRow.ecpm,
    };
    organicMedium = {
      ...organicMedium,
      impressions: 0,
      clicks: 0,
      revenue_usd: 0,
      revenue_brl: 0,
      spend_brl: 0,
      profit_brl: 0,
      roas: null,
      ecpm: null,
    };
  }
  const campaignOriginTotals = (Array.isArray(joinadsDetailRows) ? joinadsDetailRows : []).reduce((acc, row) => {
    const value = normalizeKey(row.custon_value ?? row.custom_value);
    const target = value.startsWith("src_")
      ? acc.src
      : value === "organic" || value.startsWith("organic_")
      ? acc.evoOrganic
      : value
      ? acc.other
      : acc.empty;
    target.impressions += toNumber(row.impressions);
    target.revenueUsd += toNumber(row.earnings_client ?? row.revenue_client ?? 0);
    return acc;
  }, {
    src: { impressions: 0, revenueUsd: 0 },
    evoOrganic: { impressions: 0, revenueUsd: 0 },
    other: { impressions: 0, revenueUsd: 0 },
    empty: { impressions: 0, revenueUsd: 0 },
  });
  const paidMessengerRevenueUsd = pageScoped
    ? totalsRow.revenue_usd
    : Math.max(totalsRow.revenue_usd, messengerMedium.revenue_usd - campaignOriginTotals.evoOrganic.revenueUsd);
  const paidMessengerImpressions = pageScoped
    ? totalsRow.joinads_impressions
    : Math.max(totalsRow.joinads_impressions, messengerMedium.impressions - campaignOriginTotals.evoOrganic.impressions);
  const realRevenueCoverage = paidMessengerRevenueUsd > 0 ? totalsRow.revenue_usd / paidMessengerRevenueUsd : null;
  const realImpressionCoverage = paidMessengerImpressions > 0 ? totalsRow.joinads_impressions / paidMessengerImpressions : null;
  const economicRoas = totalsRow.spend_brl > 0 ? paidMessengerRevenueUsd * toNumber(brlRate) / totalsRow.spend_brl : null;
  const economicProfitBrl = paidMessengerRevenueUsd * toNumber(brlRate) - totalsRow.spend_brl;
  const unclassifiedMessengerRevenueUsd = pageScoped ? 0 : Math.max(
    0,
    messengerMedium.revenue_usd - campaignOriginTotals.src.revenueUsd -
      campaignOriginTotals.evoOrganic.revenueUsd - campaignOriginTotals.other.revenueUsd
  );
  const unclassifiedMessengerImpressions = pageScoped ? 0 : Math.max(
    0,
    messengerMedium.impressions - campaignOriginTotals.src.impressions -
      campaignOriginTotals.evoOrganic.impressions - campaignOriginTotals.other.impressions
  );
  const allTermRows = Array.isArray(termRows) ? termRows : [];
  const allTermDailyRows = Array.isArray(termDailyRows) ? termDailyRows : [];
  const candidateTermRows = allTermRows.filter((row) =>
    looksLikeMessenleadLeadId(row.custom_value)
  );
  const normalizedLeadRows = (Array.isArray(leadRows) ? leadRows : [])
    .map(normalizeMessenleadLead)
    .filter(Boolean);
  const leadInfoById = new Map(
    normalizedLeadRows.map((lead) => [normalizeKey(lead.leadId), lead])
  );
  const resolvedLeadIdSet = new Set(leadInfoById.keys());
  const isLeadTerm = (value) => {
    const key = normalizeKey(value);
    if (!key) return false;
    return resolvedLeadIdSet.has(key);
  };
  const leadTermRows = allTermRows.filter((row) => isLeadTerm(row.custom_value));
  const leadDailyRows = allTermDailyRows.filter((row) => isLeadTerm(row.custom_value));
  const hasDailyLeadRevenue = leadDailyRows.length > 0;
  const leadLtvRows = Array.from(
    (hasDailyLeadRevenue ? leadDailyRows : leadTermRows)
      .reduce((map, row) => {
        const leadId = String(row.custom_value || "").trim();
        const key = normalizeKey(leadId);
        if (!key) return map;
        const leadInfo = leadInfoById.get(key) || {};
        const item =
          map.get(key) || {
            lead_id: leadId,
            first_seen_at: leadInfo.firstSeenAt || "",
            last_seen_at: leadInfo.lastSeenAt || "",
            ad_id: leadInfo.adId || "",
            source_key: leadInfo.sourceKey || "",
            resolved: Boolean(leadInfo.firstSeenAt),
            rows: 0,
            domains: new Set(),
            impressions: 0,
            d3_impressions: 0,
            d4_impressions: 0,
            d5_impressions: 0,
            d6_impressions: 0,
            d7_impressions: 0,
            clicks: 0,
            revenue_usd: 0,
            d0_usd: 0,
            d1_usd: 0,
            d2_usd: 0,
            d3_usd: 0,
            d4_usd: 0,
            d5_usd: 0,
            d6_usd: 0,
            d7_usd: 0,
          };
        if (!item.first_seen_at && leadInfo.firstSeenAt) item.first_seen_at = leadInfo.firstSeenAt;
        if (!item.last_seen_at && leadInfo.lastSeenAt) item.last_seen_at = leadInfo.lastSeenAt;
        if (!item.ad_id && leadInfo.adId) item.ad_id = leadInfo.adId;
        if (!item.source_key && leadInfo.sourceKey) item.source_key = leadInfo.sourceKey;
        if (leadInfo.firstSeenAt) item.resolved = true;
        item.rows += 1;
        if (row.domain || row.name) item.domains.add(row.domain || row.name);
        item.impressions += toNumber(row.impressions);
        item.clicks += toNumber(row.clicks);
        const rowImpressions = toNumber(row.impressions);
        const revenueUsd = toNumber(row.revenue_client ?? row.earnings_client ?? 0);
        item.revenue_usd += revenueUsd;
        const ageDays = item.first_seen_at && row.revenue_date
          ? daysBetweenIsoDates(String(item.first_seen_at).slice(0, 10), row.revenue_date)
          : null;
        if (ageDays != null && ageDays >= 0) {
          if (ageDays <= 0) item.d0_usd += revenueUsd;
          if (ageDays <= 1) item.d1_usd += revenueUsd;
          if (ageDays <= 2) item.d2_usd += revenueUsd;
          if (ageDays <= 3) {
            item.d3_usd += revenueUsd;
            item.d3_impressions += rowImpressions;
          }
          if (ageDays <= 4) {
            item.d4_usd += revenueUsd;
            item.d4_impressions += rowImpressions;
          }
          if (ageDays <= 5) {
            item.d5_usd += revenueUsd;
            item.d5_impressions += rowImpressions;
          }
          if (ageDays <= 6) {
            item.d6_usd += revenueUsd;
            item.d6_impressions += rowImpressions;
          }
          if (ageDays <= 7) {
            item.d7_usd += revenueUsd;
            item.d7_impressions += rowImpressions;
          }
        }
        map.set(key, item);
        return map;
      }, new Map())
      .values()
  )
    .map((row) => ({
      ...row,
      revenue_brl: brlRate ? row.revenue_usd * brlRate : 0,
      d0_brl: brlRate ? row.d0_usd * brlRate : 0,
      d1_brl: brlRate ? row.d1_usd * brlRate : 0,
      d2_brl: brlRate ? row.d2_usd * brlRate : 0,
      d3_brl: brlRate ? row.d3_usd * brlRate : 0,
      d4_brl: brlRate ? row.d4_usd * brlRate : 0,
      d5_brl: brlRate ? row.d5_usd * brlRate : 0,
      d6_brl: brlRate ? row.d6_usd * brlRate : 0,
      d7_brl: brlRate ? row.d7_usd * brlRate : 0,
      ecpm: row.impressions > 0 ? (row.revenue_usd / row.impressions) * 1000 : null,
      d0_user_brl: calculateUserCommission(brlRate ? row.d0_usd * brlRate : 0, commissionPercent),
      d1_user_brl: calculateUserCommission(brlRate ? row.d1_usd * brlRate : 0, commissionPercent),
      d2_user_brl: calculateUserCommission(brlRate ? row.d2_usd * brlRate : 0, commissionPercent),
      d3_user_brl: calculateUserCommission(brlRate ? row.d3_usd * brlRate : 0, commissionPercent),
      d4_user_brl: calculateUserCommission(brlRate ? row.d4_usd * brlRate : 0, commissionPercent),
      d5_user_brl: calculateUserCommission(brlRate ? row.d5_usd * brlRate : 0, commissionPercent),
      d6_user_brl: calculateUserCommission(brlRate ? row.d6_usd * brlRate : 0, commissionPercent),
      d7_user_brl: calculateUserCommission(brlRate ? row.d7_usd * brlRate : 0, commissionPercent),
      user_commission_brl: calculateUserCommission(
        brlRate ? row.revenue_usd * brlRate : 0,
        commissionPercent
      ),
    }))
    .sort((a, b) => b.revenue_usd - a.revenue_usd);
  const metaAdInfoById = new Map();
  const metaCampaignDailyByKey = new Map();
  const metaRowsForLtv = Array.isArray(ltvMetaRows) && ltvMetaRows.length ? ltvMetaRows : safeRows;
  metaRowsForLtv.filter((row) => isMessageMetricsRow(row)).forEach((row) => {
    const adId = normalizeKey(row.ad_id || "");
    const campaignId = String(row.campaign_id || "").trim();
    const campaignName = String(row.campaign_name || "").trim();
    const campaignKey = normalizeKey(campaignId || campaignName || "");
    const adName = String(row.ad_name || "").trim();
    const rowDate = String(row.date_start || row.date || "").slice(0, 10);
    const rowSpend = toNumber(row.spend_value || row.spend);

    if (adId) {
      const current =
        metaAdInfoById.get(adId) || {
          ad_id: row.ad_id || "",
          ad_name: adName || row.ad_id || "",
          campaign_id: campaignId,
          campaign_name: campaignName || campaignId || "Sem campanha",
        };
      if (adName && (!current.ad_name || current.ad_name === current.ad_id)) current.ad_name = adName;
      if (!current.campaign_id && campaignId) current.campaign_id = campaignId;
      if (
        campaignName &&
        (!current.campaign_name ||
          current.campaign_name === current.campaign_id ||
          current.campaign_name === "Sem campanha")
      ) {
        current.campaign_name = campaignName;
      }
      metaAdInfoById.set(adId, current);
    }

    if (campaignKey && rowDate) {
      const dailyKey = `${campaignKey}|||${rowDate}`;
      const rowConversations =
        row.messaging_conversations_started != null
          ? toNumber(row.messaging_conversations_started)
          : getMessagingConversationStarts(row);
      const current =
        metaCampaignDailyByKey.get(dailyKey) || {
          spend_brl: 0,
          conversations: 0,
          impressions: 0,
          clicks: 0,
          ads: new Set(),
        };
      current.spend_brl += rowSpend;
      current.conversations += rowConversations;
      current.impressions += toNumber(row.meta_impressions_value || row.impressions);
      current.clicks += toNumber(row.meta_clicks_value || row.clicks);
      if (row.ad_id || row.ad_name) current.ads.add(row.ad_id || row.ad_name);
      metaCampaignDailyByKey.set(dailyKey, current);
    }
  });
  const campaignLtvRows = Array.from(
    leadLtvRows
      .reduce((map, row) => {
        const adInfo = metaAdInfoById.get(normalizeKey(row.ad_id || "")) || {};
        const campaignId = adInfo.campaign_id || "";
        const campaignName = adInfo.campaign_name || campaignId || "Sem campanha";
        const campaignKey = normalizeKey(campaignId || campaignName || row.ad_id || row.source_key || "unattributed");
        const cohortDate = row.first_seen_at ? String(row.first_seen_at).slice(0, 10) : "sem_coorte";
        const key = campaignKey;
        const item =
          map.get(key) || {
            campaign_key: campaignKey,
            campaign_id: campaignId,
            campaign_name: campaignName,
            cohort_date: "",
            first_cohort_date: "",
            last_cohort_date: "",
            cohort_dates: new Set(),
            leads: 0,
            resolved: 0,
            joinads_rows: 0,
            ads: new Set(),
            domains: new Set(),
            source_keys: new Set(),
            impressions: 0,
            d3_impressions: 0,
            d4_impressions: 0,
            d5_impressions: 0,
            d6_impressions: 0,
            d7_impressions: 0,
            clicks: 0,
            revenue_usd: 0,
            revenue_brl: 0,
            d0_brl: 0,
            d1_brl: 0,
            d2_brl: 0,
            d3_brl: 0,
            d4_brl: 0,
            d5_brl: 0,
            d6_brl: 0,
            d7_brl: 0,
            d0_user_brl: 0,
            d1_user_brl: 0,
            d2_user_brl: 0,
            d3_user_brl: 0,
            d4_user_brl: 0,
            d5_user_brl: 0,
            d6_user_brl: 0,
            d7_user_brl: 0,
            user_commission_brl: 0,
          };
        if (cohortDate && cohortDate !== "sem_coorte") {
          item.cohort_dates.add(cohortDate);
          if (!item.first_cohort_date || cohortDate < item.first_cohort_date) item.first_cohort_date = cohortDate;
          if (!item.last_cohort_date || cohortDate > item.last_cohort_date) item.last_cohort_date = cohortDate;
          item.cohort_date = item.first_cohort_date === item.last_cohort_date
            ? item.first_cohort_date
            : `${item.first_cohort_date} a ${item.last_cohort_date}`;
        }
        item.leads += 1;
        item.resolved += row.resolved ? 1 : 0;
        item.joinads_rows += row.rows || 0;
        item.impressions += row.impressions || 0;
        item.d3_impressions += row.d3_impressions || 0;
        item.d4_impressions += row.d4_impressions || 0;
        item.d5_impressions += row.d5_impressions || 0;
        item.d6_impressions += row.d6_impressions || 0;
        item.d7_impressions += row.d7_impressions || 0;
        item.clicks += row.clicks || 0;
        item.revenue_usd += row.revenue_usd || 0;
        item.revenue_brl += row.revenue_brl || 0;
        item.d0_brl += row.d0_brl || 0;
        item.d1_brl += row.d1_brl || 0;
        item.d2_brl += row.d2_brl || 0;
        item.d3_brl += row.d3_brl || 0;
        item.d4_brl += row.d4_brl || 0;
        item.d5_brl += row.d5_brl || 0;
        item.d6_brl += row.d6_brl || 0;
        item.d7_brl += row.d7_brl || 0;
        item.d0_user_brl += row.d0_user_brl || 0;
        item.d1_user_brl += row.d1_user_brl || 0;
        item.d2_user_brl += row.d2_user_brl || 0;
        item.d3_user_brl += row.d3_user_brl || 0;
        item.d4_user_brl += row.d4_user_brl || 0;
        item.d5_user_brl += row.d5_user_brl || 0;
        item.d6_user_brl += row.d6_user_brl || 0;
        item.d7_user_brl += row.d7_user_brl || 0;
        item.user_commission_brl += row.user_commission_brl || 0;
        if (adInfo.ad_name || row.ad_id) item.ads.add(adInfo.ad_name || row.ad_id);
        if (row.source_key) item.source_keys.add(row.source_key);
        Array.from(row.domains || []).forEach((domain) => item.domains.add(domain));
        map.set(key, item);
        return map;
      }, new Map())
      .values()
  )
    .map((row) => {
      const metaDailyTotals = Array.from(row.cohort_dates || []).reduce(
        (acc, cohortDate) => {
          const metaDaily = metaCampaignDailyByKey.get(`${row.campaign_key}|||${cohortDate}`);
          if (!metaDaily) return acc;
          acc.spend_brl += toNumber(metaDaily.spend_brl);
          acc.conversations += toNumber(metaDaily.conversations);
          acc.impressions += toNumber(metaDaily.impressions);
          acc.clicks += toNumber(metaDaily.clicks);
          Array.from(metaDaily.ads || []).forEach((ad) => acc.ads.add(ad));
          return acc;
        },
        { spend_brl: 0, conversations: 0, impressions: 0, clicks: 0, ads: new Set() }
      );
      const spendBrl = metaDailyTotals.spend_brl;
      const metaConversations = metaDailyTotals.conversations;
      const visibleWindowImpressions = hasDailyLeadRevenue
        ? row[`d${maxVisibleLtvDay}_impressions`]
        : null;
      const profitBrl = row.revenue_brl - spendBrl;
      return {
        ...row,
        spend_brl: spendBrl,
        meta_conversations: metaConversations,
        meta_impressions: metaDailyTotals.impressions,
        meta_clicks: metaDailyTotals.clicks,
        roas_d0: spendBrl > 0 ? row.d0_brl / spendBrl : null,
        roas_d1: spendBrl > 0 ? row.d1_brl / spendBrl : null,
        roas_d2: spendBrl > 0 ? row.d2_brl / spendBrl : null,
        roas_d3: spendBrl > 0 ? row.d3_brl / spendBrl : null,
        roas_d4: spendBrl > 0 ? row.d4_brl / spendBrl : null,
        roas_d5: spendBrl > 0 ? row.d5_brl / spendBrl : null,
        roas_d6: spendBrl > 0 ? row.d6_brl / spendBrl : null,
        roas_d7: spendBrl > 0 ? row.d7_brl / spendBrl : null,
        roas: spendBrl > 0 ? row.revenue_brl / spendBrl : null,
        profit_brl: profitBrl,
        joinads_impressions_visible_window: visibleWindowImpressions,
        joinads_impressions_per_conversation:
          metaConversations > 0 && visibleWindowImpressions != null
            ? visibleWindowImpressions / metaConversations
            : null,
        ecpm: row.impressions > 0 ? (row.revenue_usd / row.impressions) * 1000 : null,
      };
    })
    .sort((a, b) => b.revenue_brl - a.revenue_brl);
  const campaignLtvVisibleRows = campaignLtvRows.slice(0, 50);
  const campaignLtvTotals = campaignLtvRows.reduce(
    (acc, row) => {
      acc.leads += row.leads || 0;
      acc.resolved += row.resolved || 0;
      acc.joinads_rows += row.joinads_rows || 0;
      acc.impressions += row.impressions || 0;
      acc.visible_window_impressions += row.joinads_impressions_visible_window || 0;
      acc.clicks += row.clicks || 0;
      acc.revenue_usd += row.revenue_usd || 0;
      acc.revenue_brl += row.revenue_brl || 0;
      acc.d0_brl += row.d0_brl || 0;
      acc.d1_brl += row.d1_brl || 0;
      acc.d2_brl += row.d2_brl || 0;
      acc.d3_brl += row.d3_brl || 0;
      acc.d4_brl += row.d4_brl || 0;
      acc.d5_brl += row.d5_brl || 0;
      acc.d6_brl += row.d6_brl || 0;
      acc.d7_brl += row.d7_brl || 0;
      acc.d0_user_brl += row.d0_user_brl || 0;
      acc.d1_user_brl += row.d1_user_brl || 0;
      acc.d2_user_brl += row.d2_user_brl || 0;
      acc.d3_user_brl += row.d3_user_brl || 0;
      acc.d4_user_brl += row.d4_user_brl || 0;
      acc.d5_user_brl += row.d5_user_brl || 0;
      acc.d6_user_brl += row.d6_user_brl || 0;
      acc.d7_user_brl += row.d7_user_brl || 0;
      acc.user_commission_brl += row.user_commission_brl || 0;
      acc.spend_brl += row.spend_brl || 0;
      acc.meta_conversations += row.meta_conversations || 0;
      Array.from(row.ads || []).forEach((ad) => acc.ads.add(ad));
      if (row.campaign_name || row.campaign_id) acc.campaigns.add(row.campaign_id || row.campaign_name);
      Array.from(row.cohort_dates || []).forEach((date) => acc.cohorts.add(`${row.campaign_key || row.campaign_id || row.campaign_name}|||${date}`));
      return acc;
    },
    {
      leads: 0,
      resolved: 0,
      joinads_rows: 0,
      impressions: 0,
      visible_window_impressions: 0,
      clicks: 0,
      revenue_usd: 0,
      revenue_brl: 0,
      d0_brl: 0,
      d1_brl: 0,
      d2_brl: 0,
      d3_brl: 0,
      d4_brl: 0,
      d5_brl: 0,
      d6_brl: 0,
      d7_brl: 0,
      d0_user_brl: 0,
      d1_user_brl: 0,
      d2_user_brl: 0,
      d3_user_brl: 0,
      d4_user_brl: 0,
      d5_user_brl: 0,
      d6_user_brl: 0,
      d7_user_brl: 0,
      user_commission_brl: 0,
      spend_brl: 0,
      meta_conversations: 0,
      campaigns: new Set(),
      cohorts: new Set(),
      ads: new Set(),
    }
  );
  campaignLtvTotals.roas_d0 =
    campaignLtvTotals.spend_brl > 0
      ? campaignLtvTotals.d0_brl / campaignLtvTotals.spend_brl
      : null;
  campaignLtvTotals.roas_d1 =
    campaignLtvTotals.spend_brl > 0
      ? campaignLtvTotals.d1_brl / campaignLtvTotals.spend_brl
      : null;
  campaignLtvTotals.roas_d2 =
    campaignLtvTotals.spend_brl > 0
      ? campaignLtvTotals.d2_brl / campaignLtvTotals.spend_brl
      : null;
  campaignLtvTotals.roas_d3 =
    campaignLtvTotals.spend_brl > 0
      ? campaignLtvTotals.d3_brl / campaignLtvTotals.spend_brl
      : null;
  campaignLtvTotals.roas_d4 =
    campaignLtvTotals.spend_brl > 0
      ? campaignLtvTotals.d4_brl / campaignLtvTotals.spend_brl
      : null;
  campaignLtvTotals.roas_d5 =
    campaignLtvTotals.spend_brl > 0
      ? campaignLtvTotals.d5_brl / campaignLtvTotals.spend_brl
      : null;
  campaignLtvTotals.roas_d6 =
    campaignLtvTotals.spend_brl > 0
      ? campaignLtvTotals.d6_brl / campaignLtvTotals.spend_brl
      : null;
  campaignLtvTotals.roas_d7 =
    campaignLtvTotals.spend_brl > 0
      ? campaignLtvTotals.d7_brl / campaignLtvTotals.spend_brl
      : null;
  campaignLtvTotals.roas =
    campaignLtvTotals.spend_brl > 0
      ? campaignLtvTotals.revenue_brl / campaignLtvTotals.spend_brl
      : null;
  campaignLtvTotals.profit_brl = campaignLtvTotals.revenue_brl - campaignLtvTotals.spend_brl;
  campaignLtvTotals.joinads_impressions_per_conversation =
    campaignLtvTotals.meta_conversations > 0 && hasDailyLeadRevenue
      ? campaignLtvTotals.visible_window_impressions / campaignLtvTotals.meta_conversations
      : null;
  campaignLtvTotals.ecpm =
    campaignLtvTotals.impressions > 0
      ? (campaignLtvTotals.revenue_usd / campaignLtvTotals.impressions) * 1000
      : null;
  const ltvDiagnostics = {
    appBuild: APP_VERSION_BUILD,
    allTermRows: allTermRows.length,
    candidateTermRows: candidateTermRows.length,
    leadTermRows: leadTermRows.length,
    leadDailyRows: leadDailyRows.length,
    resolvedLeadRows: normalizedLeadRows.length,
    unresolvedLeadIds: unresolvedLeadIds.slice(0, 30),
    termSamples: allTermRows.slice(0, 20).map((row) => ({
      value: row.custom_value || "",
      domain: row.domain || row.name || "",
      revenueClient: row.revenue_client ?? row.earnings_client ?? null,
      impressions: row.impressions ?? null,
      clicks: row.clicks ?? null,
    })),
    candidateSamples: candidateTermRows.slice(0, 20).map((row) => ({
      value: row.custom_value || "",
      domain: row.domain || row.name || "",
      revenueClient: row.revenue_client ?? row.earnings_client ?? null,
      impressions: row.impressions ?? null,
      clicks: row.clicks ?? null,
    })),
    resolvedLeadSamples: normalizedLeadRows.slice(0, 20).map((lead) => ({
      leadId: lead.leadId,
      firstSeenAt: lead.firstSeenAt,
      adId: lead.adId,
      sourceKey: lead.sourceKey,
      pageId: lead.pageId || "",
    })),
    resolveRequest: diagnostics.messenleadLeadDiagnostics || {},
  };
  const formatCampaignLtvCohorts = (row) => {
    const dates = Array.from(row.cohort_dates || []).sort();
    if (!dates.length) return "-";
    if (dates.length === 1) return dates[0];
    return `${dates[0]} a ${dates[dates.length - 1]}`;
  };
  const attributionLabel = (levels) => {
    const list = Array.from(levels || []);
    if (!list.length) return "-";
    return list
      .map((level) =>
        level === "utm_content_ad_id"
          ? "ad_id"
          : level === "messenlead_source_key"
          ? "Messenlead"
          : level === "utm_content"
          ? "utm_content"
          : level === "utm_campaign"
          ? "utm_campaign"
          : level
      )
      .join(", ");
  };
  const formatMessageBudget = (adset) => {
    if (!adset) return "-";
    if (adset.dailyBudgetBrl != null) {
      return `Conjunto: ${currencyBRL.format(adset.dailyBudgetBrl)} / dia`;
    }
    if (adset.lifetimeBudgetBrl != null) {
      return `Conjunto: ${currencyBRL.format(adset.lifetimeBudgetBrl)} (vitalicio)`;
    }
    if (adset.campaignDailyBudgetBrl != null) {
      return `Campanha: ${currencyBRL.format(adset.campaignDailyBudgetBrl)} / dia`;
    }
    if (adset.campaignLifetimeBudgetBrl != null) {
      return `Campanha: ${currencyBRL.format(adset.campaignLifetimeBudgetBrl)} (vitalicio)`;
    }
    return "Sem valor definido";
  };
  const getMessageBudgetTarget = (adset) => {
    if (!adset?.id) return { id: "", scope: "adset" };
    if (adset.dailyBudgetBrl != null || adset.lifetimeBudgetBrl != null || !adset.campaignId) {
      return { id: adset.id, scope: "adset" };
    }
    if (adset.campaignDailyBudgetBrl != null || adset.campaignLifetimeBudgetBrl != null) {
      return { id: adset.campaignId, scope: "campaign" };
    }
    return { id: adset.id, scope: "adset" };
  };
  const getMessageBudgetInput = (adset) => {
    if (!adset?.id) return "";
    if (messageBudgetInputs[adset.id] !== undefined) {
      return messageBudgetInputs[adset.id];
    }
    if (adset.dailyBudgetBrl != null) return adset.dailyBudgetBrl.toFixed(2);
    if (adset.campaignDailyBudgetBrl != null) return adset.campaignDailyBudgetBrl.toFixed(2);
    return "";
  };
  const getMessageBidStrategy = (adset) =>
    messageBidStrategies[adset?.id] ||
    adset?.bidStrategy ||
    (adset?.bidAmountBrl != null
      ? BID_STRATEGY_WITH_BID
      : BID_STRATEGY_WITHOUT_BID);
  const getMessageBidInput = (adset) => {
    if (!adset?.id) return "";
    if (messageBidInputs[adset.id] !== undefined) {
      return messageBidInputs[adset.id];
    }
    return adset.bidAmountBrl != null ? adset.bidAmountBrl.toFixed(2) : "";
  };
  const getCostCapEligibility = (adsets) => {
    const list = Array.isArray(adsets) ? adsets : [];
    const goals = Array.from(
      new Set(
        list
          .map((adset) => String(adset?.optimizationGoal || "").trim().toUpperCase())
          .filter(Boolean)
      )
    );
    if (!list.length) {
      return {
        status: "blocked",
        label: "Sem conjunto carregado",
        detail: "Nao ha conjunto suficiente para validar Meta de custo.",
      };
    }
    if (goals.length > 1) {
      return {
        status: "blocked",
        label: "Otimizacoes diferentes",
        detail:
          "A Meta exige que todos os conjuntos da campanha usem a mesma otimizacao de veiculacao.",
      };
    }
    if (!goals.length) {
      return {
        status: "unknown",
        label: "Otimizacao nao carregada",
        detail:
          "A Meta so permite Meta de custo para algumas otimizacoes. Se recusar, ajuste a otimizacao no Gerenciador.",
      };
    }
    return {
      status: "check",
      label: goals[0],
      detail:
        "A elegibilidade final e validada pela Meta. Se recusar, esta otimizacao nao aceita Meta de custo.",
    };
  };
  const engagementRows = safeRows.filter((row) => isEngagementObjective(row.objective));
  const messageRows = safeRows.filter((row) => isMessageMetricsRow(row));
  const trafficMessengerRows = safeRows.filter(
    (row) => String(row.objective || "").toUpperCase() === "OUTCOME_TRAFFIC" && hasMessengerSignal(row)
  );
  const withJoinadsRows = safeRows.filter((row) => row.joinads_matched);
  const messageWithJoinadsRows = messageRows.filter((row) => row.joinads_matched);
  const rowsWithRevenue = safeRows.filter((row) => toNumber(row.revenue_client_value) !== 0);
  const dataLevelCounts = safeRows.reduce((acc, row) => {
    const key = row.data_level || "sem_data_level";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const objectiveCounts = safeRows.reduce((acc, row) => {
    const key = row.objective || "sem_objective";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const sampleRows = safeRows.slice(0, 8).map((row) => ({
    campaign: row.campaign_name || row.campaign_id || "-",
    ad: row.ad_name || row.ad_id || "-",
    objective: row.objective || "-",
    matched: !!row.joinads_matched,
    data_level: row.data_level || "-",
    meta_impressions: toNumber(row.meta_impressions_value || row.impressions),
    conversations_started: toNumber(row.messaging_conversations_started),
    meta_cost_per_result: toNumber(row.cost_per_result_value),
    cost_per_conversation: toNumber(row.messaging_cost_per_conversation),
    action_types: Array.isArray(row.actions)
      ? row.actions.map((action) => action?.action_type).filter(Boolean)
      : [],
    joinads_clicks: toNumber(row.clicks_joinads),
    revenue: toNumber(row.revenue_client_value),
    revenue_brl: toNumber(row.revenue_client_brl_value),
    spend_brl: toNumber(row.spend_value || row.spend),
    roas: row.roas_joinads || "-",
    source: row.joinads_source_value || "-",
  }));
  const debugPayload = {
    totalRows: safeRows.length,
    engagementRows: engagementRows.length,
    messageRows: messageRows.length,
    trafficMessengerRows: trafficMessengerRows.length,
    campaignRows: campaignRows.length,
    withJoinadsRows: withJoinadsRows.length,
    messageWithJoinadsRows: messageWithJoinadsRows.length,
    rowsWithRevenue: rowsWithRevenue.length,
    dataLevelCounts,
    objectiveCounts,
    rawJoinads: {
      utmContentRows: diagnostics.joinadsContentRowsCount || 0,
      utmCampaignRows: diagnostics.joinadsCampaignRowsCount || 0,
      utmUserRows: diagnostics.joinadsUserRowsCount || 0,
      utmTermRows: Array.isArray(termRows) ? termRows.length : 0,
      utmTermLeadRows: leadTermRows.length,
      utmTermLeadDailyRows: leadDailyRows.length,
      utmMediumRows: Array.isArray(mediumRows) ? mediumRows.length : 0,
      utmMediumMessengerRows: messengerMediumRows.length,
      utmMediumOrganicRows: organicMediumRows.length,
    },
    superFilterReport: diagnostics.joinadsSuperFilterDiagnostics || {},
    meta: diagnostics.metaDiagnostics || {},
    messageFilter: {
      sourceRows: diagnostics.messageSourceRowsCount || safeRows.length,
      note: "Métricas Mensagens ignora filtro de domínio por URL porque campanhas Messenger apontam para chat, não para o domínio do blog.",
    },
    messenlead: {
      sources: diagnostics.messenleadSourcesCount || 0,
      unresolved: diagnostics.messenleadUnresolved || [],
      leads: Array.isArray(leadRows) ? leadRows.length : 0,
      unresolvedLeadIds,
    },
    samples: sampleRows,
  };
  const blockDiagnosticRows = (Array.isArray(joinadsDetailRows) ? joinadsDetailRows : [])
    .map((row, index) => {
      const source = String(row.custon_value ?? row.custom_value ?? "");
      const directEntries = [
        ["ad_unit", row.ad_unit], ["adUnit", row.adUnit], ["AD_UNIT", row.AD_UNIT],
        ["ad_unit_name", row.ad_unit_name], ["AD_UNIT_NAME", row.AD_UNIT_NAME],
        ["block", row.block], ["placement", row.placement],
      ].filter(([, value]) => value != null && String(value).trim());
      const searchable = Object.values(row || {}).filter((value) => typeof value === "string").join(" ");
      const inferredMatch = searchable.match(/(?:^|[_\s-])(Anchor|Content\s*[1-9]|Interstitial|Rewards?)(?:[_\s-]|$)/i);
      const direct = directEntries[0];
      const resolved = direct ? String(direct[1]) : inferredMatch ? inferredMatch[1].replace(/\s+/g, "") : "";
      return {
        index: index + 1,
        date: row.date || "-",
        source: source || "-",
        isSource: normalizeKey(source).startsWith("src_"),
        country: row.country || row.COUNTRY || "-",
        rawField: direct?.[0] || "-",
        rawValue: direct ? String(direct[1]) : "-",
        resolved: resolved || "Sem bloco informado",
        reason: direct
          ? `Recebido diretamente em ${direct[0]}`
          : inferredMatch
          ? "Inferido a partir de outro texto da linha"
          : "A API nao enviou campo de bloco nem texto reconhecivel",
        keys: Object.keys(row || {}).sort().join(", "),
        raw: row,
      };
    })
    .sort((a, b) => Number(b.resolved === "Sem bloco informado") - Number(a.resolved === "Sem bloco informado"));
  const blockDiagnosticMissing = blockDiagnosticRows.filter((row) => row.resolved === "Sem bloco informado").length;
  const blockDiagnosticDirect = blockDiagnosticRows.filter((row) => row.rawField !== "-").length;
  const blockDiagnosticInferred = blockDiagnosticRows.length - blockDiagnosticDirect - blockDiagnosticMissing;
  const keyValueCountryDiagnostic = diagnostics?.joinadsSuperFilterDiagnostics?.keyValueCountry || {};
  const advertiserDiagnosticRows = (Array.isArray(advertiserRows) ? advertiserRows : []).map((row, index) => ({
    index: index + 1,
    date: row.DATE || row.date || "-",
    domain: row.DOMAIN || row.domain || "-",
    campaign: row.CUSTOM_CRITERIA_VALUE || row.custom_value || row._requested_utm_campaign || "-",
    advertiser: row.ADVERTISER || row.advertiser || "Nao informado",
    impressions: toNumber(row.AD_EXCHANGE_LINE_ITEM_LEVEL_IMPRESSIONS ?? row.impressions),
    clicks: toNumber(row.AD_EXCHANGE_LINE_ITEM_LEVEL_CLICKS ?? row.clicks),
    ctr: toNumber(row.AD_EXCHANGE_LINE_ITEM_LEVEL_CTR ?? row.ctr),
    revenue: toNumber(row.AD_EXCHANGE_LINE_ITEM_LEVEL_REVENUE ?? row.revenue),
    ecpm: toNumber(row.AD_EXCHANGE_LINE_ITEM_LEVEL_AVERAGE_ECPM ?? row.ecpm),
    activeView: toNumber(row.AD_EXCHANGE_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS_RATE ?? row.active_view),
    raw: row,
  })).sort((a, b) => b.revenue - a.revenue || b.impressions - a.impressions);
  return html`
    <main className="grid">
      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">Mensagens</span>
            <h2 className="section-title">Metricas Mensagens</h2>
          </div>
          <div className="inline-actions">
            <span className="chip neutral">${campaignRows.length} campanhas de mensagem</span>
            <button
              className="primary"
              onClick=${exportMessagesExcel}
              disabled=${safeRows.length === 0 && joinadsDetailRows.length === 0}
              title="Baixa o cruzamento Meta, Messenlead e JoinAds no periodo selecionado"
            >
              Baixar Excel
            </button>
          </div>
        </div>
        ${!showUserCommission && metaTaxSettings.metaTaxEnabled !== false
          ? html`<div className="alert info" style=${{ marginBottom: "14px" }}>
              Custo real Meta por gross-up: gasto de mídia ÷ (1 − ${toNumber(metaTaxSettings.metaTaxRatePercent).toFixed(2)}%) a partir de
              ${metaTaxSettings.metaTaxEffectiveDate || "2026-01-01"}.
              ${metaTaxSettings.metaTaxMode === "included" ? "O spend da API está configurado como já tributado." : "O spend da API está configurado como líquido."}
            </div>`
          : null}
        <div className="table-wrapper scroll-x">
          <table>
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Impressoes Meta</th>
                <th>CTR Meta</th>
                <th>Conversas iniciadas</th>
                ${showUserCommission
                  ? null
                  : html`
                      <th>Custo por resultado Meta</th>
                      <th>Custo por conversa</th>
                      <th>Receita por conversa</th>
                      <th>Lucro por conversa</th>
                    `}
                <th>Imp. JoinAds</th>
                <th>Imp. JoinAds / conversa</th>
                <th>Visitas / conversa</th>
                <th>Cliques JoinAds</th>
                ${showUserCommission ? null : html`<th>Gasto Meta total</th>`}
                ${showUserCommission
                  ? html`<th>Lucro do usuario</th>`
                  : html`
                      <th>Receita USD</th>
                      <th>Receita BRL</th>
                      <th>ROAS</th>
                      <th>Lucro Op.</th>
                      <th>Margem</th>
                    `}
                <th>${label}</th>
                ${allowBidControl
                  ? html`
                      <th>Orcamento atual</th>
                      <th>Novo orcamento</th>
                      <th>Bid atual</th>
                      <th>Novo bid</th>
                    `
                  : null}
                <th>Atribuicao</th>
              </tr>
            </thead>
            <tbody>
              ${campaignRows.length === 0
                ? html`<tr><td colSpan=${showUserCommission ? 11 : allowBidControl ? 24 : 20} className="muted">Sem campanhas de mensagem para o periodo.</td></tr>`
                : campaignRows.map((row) => {
                  const userCommission = showUserCommission
                    ? calculateUserCommission(row.revenue_brl, commissionPercent)
                    : null;
                  const adsets = Array.from(row.adsets.values());
                  const singleAdset = adsets.length === 1 ? adsets[0] : null;
                  const bidStrategy = getMessageBidStrategy(singleAdset);
                  const requiresBidValue = bidStrategy !== BID_STRATEGY_WITHOUT_BID;
                  const budgetTarget = getMessageBudgetTarget(singleAdset);
                  const costCapEligibility = getCostCapEligibility(adsets);
                  const costCapBlocked =
                    bidStrategy === BID_STRATEGY_COST_CAP &&
                    costCapEligibility.status === "blocked";
                  const budgetBusy = budgetTarget.id && budgetLoading?.[budgetTarget.id];
                  const bidBusy = singleAdset && bidLoading?.[singleAdset.id];
                  return html`
                    <tr key=${row.campaign_name}>
                      <td>${row.campaign_name || "-"}</td>
                      <td>${number.format(row.meta_impressions || 0)}</td>
                      <td>${row.ctr_meta != null ? `${row.ctr_meta.toFixed(2)}%` : "-"}</td>
                      <td>${row.conversations ? number.format(row.conversations) : "-"}</td>
                      ${showUserCommission
                        ? null
                        : html`
                            <td>${row.meta_cost_per_result != null ? currencyBRL.format(row.meta_cost_per_result) : "-"}</td>
                            <td>${row.cost_per_conversation != null ? currencyBRL.format(row.cost_per_conversation) : "-"}</td>
                            <td>${row.revenue_per_conversation != null ? currencyBRL.format(row.revenue_per_conversation) : "-"}</td>
                            <td>${row.profit_per_conversation != null ? html`<span className=${row.profit_per_conversation >= 0 ? "pos-pill" : "neg-pill"}>${currencyBRL.format(row.profit_per_conversation)}</span>` : "-"}</td>
                          `}
                      <td>${number.format(row.joinads_impressions || 0)}</td>
                      <td>${row.joinads_impressions_per_conversation != null ? row.joinads_impressions_per_conversation.toFixed(2) : "-"}</td>
                      <td>${row.visits_per_conversation != null ? row.visits_per_conversation.toFixed(2) : "-"}</td>
                      <td>${number.format(row.joinads_clicks || 0)}</td>
                      ${showUserCommission ? null : html`<td>
                        ${currencyBRL.format(row.spend_brl || 0)}
                        <div className="muted small">mídia ${currencyBRL.format(row.media_spend_brl || 0)} · impostos ${currencyBRL.format(row.meta_tax_brl || 0)}</div>
                      </td>`}
                      ${showUserCommission
                        ? html`<td>${userCommission != null ? currencyBRL.format(userCommission) : "-"}</td>`
                        : html`
                            <td>${currencyUSD.format(row.revenue_usd || 0)}</td>
                            <td>${currencyBRL.format(row.revenue_brl || 0)}</td>
                            <td>${row.roas != null ? html`<span className=${row.roas >= 1 ? "pos" : "neg"}>${row.roas.toFixed(2)}x</span>` : "-"}</td>
                            <td><span className=${row.profit_brl > 0 ? "pos" : row.profit_brl < 0 ? "neg" : ""}>${currencyBRL.format(row.profit_brl || 0)}</span></td>
                            <td>${row.margin_pct != null ? html`<span className=${row.margin_pct >= 0 ? "pos" : "neg"}>${row.margin_pct.toFixed(1)}%</span>` : "-"}</td>
                          `}
                      <td>${row.ecpm != null ? currencyUSD.format(row.ecpm) : "-"}</td>
                      ${allowBidControl
                        ? html`
                            <td>
                              ${singleAdset
                                ? html`
                                    <div>${formatMessageBudget(singleAdset)}</div>
                                    <div className="muted small">${singleAdset.name || singleAdset.id}</div>
                                  `
                                : adsets.length > 1
                                ? html`<span className="muted">Multiplos conjuntos</span>`
                                : html`<span className="muted">Indisponivel</span>`}
                            </td>
                            <td>
                              ${singleAdset
                                ? html`
                                    <div className="budget-cell">
                                      <div className="budget-actions">
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          placeholder="R$ diario"
                                          value=${getMessageBudgetInput(singleAdset)}
                                          onInput=${(e) =>
                                            setMessageBudgetInputs((prev) => ({
                                              ...prev,
                                              [singleAdset.id]: e.target.value,
                                            }))}
                                          onKeyDown=${(e) => {
                                            if (e.key === "Enter") {
                                              onBudgetUpdate?.(
                                                budgetTarget.id,
                                                getMessageBudgetInput(singleAdset),
                                                budgetTarget.scope
                                              );
                                            }
                                          }}
                                        />
                                        <button
                                          className="ghost small"
                                          disabled=${budgetBusy}
                                          onClick=${() =>
                                            onBudgetUpdate?.(
                                              budgetTarget.id,
                                              getMessageBudgetInput(singleAdset),
                                              budgetTarget.scope
                                            )}
                                        >
                                          ${budgetBusy ? "..." : "Salvar"}
                                        </button>
                                      </div>
                                      <div className="muted small">
                                        ${budgetTarget.scope === "campaign"
                                          ? "Altera o orcamento diario da campanha."
                                          : "Altera o orcamento diario do conjunto."}
                                      </div>
                                    </div>
                                  `
                                : html`<span className="muted small">Controle indisponivel</span>`}
                            </td>
                            <td>
                              ${singleAdset
                                ? html`
                                    <div>${formatBidStrategy(singleAdset.bidStrategy || bidStrategy)}</div>
                                    <div className="muted small">
                                      ${singleAdset.bidAmountBrl != null
                                        ? currencyBRL.format(singleAdset.bidAmountBrl)
                                        : "Sem valor definido"}
                                    </div>
                                    <div className="muted small">
                                      Otimizacao: ${singleAdset.optimizationGoal || "nao carregada"}
                                    </div>
                                  `
                                : adsets.length > 1
                                ? html`<div className="budget-meta">
                                    <span className="muted">Multiplos conjuntos</span>
                                    <span className="muted small">${costCapEligibility.detail}</span>
                                  </div>`
                                : html`<span className="muted">Indisponivel</span>`}
                            </td>
                            <td>
                              ${singleAdset
                                ? html`
                                    <div className="budget-cell">
                                      <select
                                        value=${bidStrategy}
                                        onChange=${(e) =>
                                          setMessageBidStrategies((prev) => ({
                                            ...prev,
                                            [singleAdset.id]: e.target.value,
                                          }))}
                                      >
                                        <option value=${BID_STRATEGY_WITH_BID}>Limite de lance</option>
                                        <option
                                          value=${BID_STRATEGY_COST_CAP}
                                          disabled=${costCapEligibility.status === "blocked"}
                                        >
                                          Meta de custo
                                        </option>
                                        <option value=${BID_STRATEGY_WITHOUT_BID}>Sem limite</option>
                                      </select>
                                      <div className="budget-actions">
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          placeholder="R$"
                                          disabled=${!requiresBidValue}
                                          value=${getMessageBidInput(singleAdset)}
                                          onInput=${(e) =>
                                            setMessageBidInputs((prev) => ({
                                              ...prev,
                                              [singleAdset.id]: e.target.value,
                                            }))}
                                        />
                                        <button
                                          className="ghost small"
                                          disabled=${bidBusy || costCapBlocked}
                                          onClick=${() =>
                                            onBidUpdate?.(
                                              singleAdset.id,
                                              requiresBidValue
                                                ? getMessageBidInput(singleAdset)
                                                : "",
                                              bidStrategy,
                                              {
                                                campaignId: singleAdset.campaignId,
                                                cbo: budgetTarget.scope === "campaign",
                                              }
                                            )}
                                        >
                                          ${bidBusy ? "..." : "Salvar"}
                                        </button>
                                      </div>
                                      <div className=${`muted small ${costCapBlocked ? "danger-text" : ""}`}>
                                        ${bidStrategy === BID_STRATEGY_COST_CAP
                                          ? costCapEligibility.detail
                                          : `Otimizacao: ${costCapEligibility.label}`}
                                      </div>
                                      ${bidFeedback?.[singleAdset.id]
                                        ? html`<div className=${`muted small ${bidFeedback[singleAdset.id].ok ? "pos" : "danger-text"}`}>
                                            ${bidFeedback[singleAdset.id].message}
                                          </div>`
                                        : null}
                                    </div>
                                  `
                                : html`<span className="muted small">Controle indisponivel</span>`}
                            </td>
                          `
                        : null}
                      <td>
                        ${attributionLabel(row.attributionLevels)}
                        ${row.sourceValues.size
                          ? html`<div className="muted small">${Array.from(row.sourceValues).slice(0, 2).join(", ")}</div>`
                          : null}
                      </td>
                    </tr>
                  `;
                })}
              ${campaignRows.length
                ? html`
                    <tr className="summary-row">
                      <td><strong>Total</strong></td>
                      <td><strong>${number.format(totalsRow.meta_impressions)}</strong></td>
                      <td><strong>${totalsRow.ctr_meta != null ? `${totalsRow.ctr_meta.toFixed(2)}%` : "-"}</strong></td>
                      <td><strong>${totalsRow.conversations ? number.format(totalsRow.conversations) : "-"}</strong></td>
                      ${showUserCommission
                        ? null
                        : html`
                            <td><strong>${totalsRow.meta_cost_per_result != null ? currencyBRL.format(totalsRow.meta_cost_per_result) : "-"}</strong></td>
                            <td><strong>${totalsRow.cost_per_conversation != null ? currencyBRL.format(totalsRow.cost_per_conversation) : "-"}</strong></td>
                            <td><strong>${totalsRow.revenue_per_conversation != null ? currencyBRL.format(totalsRow.revenue_per_conversation) : "-"}</strong></td>
                            <td><strong>${totalsRow.profit_per_conversation != null ? currencyBRL.format(totalsRow.profit_per_conversation) : "-"}</strong></td>
                          `}
                      <td><strong>${number.format(totalsRow.joinads_impressions)}</strong></td>
                      <td><strong>${totalsRow.joinads_impressions_per_conversation != null ? totalsRow.joinads_impressions_per_conversation.toFixed(2) : "-"}</strong></td>
                      <td><strong>${totalsRow.visits_per_conversation != null ? totalsRow.visits_per_conversation.toFixed(2) : "-"}</strong></td>
                      <td><strong>${number.format(totalsRow.joinads_clicks)}</strong></td>
                      ${showUserCommission ? null : html`<td><strong>${currencyBRL.format(totalsRow.spend_brl)}</strong></td>`}
                      ${showUserCommission
                        ? html`<td><strong>${currencyBRL.format(calculateUserCommission(totalsRow.revenue_brl, commissionPercent) || 0)}</strong></td>`
                        : html`
                            <td><strong>${currencyUSD.format(totalsRow.revenue_usd)}</strong></td>
                            <td><strong>${currencyBRL.format(totalsRow.revenue_brl)}</strong></td>
                            <td><strong>${totalsRow.roas != null ? `${totalsRow.roas.toFixed(2)}x` : "-"}</strong></td>
                            <td><strong>${currencyBRL.format(totalsRow.profit_brl)}</strong></td>
                            <td><strong>${totalsRow.margin_pct != null ? `${totalsRow.margin_pct.toFixed(1)}%` : "-"}</strong></td>
                          `}
                      <td><strong>${totalsRow.ecpm != null ? currencyUSD.format(totalsRow.ecpm) : "-"}</strong></td>
                      ${allowBidControl ? html`<td></td><td></td><td></td><td></td>` : null}
                      <td></td>
                    </tr>
                  `
                : null}
            </tbody>
          </table>
        </div>
      </section>
      ${showLtvTable
        ? html`
      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">LTV</span>
            <h2 className="section-title">LTV Mensagens</h2>
          </div>
          <div className="chip-group">
            <span className="chip neutral">${campaignLtvRows.length} campanhas</span>
            <span className="chip neutral">${campaignLtvTotals.cohorts.size} coortes</span>
            <span className="chip neutral">${allTermRows.length} linhas utm_term</span>
            <span className="chip neutral">${candidateTermRows.length} candidatos</span>
            <span className="chip neutral">${leadLtvRows.length} leads com utm_term</span>
            ${ltvWindowStart && ltvWindowEnd
              ? html`<span className="chip neutral">janela LTV ${ltvWindowStart} a ${ltvWindowEnd}</span>`
              : null}
            <span className="chip neutral">${normalizedLeadRows.length} leads resolvidos Evo</span>
            ${unresolvedLeadIds.length
              ? html`<span className="chip warn">${unresolvedLeadIds.length} sem Messenlead</span>`
              : null}
            ${campaignLtvRows.length > campaignLtvVisibleRows.length
              ? html`<span className="chip warn">mostrando top ${campaignLtvVisibleRows.length}</span>`
              : null}
          </div>
        </div>
        <p className="muted small">
          Coorte real por <code>utm_term=lead_id</code>, agregada por campanha. Quando o filtro esta em hoje,
          a janela LTV tambem busca dias anteriores para preencher D0-D${maxVisibleLtvDay}; o <code>lead_id</code>
          continua sendo usado apenas como chave interna para ligar JoinAds ao Evo.
          ${hasDailyLeadRevenue
            ? html`<strong> ${leadDailyRows.length} linhas diarias carregadas.</strong>`
            : html`<strong> Sem linhas diarias de lead no periodo.</strong>`}
          ${candidateTermRows.length && !resolvedLeadIdSet.size
            ? html`<strong> Existem candidatos em utm_term, mas nenhum foi resolvido pelo Evo/Messenlead.</strong>`
            : null}
        </p>
        <div className="diagnostic-box" style=${{ marginBottom: "14px" }}>
          <div className="muted small" style=${{ marginBottom: "8px" }}>
            Diagnostico LTV. Copie este bloco se continuar aparecendo <strong>Sem campanha</strong>.
          </div>
          <pre className="debug-log">${JSON.stringify(ltvDiagnostics, null, 2)}</pre>
        </div>
        <div className="table-wrapper scroll-x">
          <table>
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Coortes</th>
                <th>Leads</th>
                <th>Anuncios</th>
                <th>${showUserCommission ? "Lucro D0" : "Receita D0"}</th>
                <th>${showUserCommission ? "Lucro D1" : "Receita D1"}</th>
                <th>${showUserCommission ? "Lucro D2" : "Receita D2"}</th>
                <th>${showUserCommission ? "Lucro D3" : "Receita D3"}</th>
                ${selectedLtvExtraDays.map(
                  (day) => html`<th>${showUserCommission ? `Lucro D${day}` : `Receita D${day}`}</th>`
                )}
                <th>${showUserCommission ? "Lucro total" : "Receita total"}</th>
                ${showUserCommission
                  ? null
                  : html`
                      <th>Gasto Meta</th>
                      <th>ROAS D0</th>
                      <th>ROAS D1</th>
                      <th>ROAS D2</th>
                      <th>ROAS D3</th>
                      ${selectedLtvExtraDays.map((day) => html`<th>ROAS D${day}</th>`)}
                      <th>ROAS total</th>
                      <th>Lucro</th>
                    `}
                <th>Imp. JoinAds</th>
                <th>Imp. JoinAds / conversa D${maxVisibleLtvDay}</th>
                <th>Cliques JoinAds</th>
                <th>${label}</th>
                <th>Status LTV</th>
              </tr>
            </thead>
            <tbody>
              ${campaignLtvVisibleRows.length
                ? campaignLtvVisibleRows.map(
                    (row) => html`
                      <tr>
                        <td>
                          <strong>${row.campaign_name || "-"}</strong>
                          ${row.campaign_id ? html`<div className="muted small">${row.campaign_id}</div>` : null}
                          ${row.domains.size
                            ? html`<div className="muted small">${Array.from(row.domains).slice(0, 2).join(", ")}</div>`
                            : null}
                        </td>
                        <td>
                          ${formatCampaignLtvCohorts(row)}
                          ${row.cohort_dates.size
                            ? html`<div className="muted small">${number.format(row.cohort_dates.size)} coorte${row.cohort_dates.size === 1 ? "" : "s"} acoplada${row.cohort_dates.size === 1 ? "" : "s"}</div>`
                            : null}
                          ${row.meta_conversations
                            ? html`<div className="muted small">${number.format(row.meta_conversations)} conversas Meta</div>`
                            : null}
                        </td>
                        <td>
                          ${number.format(row.leads || 0)}
                          <div className="muted small">${number.format(row.resolved || 0)} com coorte</div>
                        </td>
                        <td>
                          ${number.format(row.ads.size || 0)}
                          ${row.ads.size
                            ? html`<div className="muted small">${Array.from(row.ads).slice(0, 2).join(", ")}</div>`
                            : null}
                        </td>
                        <td>${currencyBRL.format(showUserCommission ? row.d0_user_brl || 0 : row.d0_brl || 0)}</td>
                        <td>${currencyBRL.format(showUserCommission ? row.d1_user_brl || 0 : row.d1_brl || 0)}</td>
                        <td>${currencyBRL.format(showUserCommission ? row.d2_user_brl || 0 : row.d2_brl || 0)}</td>
                        <td>${currencyBRL.format(showUserCommission ? row.d3_user_brl || 0 : row.d3_brl || 0)}</td>
                        ${selectedLtvExtraDays.map(
                          (day) => html`
                            <td>
                              ${currencyBRL.format(
                                showUserCommission
                                  ? row[`d${day}_user_brl`] || 0
                                  : row[`d${day}_brl`] || 0
                              )}
                            </td>
                          `
                        )}
                        <td>
                          ${showUserCommission
                            ? currencyBRL.format(row.user_commission_brl || 0)
                            : currencyBRL.format(row.revenue_brl || 0)}
                        </td>
                        ${showUserCommission
                          ? null
                          : html`
                              <td>${currencyBRL.format(row.spend_brl || 0)}</td>
                              <td>${row.roas_d0 != null ? `${row.roas_d0.toFixed(2)}x` : "-"}</td>
                              <td>${row.roas_d1 != null ? `${row.roas_d1.toFixed(2)}x` : "-"}</td>
                              <td>${row.roas_d2 != null ? `${row.roas_d2.toFixed(2)}x` : "-"}</td>
                              <td>${row.roas_d3 != null ? `${row.roas_d3.toFixed(2)}x` : "-"}</td>
                              ${selectedLtvExtraDays.map(
                                (day) => html`
                                  <td>
                                    ${row[`roas_d${day}`] != null
                                      ? `${row[`roas_d${day}`].toFixed(2)}x`
                                      : "-"}
                                  </td>
                                `
                              )}
                              <td>${row.roas != null ? `${row.roas.toFixed(2)}x` : "-"}</td>
                              <td>${currencyBRL.format(row.profit_brl || 0)}</td>
                            `}
                        <td>${number.format(row.impressions || 0)}</td>
                        <td>
                          ${row.joinads_impressions_per_conversation != null
                            ? row.joinads_impressions_per_conversation.toFixed(2)
                            : "-"}
                        </td>
                        <td>${number.format(row.clicks || 0)}</td>
                        <td>${row.ecpm != null ? currencyUSD.format(row.ecpm) : "-"}</td>
                        <td>
                          <span className=${`chip ${row.resolved === row.leads ? "neutral" : "warn"}`}>
                            ${row.resolved === row.leads ? "coorte resolvida" : "coorte parcial"}
                          </span>
                          <div className="muted small">${number.format(row.joinads_rows || 0)} linhas JoinAds</div>
                        </td>
                      </tr>
                    `
                  )
                : html`
                    <tr>
                      <td colSpan=${showUserCommission ? 14 + selectedLtvExtraDays.length : 21 + selectedLtvExtraDays.length * 2}>
                        Sem <code>lead_id</code> resolvido em <code>utm_term</code> para o periodo.
                        Use <code>utm_term=${"{{entry.lead_id}}"}</code> nos links do Messenlead e confirme se o Evo esta resolvendo esses IDs.
                      </td>
                    </tr>
                  `}
              ${campaignLtvRows.length
                ? html`
                    <tr className="summary-row">
                      <td><strong>Total</strong></td>
                      <td><strong>${number.format(campaignLtvTotals.cohorts.size)} coortes</strong></td>
                      <td><strong>${number.format(campaignLtvTotals.leads)}</strong></td>
                      <td><strong>${number.format(campaignLtvTotals.ads.size)}</strong></td>
                      <td><strong>${currencyBRL.format(showUserCommission ? campaignLtvTotals.d0_user_brl || 0 : campaignLtvTotals.d0_brl || 0)}</strong></td>
                      <td><strong>${currencyBRL.format(showUserCommission ? campaignLtvTotals.d1_user_brl || 0 : campaignLtvTotals.d1_brl || 0)}</strong></td>
                      <td><strong>${currencyBRL.format(showUserCommission ? campaignLtvTotals.d2_user_brl || 0 : campaignLtvTotals.d2_brl || 0)}</strong></td>
                      <td><strong>${currencyBRL.format(showUserCommission ? campaignLtvTotals.d3_user_brl || 0 : campaignLtvTotals.d3_brl || 0)}</strong></td>
                      ${selectedLtvExtraDays.map(
                        (day) => html`
                          <td>
                            <strong>
                              ${currencyBRL.format(
                                showUserCommission
                                  ? campaignLtvTotals[`d${day}_user_brl`] || 0
                                  : campaignLtvTotals[`d${day}_brl`] || 0
                              )}
                            </strong>
                          </td>
                        `
                      )}
                      <td><strong>${showUserCommission ? currencyBRL.format(campaignLtvTotals.user_commission_brl || 0) : currencyBRL.format(campaignLtvTotals.revenue_brl || 0)}</strong></td>
                      ${showUserCommission
                        ? null
                        : html`
                            <td><strong>${currencyBRL.format(campaignLtvTotals.spend_brl || 0)}</strong></td>
                            <td><strong>${campaignLtvTotals.roas_d0 != null ? `${campaignLtvTotals.roas_d0.toFixed(2)}x` : "-"}</strong></td>
                            <td><strong>${campaignLtvTotals.roas_d1 != null ? `${campaignLtvTotals.roas_d1.toFixed(2)}x` : "-"}</strong></td>
                            <td><strong>${campaignLtvTotals.roas_d2 != null ? `${campaignLtvTotals.roas_d2.toFixed(2)}x` : "-"}</strong></td>
                            <td><strong>${campaignLtvTotals.roas_d3 != null ? `${campaignLtvTotals.roas_d3.toFixed(2)}x` : "-"}</strong></td>
                            ${selectedLtvExtraDays.map(
                              (day) => html`
                                <td>
                                  <strong>
                                    ${campaignLtvTotals[`roas_d${day}`] != null
                                      ? `${campaignLtvTotals[`roas_d${day}`].toFixed(2)}x`
                                      : "-"}
                                  </strong>
                                </td>
                              `
                            )}
                            <td><strong>${campaignLtvTotals.roas != null ? `${campaignLtvTotals.roas.toFixed(2)}x` : "-"}</strong></td>
                            <td><strong>${currencyBRL.format(campaignLtvTotals.profit_brl || 0)}</strong></td>
                          `}
                      <td><strong>${number.format(campaignLtvTotals.impressions)}</strong></td>
                      <td>
                        <strong>
                          ${campaignLtvTotals.joinads_impressions_per_conversation != null
                            ? campaignLtvTotals.joinads_impressions_per_conversation.toFixed(2)
                            : "-"}
                        </strong>
                      </td>
                      <td><strong>${number.format(campaignLtvTotals.clicks)}</strong></td>
                      <td><strong>${campaignLtvTotals.ecpm != null ? currencyUSD.format(campaignLtvTotals.ecpm) : "-"}</strong></td>
                      <td></td>
                    </tr>
                  `
                : null}
            </tbody>
          </table>
        </div>
      </section>
        `
        : null}
      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">JoinAds</span>
            <h2 className="section-title">Resumo</h2>
          </div>
          <div className="chip-group">
            <span className="chip neutral">${messengerMediumRows.length} messenger</span>
            <span className="chip neutral">${organicMediumRows.length} organic</span>
          </div>
        </div>
        <p className="muted small">
          ${pageScoped
            ? html`<strong>Filtro de Página ativo:</strong> os números abaixo usam a atribuição por
                campanha da página selecionada (não o total por <code>utm_medium</code>, que é global).`
            : html`Reconcilia <code>utm_medium</code> com <code>utm_campaign</code>. Somente
                <code>src_</code> recebe gasto Meta e impostos; <code>organic_</code> permanece com custo zero.`}
        </p>
        ${isTodayOnly
          ? html`<div className=${`alert ${domainTotalsWithoutUtmFilter.revenueUsd > 0 && messengerMedium.revenue_usd <= 0 ? "warn" : "info"}`} style=${{ marginBottom: "14px" }}>
              <strong>Atualização de hoje:</strong>
              <code>/earnings</code> retornou ${currencyUSD.format(domainTotalsWithoutUtmFilter.revenueUsd)} de receita cliente total do domínio;
              a visão segmentada por <code>utm_medium=messenger</code> retornou ${currencyUSD.format(messengerMedium.revenue_usd || 0)}.
              ${domainTotalsWithoutUtmFilter.revenueUsd > 0 && messengerMedium.revenue_usd <= 0
                ? " A JoinAds já publicou o total, mas ainda não publicou a segmentação UTM. O valor provisório não entra no ROAS das campanhas."
                : domainTotalsWithoutUtmFilter.revenueUsd <= 0
                ? " A própria resposta ao vivo da JoinAds ainda não trouxe receita para hoje."
                : " Os dois relatórios já possuem dados; diferenças podem representar outras origens do domínio."}
              ${earningsUsedSameDayFallback
                ? " A resposta ao vivo voltou vazia e o Dashboard preservou o último resultado positivo deste mesmo dia."
                : ""}
            </div>`
          : null}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Receita cliente do domínio (sem filtro UTM)</div>
            <${MetricInfo} text="Total retornado pelo endpoint /earnings para o domínio e período selecionados, sem filtrar utm_source, utm_medium ou utm_campaign. Inclui acessos com UTM, sem UTM, Messenger, orgânico e outras origens. É uma visão econômica do domínio e não entra automaticamente no ROAS por campanha." />
            <div className="metric-helper">${number.format(domainTotalsWithoutUtmFilter.impressions)} impressoes · ${number.format(domainTotalsWithoutUtmFilter.clicks)} cliques</div>
            <div className="metric-value">${currencyUSD.format(domainTotalsWithoutUtmFilter.revenueUsd)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Receita bruta do domínio (sem filtro UTM)</div>
            <${MetricInfo} text="Receita bruta total retornada em revenue/earnings pelo endpoint /earnings, antes do revshare da JoinAds, sem qualquer filtro UTM. É exibida apenas para auditoria e comparação; não entra no ROAS, lucro ou receita a receber." />
            <div className="metric-helper">Antes do revshare · somente auditoria</div>
            <div className="metric-value">${currencyUSD.format(domainTotalsWithoutUtmFilter.grossRevenueUsd)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Impressoes JoinAds</div>
            <${MetricInfo} text="Total de impressoes de anuncios JoinAds registradas com utm_medium=messenger no dominio e periodo. Inclui trafego atribuido, sem classificacao e organic_ do Evo." />
            <div className="metric-value">${number.format(messengerMedium.impressions || 0)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Cliques JoinAds</div>
            <${MetricInfo} text="Total de cliques nos anuncios JoinAds para utm_medium=messenger. Nao sao cliques do anuncio Meta; sao interacoes com os anuncios monetizados no site." />
            <div className="metric-value">${number.format(messengerMedium.clicks || 0)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Receita Messenger USD</div>
            <div className="metric-helper">Total utm_medium=messenger, antes da reconciliação</div>
            <${MetricInfo} text="Receita cliente em USD informada pela JoinAds para todo utm_medium=messenger, antes de separar src_, unknown_messenger e organic_. Usa revenue_client/earnings_client e nao aplica outro desconto de revshare." />
            <div className="metric-value">${currencyUSD.format(messengerMedium.revenue_usd || 0)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Receita orgânica externa USD</div>
            <div className="metric-helper">(utm_medium=organic)</div>
            <${MetricInfo} text="Receita cliente em USD das linhas cujo utm_medium e organic. Nao recebe gasto nem imposto Meta. E diferente do organic_ declarado pelo Evo dentro do Messenger." />
            <div className="metric-value">${currencyUSD.format(organicMedium.revenue_usd || 0)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Receita BRL</div>
            <${MetricInfo} text="Receita cliente de todo o Messenger convertida de USD para BRL pela cotacao exibida. Formula: receita cliente USD do Messenger x cambio USD/BRL." />
            <div className="metric-value">${currencyBRL.format(messengerMedium.revenue_brl || 0)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Gasto Meta total</div>
            <div className="metric-helper">Somente campanhas pagas; inclui impostos</div>
            <${MetricInfo} text="Custo total das campanhas Meta de mensagens. Soma gasto de midia e impostos Meta conforme aliquota, vigencia e modo configurados. Trafego organico nao recebe custo." />
            <div className="metric-value">${currencyBRL.format(messengerMedium.spend_brl || 0)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">ROAS atribuído</div>
            <div className="metric-helper">Receita src_ ligada às campanhas</div>
            <${MetricInfo} text="Indicador oficial por campanha. Formula: receita cliente BRL efetivamente ligada aos src_ resolvidos / gasto Meta total com impostos. Receita sem atribuicao nao entra no numerador." />
            <div className="metric-value">${totalsRow.roas != null ? `${totalsRow.roas.toFixed(2)}x` : "-"}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">ROAS econômico estimado</div>
            <div className="metric-helper">Messenger menos organic_; não distribui sobra por campanha</div>
            <${MetricInfo} text="Cenario de reconciliacao, nao ROAS atribuido. Considera a receita Messenger potencialmente paga, removendo organic_ declarado pelo Evo, e divide pelo mesmo gasto Meta total com impostos." />
            <div className="metric-value">${economicRoas != null ? `${economicRoas.toFixed(2)}x` : "-"}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Lucro atribuído</div>
            <${MetricInfo} text="Resultado comprovadamente atribuido. Formula: receita cliente BRL ligada aos src_ das campanhas - gasto Meta total com impostos." />
            <div className="metric-value">${currencyBRL.format(totalsRow.profit_brl || 0)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Lucro econômico estimado</div>
            <${MetricInfo} text="Cenario economico estimado. Formula: receita BRL potencialmente paga do Messenger - gasto Meta total com impostos. A sobra sem classificacao nao e distribuida entre campanhas." />
            <div className="metric-value">${currencyBRL.format(economicProfitBrl || 0)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Cobertura real da receita</div>
            <div className="metric-helper">src_ atribuído / Messenger potencialmente pago</div>
            <${MetricInfo} text="Percentual da receita potencialmente paga que foi ligada a campanhas. Formula: receita cliente atribuida aos src_ / receita Messenger potencialmente paga, excluindo organic_ declarado pelo Evo." />
            <div className=${`metric-value ${realRevenueCoverage != null && realRevenueCoverage < 0.9 ? "neg" : ""}`}>${realRevenueCoverage != null ? `${(realRevenueCoverage * 100).toFixed(1)}%` : "-"}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Cobertura real das impressões</div>
            <div className="metric-helper">Exclui organic_ do denominador</div>
            <${MetricInfo} text="Percentual das impressoes potencialmente pagas ligado a campanhas. Formula: impressoes atribuidas aos src_ / impressoes Messenger potencialmente pagas, excluindo organic_." />
            <div className=${`metric-value ${realImpressionCoverage != null && realImpressionCoverage < 0.9 ? "neg" : ""}`}>${realImpressionCoverage != null ? `${(realImpressionCoverage * 100).toFixed(1)}%` : "-"}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Messenger orgânico do Evo</div>
            <div className="metric-helper">organic_ · custo e imposto zero</div>
            <${MetricInfo} text="Receita marcada como organic_ pelo Evo. Essa marcacao ainda nao comprova origem organica; fica separada como evo_declared_organic. Nenhum gasto ou imposto Meta e atribuido diretamente a ela." />
            <div className="metric-value">${currencyUSD.format(campaignOriginTotals.evoOrganic.revenueUsd || 0)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Messenger sem classificação</div>
            <div className="metric-helper">${number.format(unclassifiedMessengerImpressions)} impressões</div>
            <${MetricInfo} text="Receita Messenger nao explicada por src_, por outras campanhas identificadas nem por organic_ do Evo. Pode conter perda de parametro, retorno direto ou trafego pago sem sinal suficiente." />
            <div className=${`metric-value ${unclassifiedMessengerRevenueUsd > 0 ? "neg" : ""}`}>${currencyUSD.format(unclassifiedMessengerRevenueUsd)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">${label}</div>
            <${MetricInfo} text="eCPM cliente do Messenger. Formula: receita cliente USD do Messenger / impressoes JoinAds do Messenger x 1.000. Nao usa a receita bruta." />
            <div className="metric-value">${messengerMedium.ecpm != null ? currencyUSD.format(messengerMedium.ecpm) : "-"}</div>
          </div>
        </div>
      </section>
      ${attributionAudit
        ? html`
          <section className="card wide">
            <div className="card-head">
              <div>
                <span className="eyebrow">Diagnostico</span>
                <h2 className="section-title">Auditoria de Atribuicao (funil Messenlead)</h2>
              </div>
              <span className=${`chip ${attributionAudit.leakPercent >= 20 ? "danger" : attributionAudit.leakPercent > 0 ? "warn" : "neutral"}`}>
                ${attributionAudit.leakPercent.toFixed(0)}% da receita nao atribuida
              </span>
            </div>
            <p className="muted small">
              Segue a ponte <code>src_</code> (JoinAds) -> <code>adId</code> (Messenlead) -> anuncio Meta.
              A "receita cliente nas src_" e tudo que a JoinAds reporta em campos <code>_client</code>
              para as <code>src_</code> do periodo; cada etapa
              abaixo mostra quanto vaza antes de entrar na tabela acima.
              ${attributionAudit.domainScoped
                ? html`<strong> Atencao: ha um dominio selecionado, entao src_ de outros dominios foram excluidas.</strong>`
                : null}
            </p>
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">Receita cliente JoinAds (src_)</div>
                <div className="metric-helper">${attributionAudit.gross.keys} src_ / ${attributionAudit.gross.rows} linhas</div>
                <div className="metric-value">${currencyBRL.format(attributionAudit.gross.revenueBrl || 0)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Receita atribuida</div>
                <div className="metric-helper">${attributionAudit.attributed.keys} src_ -> ${attributionAudit.matchedAds} anuncios</div>
                <div className="metric-value">${currencyBRL.format(attributionAudit.attributed.revenueBrl || 0)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Total nao atribuido</div>
                <div className="metric-helper">${attributionAudit.leakPercent.toFixed(1)}% da receita cliente em src_</div>
                <div className="metric-value">${currencyBRL.format(attributionAudit.leaked.revenueBrl || 0)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">src_ sem resolucao Messenlead</div>
                <div className="metric-helper">${attributionAudit.unresolved.keys} src_ (API reportou ${attributionAudit.apiUnresolvedKeys})</div>
                <div className="metric-value">${currencyBRL.format(attributionAudit.unresolved.revenueBrl || 0)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Anuncio fora do conjunto Meta</div>
                <div className="metric-helper">${attributionAudit.adNotLoaded.keys} src_ (periodo/conta ou paginacao)</div>
                <div className="metric-value">${currencyBRL.format(attributionAudit.adNotLoaded.revenueBrl || 0)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Sobreposicao com utm_content</div>
                <div className="metric-helper">${attributionAudit.contentConflict.keys} src_ tambem presentes em utm_content</div>
                <div className="metric-value">${currencyBRL.format(attributionAudit.contentConflict.revenueBrl || 0)}</div>
              </div>
            </div>
          </section>
        `
        : null}
      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">Diagnostico</span>
            <h2 className="section-title">Logs Metricas Mensagens</h2>
          </div>
          <div className="chip-group">
            <span className="chip neutral">${safeRows.length} linhas Meta</span>
            <span className="chip neutral">${messageRows.length} mensagens</span>
            <span className="chip neutral">${messageWithJoinadsRows.length} com JoinAds</span>
          </div>
        </div>
        <p className="muted small">
          Copie este bloco e me envie se as campanhas de mensagem nao aparecerem.
        </p>
        <pre className="debug-log">${JSON.stringify(debugPayload, null, 2)}</pre>
      </section>
      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">Diagnostico</span>
            <h2 className="section-title">Blocos recebidos da JoinAds</h2>
          </div>
          <div className="chip-group">
            <span className="chip neutral">${blockDiagnosticRows.length} linhas brutas</span>
            <span className="chip neutral">${blockDiagnosticDirect} com campo direto</span>
            <span className="chip neutral">${blockDiagnosticInferred} inferidas</span>
            <span className=${`chip ${blockDiagnosticMissing ? "danger" : "neutral"}`}>${blockDiagnosticMissing} sem bloco</span>
            ${keyValueCountryDiagnostic.error ? html`<span className="chip danger">erro no endpoint</span>` : null}
          </div>
        </div>
        <p className="muted small">
          Resposta bruta de <code>/key-value-country</code>. A coluna "Campos presentes" confirma exatamente
          quais propriedades a JoinAds enviou; nenhuma linha desta tabela depende da planilha exportada.
        </p>
        ${keyValueCountryDiagnostic.error
          ? html`<div className="status error"><strong>Falha ao consultar a JoinAds:</strong> ${keyValueCountryDiagnostic.error}</div>`
          : html`<p className="muted small">Endpoint confirmou ${keyValueCountryDiagnostic.rows ?? blockDiagnosticRows.length} linhas. Campos encontrados no lote: ${(keyValueCountryDiagnostic.fields || []).join(", ") || "nenhum"}.</p>`}
        ${keyValueCountryDiagnostic.cache
          ? html`<div className="status success"><strong>Origem por dia:</strong> banco definitivo: ${(keyValueCountryDiagnostic.cache.cacheHitDays || []).join(", ") || "nenhum"}; API JoinAds: ${(keyValueCountryDiagnostic.cache.apiDays || []).join(", ") || "nenhum"}; fallback do mesmo dia: ${(keyValueCountryDiagnostic.cache.sameDayFallbackDays || []).join(", ") || "nenhum"}; provisórios: ${(keyValueCountryDiagnostic.cache.provisionalDays || []).join(", ") || "nenhum"}.</div>`
          : null}
        <div className="table-wrapper scroll-x">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Data</th><th>src_ / custom_value</th><th>Pais</th><th>Campo bruto</th>
                <th>Valor bruto</th><th>Bloco resolvido</th><th>Diagnostico</th><th>Campos presentes</th><th>JSON bruto</th>
              </tr>
            </thead>
            <tbody>
              ${blockDiagnosticRows.length
                ? blockDiagnosticRows.slice(0, 200).map((row) => html`
                    <tr key=${`${row.index}:${row.source}`}>
                      <td>${row.index}</td><td>${row.date}</td>
                      <td><code>${row.source}</code>${row.isSource ? null : html`<div className="muted small">nao inicia com src_</div>`}</td>
                      <td>${row.country}</td><td><code>${row.rawField}</code></td><td>${row.rawValue}</td>
                      <td><span className=${`chip ${row.resolved === "Sem bloco informado" ? "danger" : "neutral"}`}>${row.resolved}</span></td>
                      <td>${row.reason}</td><td className="muted small">${row.keys}</td>
                      <td><details><summary>Ver JSON</summary><pre className="debug-log">${JSON.stringify(row.raw, null, 2)}</pre></details></td>
                    </tr>
                  `)
                : html`<tr><td colSpan="10" className="muted">Nenhuma linha foi recebida de /key-value-country para o periodo e dominio selecionados.</td></tr>`}
            </tbody>
          </table>
        </div>
        ${blockDiagnosticRows.length > 200 ? html`<p className="muted small">Exibindo as primeiras 200 de ${blockDiagnosticRows.length} linhas.</p>` : null}
      </section>
      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">Diagnostico</span>
            <h2 className="section-title">Anunciantes por campanha UTM</h2>
          </div>
          <div className="chip-group">
            <span className="chip neutral">${advertiserDiagnostics?.requested || 0} src_ solicitadas</span>
            <span className="chip neutral">${advertiserDiagnostics?.queried || 0} consultadas</span>
            <span className="chip neutral">${advertiserDiagnosticRows.length} linhas</span>
            ${(advertiserDiagnostics?.failures?.length || advertiserDiagnostics?.error) ? html`<span className="chip danger">falhas na API</span>` : null}
          </div>
        </div>
        <p className="muted small">
          Dados brutos do relatório <code>/report/advertiser/campaign</code>, consultado separadamente para cada
          <code>utm_campaign=src_*</code> encontrada no período.
        </p>
        ${advertiserDiagnostics?.tokenInvalid
          ? html`<div className="status error"><strong>Token JoinAds inválido ou expirado.</strong> Entre no painel JoinAds, use a opção de gerar um novo token e atualize <code>JOINADS_ACCESS_TOKEN</code>.</div>`
          : null}
        ${advertiserDiagnostics?.error
          ? html`<div className="status error"><strong>Erro ao consultar anunciantes:</strong> ${advertiserDiagnostics.error}</div>`
          : null}
        ${advertiserDiagnostics?.truncated
          ? html`<div className="status error">Foram encontradas ${advertiserDiagnostics.requested} campanhas. Esta carga diagnostica consultou ${advertiserDiagnostics.queried} para proteger o carregamento financeiro principal.</div>`
          : null}
        ${(advertiserDiagnostics?.failures || []).length
          ? html`<details><summary>${advertiserDiagnostics.failures.length} campanhas falharam</summary><pre className="debug-log">${JSON.stringify(advertiserDiagnostics.failures, null, 2)}</pre></details>`
          : null}
        <div className="table-wrapper scroll-x">
          <table>
            <thead><tr>
              <th>#</th><th>Data</th><th>Dominio</th><th>utm_campaign / src_</th><th>Anunciante</th>
              <th>Impressoes</th><th>Cliques</th><th>CTR</th><th>Receita USD</th><th>eCPM USD</th><th>Active View</th><th>JSON bruto</th>
            </tr></thead>
            <tbody>
              ${advertiserDiagnosticRows.length
                ? advertiserDiagnosticRows.slice(0, 500).map((row) => html`<tr key=${`${row.index}:${row.campaign}:${row.advertiser}`}>
                    <td>${row.index}</td><td>${row.date}</td><td>${row.domain}</td><td><code>${row.campaign}</code></td><td><strong>${row.advertiser}</strong></td>
                    <td>${number.format(row.impressions)}</td><td>${number.format(row.clicks)}</td><td>${row.ctr.toFixed(2)}%</td>
                    <td>${currencyUSD.format(row.revenue)}</td><td>${currencyUSD.format(row.ecpm)}</td><td>${row.activeView.toFixed(2)}%</td>
                    <td><details><summary>Ver JSON</summary><pre className="debug-log">${JSON.stringify(row.raw, null, 2)}</pre></details></td>
                  </tr>`)
                : html`<tr><td colSpan="12" className="muted">Nenhum anunciante retornado para as campanhas src_ deste período.</td></tr>`}
            </tbody>
          </table>
        </div>
        ${advertiserDiagnosticRows.length > 500 ? html`<p className="muted small">Exibindo as primeiras 500 de ${advertiserDiagnosticRows.length} linhas.</p>` : null}
      </section>
    </main>
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

function EarningsTable({ rows, usePmLabels = false }) {
  const unitLabel = performanceUnitLabel(usePmLabels);
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
              <th>${unitLabel}</th>
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
  pages = [],
  showPageFilter = false,
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
        ${showPageFilter
          ? html`
              <label className="field">
                <span>Página (Meta)</span>
                <select
                  value=${filters.pageId || ""}
                  onChange=${(e) =>
                    setFilters((p) => ({ ...p, pageId: e.target.value }))}
                  disabled=${!pages.length}
                >
                  <option value="">Todas as páginas</option>
                  ${pages.map(
                    (pg) => html`<option value=${pg.id} key=${pg.id}>${pg.name}</option>`
                  )}
                </select>
                ${!pages.length
                  ? html`<span className="muted small">Carregue os dados para listar as páginas.</span>`
                  : null}
              </label>
            `
          : null}
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
        <table className="top-urls">
          <thead>
            <tr>
              <th>#</th>
              <th>URL</th>
              <th>Impressoes</th>
              <th>Cliques</th>
              <th>CTR</th>
              <th>eCPM cliente</th>
              <th>Receita cliente</th>
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
                      <td className="url-cell" title=${row.url || ""}>
                        <div className="url">${row.url || "-"}</div>
                        ${row.domain ? html`<div className="muted small">${row.domain}</div>` : null}
                      </td>
                      <td>${number.format(row.impressions || 0)}</td>
                      <td>${number.format(row.clicks || 0)}</td>
                      <td>${`${Number(row.ctr || 0).toFixed(2)}%`}</td>
                      <td>${currencyUSD.format(row.ecpm_client || 0)}</td>
                      <td>${currencyUSD.format(row.revenue_client || 0)}</td>
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
  userRows = [],
  messenleadUnresolved = [],
}) {
  const superCount = Array.isArray(superRows) ? superRows.length : 0;
  const kvCount = Array.isArray(kvRows) ? kvRows.length : 0;
  const earningsCount = Array.isArray(earnings) ? earnings.length : 0;
  const topCount = Array.isArray(topUrls) ? topUrls.length : 0;
  const userCount = Array.isArray(userRows) ? userRows.length : 0;
  const unresolvedCount = Array.isArray(messenleadUnresolved) ? messenleadUnresolved.length : 0;

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
        <div className="metric-card">
          <div className="metric-label">utm_user (linhas)</div>
          <div className="metric-value">${userCount}</div>
          <div className="metric-helper">segmentacao de usuario</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">source_key sem resolucao</div>
          <div className="metric-value">${unresolvedCount}</div>
          <div className="metric-helper">Messenlead -> ad_id</div>
        </div>
      </div>

      ${unresolvedCount
        ? html`<div className="status warn">
            <strong>Source keys nao resolvidas:</strong>
            ${messenleadUnresolved.slice(0, 8).join(", ")}
            ${unresolvedCount > 8 ? ` e mais ${unresolvedCount - 8}` : ""}
          </div>`
        : null}

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
                        <td>${currencyUSD.format(row.revenue_client ?? 0)}</td>
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
                        <td>${currencyUSD.format(row.earnings_client ?? 0)}</td>
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
      acc.revenue += Number(row.revenue_client ?? row.earnings_client ?? 0);
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
                      <td>${currencyUSD.format(row.revenue_client ?? 0)}</td>
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
  OUTCOME_TRAFFIC: "Cliques no link",
  OUTCOME_ENGAGEMENT: "Engajamento",
  ENGAGEMENT: "Engajamento",
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

const INVALID_LEAD_TERMS = new Set(["", "none", "null", "undefined", "unassigned", "-"]);

function cleanTermValue(value) {
  return String(value ?? "").trim();
}

function looksLikeMessenleadLeadId(value) {
  const raw = cleanTermValue(value);
  const key = normalizeKey(raw);
  if (!key || INVALID_LEAD_TERMS.has(key)) return false;
  if (key.startsWith("ml_")) return true;
  // Evita mandar nomes de conjunto/campanha para o Evo. O lead_id do Messenlead deve ser URL-safe.
  return /^[a-z0-9_-]{6,128}$/i.test(raw);
}

function normalizeMessenleadLead(lead) {
  if (!lead || typeof lead !== "object") return null;
  const leadId = cleanTermValue(lead.leadId ?? lead.lead_id ?? lead.id);
  if (!leadId) return null;
  return {
    ...lead,
    leadId,
    firstSeenAt:
      lead.firstSeenAt ??
      lead.first_seen_at ??
      lead.createdAt ??
      lead.created_at ??
      "",
    lastSeenAt:
      lead.lastSeenAt ??
      lead.last_seen_at ??
      lead.updatedAt ??
      lead.updated_at ??
      "",
    adId: cleanTermValue(lead.adId ?? lead.ad_id ?? ""),
    sourceKey: cleanTermValue(lead.sourceKey ?? lead.source_key ?? ""),
  };
}

const DASHBOARD_USER_PARAMS = ["utm_user", "dashboard_user", "username", "user"];

function textMatchesDashboardUser(value, username) {
  const userKey = normalizeKey(username);
  const text = normalizeKey(value);
  if (!userKey || !text) return false;
  if (text === userKey) return true;
  return text
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .includes(userKey);
}

function urlMatchesDashboardUser(value, username) {
  const userKey = normalizeKey(username);
  const raw = String(value || "").trim();
  if (!userKey || !raw) return false;
  try {
    const parsed = new URL(raw, raw.startsWith("http") ? undefined : "https://dummy.local");
    return DASHBOARD_USER_PARAMS.some(
      (param) => normalizeKey(parsed.searchParams.get(param)) === userKey
    );
  } catch {
    return false;
  }
}

function rowMatchesDashboardUser(row, username) {
  const userKey = normalizeKey(username);
  if (!userKey || !row) return false;
  const urls = [row.destination_url, row.url, row.link, row.website_url].filter(Boolean);
  if (urls.some((url) => urlMatchesDashboardUser(url, userKey))) return true;
  return [
    row.campaign_name,
    row.adset_name,
    row.ad_name,
    row.name,
    row.campaign_id,
    row.adset_id,
    row.ad_id,
    ...urls,
  ].some((value) => textMatchesDashboardUser(value, userKey));
}

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
    entry.revenue += toNumber(row.revenue_client ?? row.earnings_client ?? 0);
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
        const usd = toNumber(join.revenue_client ?? join.earnings_client ?? 0);
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
  allAds,
  campaigns,
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
  onToggleAdStatus,
  onDeleteAd,
  onToggleAdsetStatus,
  onDeleteAdset,
  onToggleCampaignStatus,
  deleting,
  togglingStatus,
  hiddenCampaigns,
  onHideCampaign,
  onUnhideCampaign,
  onDeleteCampaigns,
  dateStart,
  dateEnd,
  onDateChange,
}) {
  const [managerTab, setManagerTab] = useState("campaigns");
  const [editingUrlId, setEditingUrlId] = useState(null);
  const [showHiddenPanel, setShowHiddenPanel] = useState(false);
  const [selectedCampaigns, setSelectedCampaigns] = useState(new Set());

  const fmtMoney = (v) => v ? "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
  const fmtPct = (v) => v ? Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%" : "—";
  const fmtFreq = (v) => v ? Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

  const fmtBudget = (v) => {
    if (!v) return "—";
    const n = Number(v);
    if (isNaN(n) || n === 0) return "—";
    return "R$ " + (n / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  };

  const effLabel = (s) => {
    if (s === "ACTIVE") return "Ativo";
    if (s === "PAUSED") return "Desativado";
    if (s === "ARCHIVED") return "Arquivado";
    return s || "—";
  };

  const campaignsData = useMemo(() => {
    // Conta adsets e ads por campanha a partir dos anúncios carregados
    const adsetsByCamp = new Map();
    const adCountByCamp = new Map();
    for (const ad of ads) {
      const cid = ad.campaign_id;
      if (!cid) continue;
      if (!adsetsByCamp.has(cid)) adsetsByCamp.set(cid, new Set());
      if (ad.adset_id) adsetsByCamp.get(cid).add(ad.adset_id);
      adCountByCamp.set(cid, (adCountByCamp.get(cid) || 0) + 1);
    }
    // Base: todas as campanhas retornadas pela API (com ou sem anúncios)
    const base = (campaigns && campaigns.length > 0) ? campaigns : [];
    // Fallback: constrói a partir dos próprios anúncios se campaigns não vier
    const fromAds = [];
    if (base.length === 0) {
      const map = new Map();
      for (const ad of ads) {
        const cid = ad.campaign_id;
        if (!cid || map.has(cid)) continue;
        map.set(cid, {
          id: cid,
          name: ad.campaign_name || cid,
          status: ad.campaign_status || "PAUSED",
          effective_status: ad.campaign_status || "PAUSED",
          daily_budget: ad.campaign_daily_budget || "",
          lifetime_budget: ad.campaign_lifetime_budget || "",
        });
      }
      fromAds.push(...map.values());
    }
    return (base.length > 0 ? base : fromAds)
      .filter((c) => !hiddenCampaigns || !hiddenCampaigns.has(c.id))
      .map((c) => ({
      id: c.id,
      name: c.name || c.id,
      status: c.effective_status || c.status || "PAUSED",
      daily_budget: c.daily_budget || "",
      lifetime_budget: c.lifetime_budget || "",
      adsetCount: (adsetsByCamp.get(c.id) || new Set()).size,
      adCount: adCountByCamp.get(c.id) || 0,
    }));
  }, [ads, campaigns, hiddenCampaigns]);

  const adsetsData = useMemo(() => {
    const map = new Map();
    for (const ad of ads) {
      const asid = ad.adset_id;
      if (!asid) continue;
      if (!map.has(asid)) {
        map.set(asid, {
          id: asid,
          name: ad.adset_name || asid,
          campaignId: ad.campaign_id || "",
          campaignName: ad.campaign_name || ad.campaign_id || "",
          status: ad.adset_status || "PAUSED",
          adCount: 0,
        });
      }
      map.get(asid).adCount++;
    }
    return [...map.values()];
  }, [ads]);

  const hiddenList = useMemo(() => {
    const nameMap = new Map();
    // Nomes das campanhas vem preferencialmente de campaigns, fallback em allAds
    for (const c of (campaigns || [])) {
      if (c.id) nameMap.set(c.id, c.name || c.id);
    }
    for (const ad of (allAds || [])) {
      if (ad.campaign_id && !nameMap.has(ad.campaign_id)) {
        nameMap.set(ad.campaign_id, ad.campaign_name || ad.campaign_id);
      }
    }
    return [...(hiddenCampaigns || [])].map((id) => ({ id, name: nameMap.get(id) || id }));
  }, [campaigns, allAds, hiddenCampaigns]);

  return html`
    <main className="dup-grid">
      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">Gerenciador</span>
            <h2 className="section-title">Anúncios</h2>
          </div>
          <div className="chip-group">
            ${hiddenList.length > 0 ? html`
              <button className="ghost" onClick=${() => setShowHiddenPanel((v) => !v)}
                style=${{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                🙈 Ocultas (${hiddenList.length})
              </button>` : null}
            <button className="ghost" onClick=${() => onLoad(true)} disabled=${loading}>
              ${loading ? "Carregando..." : "↻ Atualizar"}
            </button>
            <span className="chip neutral">${ads.length} anúncios</span>
          </div>
        </div>

        <div className="filters manager-filter-row">
          <label className="field manager-search-field">
            <span>Buscar</span>
            <input
              type="text"
              placeholder="Campanha, conjunto ou anúncio..."
              value=${campaignFilter}
              onInput=${(e) => onCampaignFilter?.(e.target.value)}
            />
          </label>
          <label className="field manager-date-field">
            <span>De</span>
            <input type="date" value=${dateStart || ""}
              onInput=${(e) => onDateChange?.(e.target.value, dateEnd)} />
          </label>
          <label className="field manager-date-field">
            <span>Até</span>
            <input type="date" value=${dateEnd || ""}
              onInput=${(e) => onDateChange?.(dateStart, e.target.value)} />
          </label>
          <button className="primary manager-apply"
            onClick=${() => onLoad(true, dateStart, dateEnd)} disabled=${loading}>
            ${loading ? "..." : "Aplicar"}
          </button>
        </div>

        <div className="manager-tabs">
          <button
            className=${"manager-tab-btn" + (managerTab === "campaigns" ? " active" : "")}
            onClick=${() => setManagerTab("campaigns")}
          >
            Campanhas
            ${campaignsData.length > 0 ? html`<span className="chip neutral small manager-tab-count">${campaignsData.length}</span>` : null}
          </button>
          <button
            className=${"manager-tab-btn" + (managerTab === "adsets" ? " active" : "")}
            onClick=${() => setManagerTab("adsets")}
          >
            Conjuntos
            ${adsetsData.length > 0 ? html`<span className="chip neutral small manager-tab-count">${adsetsData.length}</span>` : null}
          </button>
          <button
            className=${"manager-tab-btn" + (managerTab === "ads" ? " active" : "")}
            onClick=${() => setManagerTab("ads")}
          >
            Anúncios
            ${ads.length > 0 ? html`<span className="chip neutral small manager-tab-count">${ads.length}</span>` : null}
          </button>
        </div>

        ${error ? html`<div className="status error" style=${{ margin: "8px 0" }}><strong>Erro:</strong> ${error}</div>` : null}

        ${(showHiddenPanel && hiddenList.length > 0) ? html`
          <div className="manager-hidden-panel">
            ${hiddenList.map((c) => html`
              <span key=${c.id} className="chip neutral" style=${{ fontSize: "11px" }}>
                ${c.name}
                <button className="ghost small"
                  style=${{ padding: "0 4px", marginLeft: "2px" }}
                  onClick=${() => onUnhideCampaign?.(c.id)}
                  title="Restaurar"
                >×</button>
              </span>
            `)}
            <button className="ghost small" style=${{ fontSize: "11px" }}
              onClick=${() => { hiddenList.forEach((c) => onUnhideCampaign?.(c.id)); setShowHiddenPanel(false); }}
            >Restaurar todas</button>
          </div>` : null}

        ${(ads.length === 0 && !loading) ? html`
          <div className="muted manager-empty-state">
            ${hiddenList.length > 0
              ? html`Todas as campanhas estão ocultas. Clique em <strong>🙈 Ocultas</strong> no topo para restaurar.`
              : "Clique em \"↻ Atualizar\" para carregar as campanhas."}
          </div>` : null}

        ${(managerTab === "campaigns" && (campaignsData.length > 0 || ads.length > 0)) ? html`
          ${selectedCampaigns.size > 0 ? html`
            <div style=${{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid var(--border)", marginBottom: "4px" }}>
              <span className="muted small">${selectedCampaigns.size} campanha${selectedCampaigns.size > 1 ? "s" : ""} selecionada${selectedCampaigns.size > 1 ? "s" : ""}</span>
              <button className="ghost small btn-danger"
                onClick=${() => onDeleteCampaigns?.([...selectedCampaigns], () => setSelectedCampaigns(new Set()))}>
                🗑 Excluir selecionadas
              </button>
              <button className="ghost small" onClick=${() => setSelectedCampaigns(new Set())}>Limpar seleção</button>
            </div>` : null}
          <div className="table-wrapper scroll-x">
            <table className="manager-table">
              <thead>
                <tr>
                  <th style=${{ width: "28px" }}>
                    <input type="checkbox"
                      checked=${campaignsData.length > 0 && selectedCampaigns.size === campaignsData.length}
                      onChange=${(e) => setSelectedCampaigns(e.target.checked ? new Set(campaignsData.map((c) => c.id)) : new Set())}
                      title="Selecionar todas"
                    />
                  </th>
                  <th style=${{ width: "46px" }}></th>
                  <th>Campanha</th>
                  <th>Veiculação</th>
                  <th>Orçamento</th>
                  <th>Conjuntos</th>
                  <th>Anúncios</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${campaignsData.map((c) => {
                  const isActive = c.status === "ACTIVE";
                  const toggling = togglingStatus && togglingStatus[c.id];
                  const bgt = c.daily_budget
                    ? fmtBudget(c.daily_budget)
                    : c.lifetime_budget
                    ? fmtBudget(c.lifetime_budget) + " (vit.)"
                    : "—";
                  return html`<tr key=${c.id} style=${{ background: selectedCampaigns.has(c.id) ? "rgba(99,102,241,0.07)" : "" }}>
                    <td>
                      <input type="checkbox"
                        checked=${selectedCampaigns.has(c.id)}
                        onChange=${(e) => {
                          setSelectedCampaigns((prev) => {
                            const next = new Set(prev);
                            e.target.checked ? next.add(c.id) : next.delete(c.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td>
                      <label className="toggle-switch" title=${isActive ? "Pausar campanha" : "Ativar campanha"}>
                        <input type="checkbox" checked=${isActive} disabled=${toggling}
                          onChange=${() => onToggleCampaignStatus?.(c.id, c.status)} />
                        <span className="toggle-slider"></span>
                      </label>
                    </td>
                    <td style=${{ fontWeight: 600 }}>${c.name}</td>
                    <td>
                      <span className=${"status-badge " + (isActive ? "on" : "off")}>
                        ${effLabel(c.status)}
                      </span>
                    </td>
                    <td className="muted small">${bgt}</td>
                    <td className="muted small">${c.adsetCount}</td>
                    <td className="muted small">${c.adCount}</td>
                    <td>
                      <button
                        className="ghost small btn-danger"
                        onClick=${() => onHideCampaign?.(c.id)}
                        title="Ocultar do Dashboard e desta lista"
                      >
                        ðŸ‘ Ocultar
                      </button>
                    </td>
                  </tr>`;
                })}
              </tbody>
            </table>
          </div>` : null}

        ${(managerTab === "adsets" && ads.length > 0) ? html`
          <div className="table-wrapper scroll-x">
            <table className="manager-table">
              <thead>
                <tr>
                  <th style=${{ width: "36px" }}></th>
                  <th>Conjunto</th>
                  <th>Campanha</th>
                  <th>Veiculação</th>
                  <th>Anúncios</th>
                  <th>Renomear</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${adsetsData.map((as) => {
                  const isActive = as.status === "ACTIVE";
                  const toggling = togglingStatus && togglingStatus[as.id];
                  const deletingAs = deleting && deleting[as.id];
                  const renameKey = "adset:" + as.id;
                  const renaming = editRenaming && editRenaming[renameKey];
                  const currentName = ads.find((a) => a.adset_id === as.id)?.adset_name || as.name;
                  return html`<tr key=${as.id} style=${{ opacity: deletingAs ? 0.4 : 1 }}>
                    <td>
                      <label className="toggle-switch" title=${isActive ? "Pausar conjunto" : "Ativar conjunto"}>
                        <input type="checkbox" checked=${isActive} disabled=${toggling}
                          onChange=${() => onToggleAdsetStatus?.(as.id, as.status)} />
                        <span className="toggle-slider"></span>
                      </label>
                    </td>
                    <td style=${{ fontWeight: 500, minWidth: "180px" }}>${as.name}</td>
                    <td className="muted small">${as.campaignName}</td>
                    <td>
                      <span className=${"status-badge " + (isActive ? "on" : "off")}>
                        ${effLabel(as.status)}
                      </span>
                    </td>
                    <td className="muted small">${as.adCount}</td>
                    <td>
                      <div className="inline-actions">
                        <input
                          type="text"
                          value=${currentName}
                          className="manager-rename-input"
                          onInput=${(e) => {
                            ads.filter((a) => a.adset_id === as.id)
                              .forEach((a) => onUpdateField(a.id, { adset_name: e.target.value }));
                          }}
                        />
                        <button className="ghost small" disabled=${renaming}
                          onClick=${() => onRenameAdset?.(as.id, currentName, renameKey)}>
                          ${renaming ? "..." : "âœ"}
                        </button>
                      </div>
                    </td>
                    <td>
                      <button
                        className="ghost small btn-danger"
                        disabled=${deletingAs}
                        onClick=${() => onDeleteAdset?.(as.id, as.name)}
                      >
                        ${deletingAs ? "..." : "🗑 Apagar"}
                      </button>
                    </td>
                  </tr>`;
                })}
              </tbody>
            </table>
          </div>` : null}

        ${(managerTab === "ads" && ads.length > 0) ? html`
          <div className="table-wrapper scroll-x">
            <table className="manager-table">
              <thead>
                <tr>
                  <th style=${{ width: "36px" }}></th>
                  <th>Anúncio</th>
                  <th>Conjunto</th>
                  <th>Veiculação</th>
                  <th>Valor usado</th>
                  <th>CTR</th>
                  <th>CPC</th>
                  <th>CPM</th>
                  <th>Frequência</th>
                  <th>Taxa Viz.</th>
                  <th>URL / Destino</th>
                  <th>Atualizado</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${ads.map((row, idx) => {
                  const busy = saving && saving[row.id];
                  const verifyingRow = verifying && verifying[row.id];
                  const deletingRow = deleting && deleting[row.id];
                  const togglingRow = togglingStatus && togglingStatus[row.id];
                  const renameAdKey = "ad:" + row.id;
                  const renamingAd = editRenaming && editRenaming[renameAdKey];
                  const isEditUrl = editingUrlId === row.id;
                  const effStatus = row.effective_status || row.status;
                  const isActive = effStatus === "ACTIVE";
                  return html`<tr key=${row.id || idx} style=${{ opacity: deletingRow ? 0.4 : 1 }}>
                    <td>
                      <label className="toggle-switch" title=${isActive ? "Pausar" : "Ativar"}>
                        <input type="checkbox" checked=${isActive} disabled=${togglingRow}
                          onChange=${() => onToggleAdStatus?.(row)} />
                        <span className="toggle-slider"></span>
                      </label>
                    </td>
                    <td style=${{ minWidth: "200px" }}>
                      <div className="inline-actions">
                        <input type="text" value=${row.name || ""}
                          style=${{ width: "165px", fontSize: "12px" }}
                          onInput=${(e) => onUpdateField(row.id, { name: e.target.value })} />
                        <button className="ghost small" disabled=${renamingAd}
                          onClick=${() => onRenameAd?.(row.id, row.name, renameAdKey)}
                          title="Renomear">
                          ${renamingAd ? "..." : "âœ"}
                        </button>
                      </div>
                    </td>
                    <td className="muted small" style=${{ maxWidth: "130px" }}>${row.adset_name || "—"}</td>
                    <td>
                      <span className=${"status-badge " + (isActive ? "on" : "off")}>
                        ${effLabel(effStatus)}
                      </span>
                    </td>
                    <td className="muted small">${fmtMoney(row.spend)}</td>
                    <td className="muted small">${fmtPct(row.ctr)}</td>
                    <td className="muted small">${fmtMoney(row.cpc)}</td>
                    <td className="muted small">${fmtMoney(row.cpm)}</td>
                    <td className="muted small">${fmtFreq(row.frequency)}</td>
                    <td className="muted small">${fmtPct(row.video_thruplay_rate)}</td>
                    <td style=${{ minWidth: "180px" }}>
                      ${isEditUrl
                        ? html`<div className="inline-actions">
                            <input type="text" value=${row.url || ""}
                              style=${{ width: "160px", fontSize: "12px" }} placeholder="https://..."
                              onInput=${(e) => onUpdateField(row.id, { url: e.target.value })} />
                            <button className="ghost small" onClick=${() => setEditingUrlId(null)}>×</button>
                          </div>`
                        : html`<div className="inline-actions">
                            <span className="muted small"
                              style=${{ maxWidth: "145px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
                              title=${row.destination_url || row.url || ""}>
                              ${row.destination_url || row.url || (row.object_story_id ? "Post" : "—")}
                            </span>
                            <button className="ghost small" onClick=${() => setEditingUrlId(row.id)} title="Editar URL">âœ</button>
                            ${(row.object_story_id && !row.destination_url)
                              ? html`<button className="ghost small" disabled=${verifyingRow}
                                  onClick=${() => onResolveDestination?.(row)} title="Resolver destino">
                                  ${verifyingRow ? "..." : "🔗"}
                                </button>`
                              : null}
                          </div>`}
                    </td>
                    <td className="muted small">${formatDateTime(row.updated_time)}</td>
                    <td>
                      <div className="inline-actions compact">
                        <button className="ghost small" disabled=${verifyingRow}
                          onClick=${() => onVerify?.(row)} title="Verificar URL">
                          ${verifyingRow ? "..." : "ðŸ”"}
                        </button>
                        <button className="ghost small" disabled=${busy}
                          onClick=${() => onSave(row)} title="Duplicar">
                          ${busy ? "..." : "⧉"}
                        </button>
                        <button className="ghost small btn-danger" disabled=${deletingRow}
                          onClick=${() => onDeleteAd?.(row)} title="Apagar">
                          ${deletingRow ? "..." : "🗑"}
                        </button>
                      </div>
                    </td>
                  </tr>`;
                })}
              </tbody>
            </table>
          </div>` : null}

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
  allowCampaignOps = true,
  usePmLabels = false,
}) {
  const unitLabel = performanceUnitLabel(usePmLabels);
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
              <th>${unitLabel} JoinAds (cliente)</th>
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
                              return allowCampaignOps
                                ? html`<div className="budget-cell">
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
                                  </div>`
                                : html`<span>${currentBudget}</span>`;
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
                              return allowCampaignOps
                                ? html`<div className="budget-cell">
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
                                  </div>`
                                : html`<div className="budget-meta">
                                    <span>${currentBid}</span>
                                    <span className="muted small">${modeLabel}</span>
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
                              ${canToggle && allowCampaignOps
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
                                : html`<span className="muted small">
                                    ${allowCampaignOps ? "Indisponível" : "Somente leitura"}
                                  </span>`}
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

function MetaJoinGroupedTable({ rows, usePmLabels = false }) {
  const unitLabel = performanceUnitLabel(usePmLabels);
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
              <th>${unitLabel} JoinAds (cliente)</th>
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

function SemUtmAttribution({ semUtmRow, joinadsRows, metaRows, brlRate, usePmLabels = false }) {
  const unitLabel = performanceUnitLabel(usePmLabels);
  const rows = Array.isArray(joinadsRows) ? joinadsRows : [];
  const metaList = Array.isArray(metaRows) ? metaRows : [];
  const semImps = toNumber(semUtmRow?.impressions);
  const semClicks = toNumber(semUtmRow?.clicks);
  const semRevenue = toNumber(semUtmRow?.revenue_client ?? semUtmRow?.earnings_client ?? 0);

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
    item.revenue += toNumber(row.revenue_client ?? row.earnings_client ?? 0);
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
    criterionLabel = unitLabel;
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
              <th>${unitLabel} cliente</th>
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

function MetaJoinAdsetTable({ rows, joinadsRows, brlRate, usePmLabels = false }) {
  const unitLabel = performanceUnitLabel(usePmLabels);
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
        const usd = toNumber(join.revenue_client ?? join.earnings_client ?? 0);
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
              <th>${unitLabel} JoinAds (cliente)</th>
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
  { code: "AT", name: "Ãustria",          region: "europe",        lat:  47.52,  lng:  14.55 },
  { code: "US", name: "Estados Unidos",   region: "north-america", lat:  37.09,  lng: -95.71 },
  { code: "CA", name: "Canadá",           region: "north-america", lat:  56.13,  lng: -106.35 },
  { code: "AU", name: "Austrália",        region: "asia-oceania",  lat: -25.27,  lng: 133.78 },
  { code: "NZ", name: "Nova Zelândia",    region: "asia-oceania",  lat: -40.90,  lng: 174.89 },
  { code: "JP", name: "Japão",            region: "asia-oceania",  lat:  36.20,  lng: 138.25 },
  { code: "IN", name: "Ãndia",            region: "asia-oceania",  lat:  20.59,  lng:  78.96 },
  { code: "PH", name: "Filipinas",        region: "asia-oceania",  lat:  12.88,  lng: 121.77 },
  { code: "ID", name: "Indonésia",        region: "asia-oceania",  lat:  -0.79,  lng: 113.92 },
  { code: "TH", name: "Tailândia",        region: "asia-oceania",  lat:  15.87,  lng: 100.99 },
  { code: "SG", name: "Singapura",        region: "asia-oceania",  lat:   1.35,  lng: 103.82 },
  { code: "MY", name: "Malásia",          region: "asia-oceania",  lat:   4.21,  lng: 101.98 },
  { code: "NG", name: "Nigéria",          region: "africa-me",     lat:   9.08,  lng:   8.68 },
  { code: "ZA", name: "Ãfrica do Sul",    region: "africa-me",     lat: -30.56,  lng:  22.94 },
  { code: "EG", name: "Egito",            region: "africa-me",     lat:  26.82,  lng:  30.80 },
  { code: "MA", name: "Marrocos",         region: "africa-me",     lat:  31.79,  lng:  -7.09 },
  { code: "AE", name: "Emirados Ãrabes",  region: "africa-me",     lat:  23.42,  lng:  53.85 },
  { code: "SA", name: "Arábia Saudita",   region: "africa-me",     lat:  23.89,  lng:  45.08 },
  { code: "IL", name: "Israel",           region: "africa-me",     lat:  31.05,  lng:  34.85 },
];

const COUNTRY_REGIONS = {
  latam: "América Latina",
  europe: "Europa",
  "north-america": "América do Norte",
  "asia-oceania": "Ãsia / Oceania",
  "africa-me": "Ãfrica / Oriente Médio",
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
  { id: 4,   label: "Ãrabe" },
  { id: 16,  label: "Hindi" },
  { id: 39,  label: "Indonésio" },
  { id: 34,  label: "Tailandês" },
];

function flagEmoji(code) {
  if (!code || code.length !== 2) return "ðŸŒ";
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

function CriarCampanhaView({ accountId, pages, pagesLoading, onLoadPages, pixels, pixelsLoading, onLoadPixels, nichos, savedUrls }) {
  const _savedUrls = Array.isArray(savedUrls) ? savedUrls : [];
  const [step, setStep] = useState(1);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState(null);
  const [formError, setFormError] = useState("");

  // Campanha
  const [campName, setCampName] = useState("");
  const [objective, setObjective] = useState("OUTCOME_TRAFFIC");
  const [specialCat, setSpecialCat] = useState("NONE");
  const [campStatus, setCampStatus] = useState("ACTIVE");
  const [nicho, setNicho] = useState(null);
  const [campNameManual, setCampNameManual] = useState(false);
  const [adsetNameManual, setAdsetNameManual] = useState(false);
  const [adNameManual, setAdNameManual] = useState(false);
  const [campNum, setCampNum] = useState("01");
  const [campNumLoading, setCampNumLoading] = useState(false);
  const [cjNum, setCjNum] = useState("01");
  const [anNum, setAnNum] = useState("01");
  const [savedAdsets, setSavedAdsets] = useState([]);
  const [savedAds, setSavedAds] = useState([]);
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
  const [advantageAudience, setAdvantageAudience] = useState(0);
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

  const TIPO_MAP = {
    OUTCOME_TRAFFIC: "cnl",
    OUTCOME_SALES: "vnd",
    OUTCOME_LEADS: "cad",
    OUTCOME_ENGAGEMENT: "eng",
    OUTCOME_AWARENESS: "rec",
    OUTCOME_APP_PROMOTION: "app",
  };

  const buildCampName = (n, obj, num) => {
    if (!n || !n.slug) return "";
    const tipo = TIPO_MAP[obj] || "cmp";
    const nn = String(num || "01").padStart(2, "0");
    return `cmp-${nn}-${tipo}-${n.slug}`;
  };

  const buildAdsetName = (n, obj, ctrs, cj) => {
    if (!n || !n.slug) return "";
    const tipo = TIPO_MAP[obj] || "cmp";
    const geo = (Array.isArray(ctrs) && ctrs.length ? ctrs : ["br"]).map((c) => c.toLowerCase()).join("-");
    const nn = String(cj || "01").padStart(2, "0");
    return `${n.slug}-${tipo}-${geo}-cj${nn}`;
  };

  const buildAdName = (n, ctrs, cj, an) => {
    if (!n || !n.slug) return "";
    const geo = (Array.isArray(ctrs) && ctrs.length ? ctrs : ["br"]).map((c) => c.toLowerCase()).join("-");
    const nn = String(cj || "01").padStart(2, "0");
    const mm = String(an || "01").padStart(2, "0");
    return `${n.slug}-${geo}-cj${nn}-an${mm}`;
  };

  const snapshotCurrentAdset = () => ({
    name: adsetName.trim(),
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
    advantage_audience: advantageAudience,
    ...(startTime ? { start_time: new Date(startTime).toISOString() } : {}),
    ...(endTime ? { end_time: new Date(endTime).toISOString() } : {}),
    ...(pixelId ? { pixel_id: pixelId.trim(), conversion_event: conversionEvent } : {}),
    ...(locLanguages.length > 0 ? { locales: locLanguages } : {}),
    _cjNum: cjNum,
  });

  const snapshotCurrentAd = () => ({
    name: adName.trim(),
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
    _anNum: anNum,
  });

  useEffect(() => {
    if (!campNameManual) { const v = buildCampName(nicho, objective, campNum); if (v) setCampName(v); }
  }, [nicho, objective, campNum]);

  useEffect(() => {
    if (!nicho || !accountId) return;
    setCampNumLoading(true);
    fetch(`/api/camp-counters?account_id=${encodeURIComponent(accountId)}&nicho=${encodeURIComponent(nicho.slug)}&objective=${encodeURIComponent(objective)}`)
      .then((r) => r.json())
      .then((d) => { if (d.code === "success") { setCampNum(d.nextFormatted); setCampNameManual(false); } })
      .catch(() => {})
      .finally(() => setCampNumLoading(false));
  }, [nicho, objective]);

  useEffect(() => {
    if (!adsetNameManual) { const v = buildAdsetName(nicho, objective, countries, cjNum); if (v) setAdsetName(v); }
  }, [nicho, objective, countries, cjNum]);

  useEffect(() => {
    if (!adNameManual) { const v = buildAdName(nicho, countries, cjNum, anNum); if (v) setAdName(v); }
  }, [nicho, countries, cjNum, anNum]);

  const resetForm = () => {
    setStep(1); setResult(null); setFormError("");
    setCampName(""); setObjective("OUTCOME_TRAFFIC"); setSpecialCat("NONE");
    setCampStatus("ACTIVE"); setCbo(false); setCampBudgetType("daily"); setCampBudget(""); setNicho(null);
    setCampNameManual(false); setAdsetNameManual(false); setAdNameManual(false); setCampNum("01"); setCjNum("01"); setAnNum("01");
    setSavedAdsets([]); setSavedAds([]);
    setSpendingLimit("");
    setAdsetName(""); setAdsetBudgetType("daily"); setAdsetBudget("");
    setCountries(["BR"]); setAgeMin("18"); setAgeMax("65"); setGender("all");
    setPlacementMode("auto"); setManualPlacements({ ...EMPTY_PLACEMENTS }); setAdvantageAudience(0);
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
        adsets: (() => {
          const allAdsets = [...savedAdsets, snapshotCurrentAdset()];
          const currentAd = snapshotCurrentAd();
          const hasCurrentAd = Boolean(currentAd.page_id && currentAd.destination_url);
          const allAds = skipAd ? [] : [...savedAds, ...(hasCurrentAd ? [currentAd] : [])];
          return allAdsets.map((adsetSnap) => ({ ...adsetSnap, ads: allAds }));
        })(),
      };

      const res = await fetchJson("/api/meta-campaign-create", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setResult(res);
      setStep(5);
      if ((res.code === "success" || res.code === "partial") && nicho) {
        const num = parseInt(campNum, 10);
        if (!isNaN(num)) {
          fetch(`/api/camp-counters?account_id=${encodeURIComponent(accountId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nicho: nicho.slug, num }),
          }).catch(() => {});
        }
      }
    } catch (err) {
      setFormError(formatError(err));
    } finally {
      setPublishing(false);
    }
  };

  const step1Valid = campName.trim() && (!cbo || campBudget);
  const step2Valid = cbo || adsetBudget;
  const step3Valid = skipAd || savedAds.length > 0 || (
    pageId && destUrl.trim() && headline.trim() &&
    (adFormat === "image" ? imageUrl.trim() : videoId.trim())
  );

  const StepDot = ({ n }) => {
    const current = n === step;
    const done = n < step;
    return html`
      <div className=${`stepper-item${n > step ? " pending" : ""}`}>
        <div className=${`stepper-dot${current ? " current" : done ? " done" : ""}`}>${done ? "✓" : n}</div>
        <span className=${`stepper-label${current ? " current" : ""}`}>
          ${["", "Campanha", "Conjunto", "Anúncio", "Revisão"][n]}
        </span>
      </div>
    `;
  };

  const StepBar = () => html`
    <div className="stepper">
      ${[1, 2, 3, 4].map((n) => html`
        <${StepDot} key=${n} n=${n} />
        ${n < 4 ? html`<div className="stepper-line"></div>` : null}
      `)}
    </div>
  `;

  // ── Tela de sucesso ───────────────────────────────────────────────────────
  if (step === 5) {
    const ok = result?.code === "success";
    return html`
      <section className="card wide result-card">
        <div className="result-icon">${ok ? "✅" : "âš ï¸"}</div>
        <h2 className="section-title" style=${{ marginBottom: "8px" }}>
          ${ok ? "Campanha criada com sucesso!" : "Criação parcial — verifique abaixo"}
        </h2>
        ${result?.error ? html`<p className="muted small" style=${{ margin: "8px 0" }}>${result.error}</p>` : null}
        <div className="result-stack">
          ${result?.campaign_id ? html`<div>🎯 Campanha: <code className="result-code">${result.campaign_id}</code></div>` : null}
          ${Array.isArray(result?.results) && result.results.length > 0 ? html`
            ${result.results.map((r, i) => html`
              <div key=${i} className=${`result-block ${r.error ? "error" : "success"}`}>
                <div className="result-block-title">📦 ${r.name}</div>
                ${r.error ? html`<div style=${{ color: "var(--danger)", fontSize: "0.8rem" }}>Erro: ${typeof r.error === "string" ? r.error : JSON.stringify(r.error)}</div>` : html`
                  <div className="helper-text-inline">ID: ${r.adset_id}</div>
                `}
                ${r.ads && r.ads.map((a, j) => html`
                  <div key=${j} className="result-subitem">
                    ${a.error ? html`âŒ ${a.name} — ${typeof a.error === "string" ? a.error : JSON.stringify(a.error)}` : html`✅ ${a.name} <code className="result-code">${a.ad_id}</code>`}
                  </div>
                `)}
              </div>
            `)}
          ` : html`
            ${result?.adset_id ? html`<div>📦 Conjunto: <code className="result-code">${result.adset_id}</code></div>` : null}
            ${result?.ad_id ? html`<div>📣 Anúncio: <code className="result-code">${result.ad_id}</code></div>` : null}
          `}
        </div>
        <p className="muted small">Tudo criado com status <strong>Pausado</strong>. Revise e ative no Gerenciador de Anúncios quando pronto.</p>
        <button className="primary result-action" onClick=${resetForm}>
          + Criar outra campanha
        </button>
      </section>
    `;
  }

  return html`
    <div className="full-span">
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
            <div className="field full-span">
              <label>Nicho <span className="muted small">(opcional)</span></label>
              ${nichos && nichos.length > 0 ? html`
                <select value=${nicho ? nicho.slug : ""} onChange=${(e) => {
                  const found = (nichos || []).find((n) => n.slug === e.target.value);
                  setNicho(found || null);
                }}>
                  <option value="">— Selecione um nicho —</option>
                  ${(nichos || []).map((n) => {
                    const lista = Array.isArray(n.paises) ? n.paises : (n.pais ? [n.pais] : []);
                    return html`<option key=${n.slug} value=${n.slug}>${n.nome}${lista.length ? ` — ${lista.join(", ")}` : ""}</option>`;
                  })}
                </select>
              ` : html`
                <select disabled>
                  <option>Nenhum nicho cadastrado — acesse Configurações para adicionar</option>
                </select>
              `}
            </div>
            <div className="field">
              <label>Nome da campanha *</label>
              <div className="form-inline" style=${{ marginBottom: "6px" }}>
                <span className="micro-label">Cmp nº</span>
                <input
                  type="text" value=${campNum}
                  onInput=${(e) => { setCampNum(e.target.value); setCampNameManual(false); }}
                  placeholder="01"
                  disabled=${campNumLoading}
                  className="number-mini"
                  style=${{ opacity: campNumLoading ? .5 : 1 }}
                />
                ${campNumLoading
                  ? html`<span className="helper-text-inline">verificando...</span>`
                  : html`<span className="helper-text-inline">${nicho ? buildCampName(nicho, objective, campNum) : ""}</span>`
                }
              </div>
              <div className="form-inline-tight">
                <input
                  type="text" value=${campName}
                  onInput=${(e) => { setCampName(e.target.value); setCampNameManual(true); }}
                  placeholder="cmp-01-cnl-nicho"
                  className="grow-input"
                />
                <button title="Sugerir nome" onClick=${() => { const v = buildCampName(nicho, objective, campNum); if (v) { setCampName(v); setCampNameManual(false); } }} className="suggest-btn">↺</button>
              </div>
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
          <div className="soft-panel">
            <label className="checkbox checkbox-row" style=${{ marginBottom: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
              <input type="checkbox" checked=${cbo} onChange=${(e) => setCbo(e.target.checked)} />
              <strong>CBO — Otimização de orçamento da campanha</strong>
            </label>
            <p className="muted small soft-panel-note indent">
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
          <div className="action-row-end">
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
              <div className="form-inline-tight">
                <input
                  type="text" value=${adsetName}
                  onInput=${(e) => { setAdsetName(e.target.value); setAdsetNameManual(true); }}
                  placeholder="nicho-cnl-br-cj01"
                  className="grow-input"
                />
                <button title="Sugerir nome" onClick=${() => { const v = buildAdsetName(nicho, objective, countries, cjNum); if (v) { setAdsetName(v); setAdsetNameManual(false); } }} className="suggest-btn">↺</button>
              </div>
            </div>
            <div className="field full-span">
              <label>Locais de segmentação</label>
              <${LocationPicker} selected=${countries} onChange=${setCountries} />
            </div>
            <div className="field full-span">
              <label>Idiomas <span className="muted small">(vazio = todos)</span></label>
              <div className="tag-list" style=${{ marginBottom: "8px" }}>
                ${locLanguages.map((id) => {
                  const lang = LANGUAGE_LIST.find((l) => l.id === id);
                  return html`
                    <span key=${id} className="tag-chip success">
                      ${lang?.label || id}
                      <button
                        onClick=${() => setLocLanguages(locLanguages.filter((x) => x !== id))}
                        className="tag-chip-remove success"
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

          <div className="soft-panel">
            <strong className="soft-panel-title">Dispositivos</strong>
            <div className="option-list">
              ${["mobile", "desktop"].map((d) => html`
                <label key=${d} className="checkbox checkbox-row">
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

          <div className="soft-panel">
            <div className="soft-panel-header">
              <strong className="soft-panel-title" style=${{ marginBottom: 0 }}>
                Pixel de conversão <span className="muted small">— opcional</span>
              </strong>
              <button className="ghost small" onClick=${() => onLoadPixels(accountId)} disabled=${pixelsLoading || !accountId}>
                ${pixelsLoading ? "Carregando..." : pixels.length ? `↺ Recarregar (${pixels.length})` : "Carregar pixels"}
              </button>
            </div>
            <p className="muted small soft-panel-note">
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
            <div className="soft-panel">
              <strong className="soft-panel-title">Orçamento do conjunto *</strong>
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

          <div className="soft-panel">
            <strong className="soft-panel-title">Posicionamentos</strong>
            <div className="option-list" style=${{ marginBottom: "12px" }}>
              <label className="checkbox checkbox-row">
                <input type="radio" name="placement" checked=${placementMode === "auto"} onChange=${() => setPlacementMode("auto")} />
                Automático (recomendado pelo Meta)
              </label>
              <label className="checkbox checkbox-row">
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
            <div style=${{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--border-light)" }}>
              <strong className="soft-panel-title subtle">Público Advantage+</strong>
              <div className="option-list">
                <label className="checkbox checkbox-row">
                  <input type="radio" name="advantageAudience" checked=${advantageAudience === 0} onChange=${() => setAdvantageAudience(0)} />
                  Desativado — usar meu públio definido
                </label>
                <label className="checkbox checkbox-row">
                  <input type="radio" name="advantageAudience" checked=${advantageAudience === 1} onChange=${() => setAdvantageAudience(1)} />
                  Ativado — Meta pode expandir o público
                </label>
              </div>
            </div>
          </div>

          ${savedAdsets.length > 0 ? html`
            <div className="soft-panel accent compact" style=${{ marginBottom: "4px" }}>
              <p className="helper-text-inline" style=${{ marginBottom: "8px" }}>Conjuntos já salvos (${savedAdsets.length}):</p>
              ${savedAdsets.map((s, i) => html`
                <div key=${i} className="action-row-between" style=${{ padding: "4px 0", borderBottom: i < savedAdsets.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <span><strong>CJ${s._cjNum}</strong> — ${s.name || "(sem nome)"} · ${(Array.isArray(s.countries) ? s.countries : [s.countries]).join(", ")}</span>
                  <button className="ghost small" style=${{ color: "var(--danger)" }} onClick=${() => setSavedAdsets((prev) => prev.filter((_, j) => j !== i))}>✕</button>
                </div>
              `)}
            </div>
          ` : null}

          <div className="action-row-between">
            <button onClick=${() => setStep(1)}>â† Voltar</button>
            <div className="action-group">
              <button className="ghost" disabled=${!step2Valid} onClick=${() => {
                setSavedAdsets((prev) => [...prev, snapshotCurrentAdset()]);
                const nextCj = String(savedAdsets.length + 2).padStart(2, "0");
                setCjNum(nextCj);
                setAdsetNameManual(false);
                setAdsetBudget("");
              }}>
                ➕ Salvar e adicionar outro conjunto
              </button>
              <button className="primary" disabled=${!step2Valid} onClick=${() => setStep(3)}>
                Próximo: Anúncio →
              </button>
            </div>
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
          <div className="soft-panel compact" style=${{ marginBottom: "4px" }}>
            <label className="checkbox checkbox-row">
              <input type="checkbox" checked=${skipAd} onChange=${(e) => setSkipAd(e.target.checked)} />
              <strong>Pular anúncio agora</strong> — criar somente campanha + conjunto, adicionar anúncio depois no Gerenciador
            </label>
          </div>
          ${!skipAd ? html`
            <div className="filters">
              <div className="field">
                <label>Nome do anúncio</label>
                <div className="form-inline" style=${{ marginBottom: "8px" }}>
                  <div className="form-inline-tight">
                    <span className="micro-label">CJ nº</span>
                    <input
                      type="text" value=${cjNum}
                      onInput=${(e) => { setCjNum(e.target.value); setAdNameManual(false); }}
                      placeholder="01"
                      className="number-mini"
                    />
                  </div>
                  <div className="form-inline-tight">
                    <span className="micro-label">AN nº</span>
                    <input
                      type="text" value=${anNum}
                      onInput=${(e) => { setAnNum(e.target.value); setAdNameManual(false); }}
                      placeholder="01"
                      className="number-mini"
                    />
                  </div>
                  <span className="helper-text-inline push">${nicho && countries.length ? buildAdName(nicho, countries, cjNum, anNum) : ""}</span>
                </div>
                <div className="form-inline-tight">
                  <input
                    type="text" value=${adName}
                    onInput=${(e) => { setAdName(e.target.value); setAdNameManual(true); }}
                    placeholder="nicho-país-cj01-an01"
                    className="grow-input"
                  />
                  <button title="Sugerir nome" onClick=${() => { const v = buildAdName(nicho, countries, cjNum, anNum); if (v) { setAdName(v); setAdNameManual(false); } }} className="suggest-btn">↺</button>
                </div>
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
                <label>
                  Conta do Instagram <span className="muted small">— opcional</span>
                  ${pagesLoading ? html`<span className="muted small"> carregando...</span>` : null}
                </label>
                ${(() => {
                  const igAccounts = (pages || []).flatMap((p) =>
                    p.instagram_business_account ? [{ id: p.instagram_business_account.id, label: `@${p.instagram_business_account.username || p.instagram_business_account.name} (${p.name})` }] : []
                  );
                  if (igAccounts.length > 0) {
                    return html`
                      <select value=${igActorId} onChange=${(e) => setIgActorId(e.target.value)}>
                        <option value="">Não vincular conta IG</option>
                        ${igAccounts.map((a) => html`<option key=${a.id} value=${a.id}>${a.label}</option>`)}
                      </select>
                    `;
                  }
                  return html`
                    <div className="form-inline">
                      <input type="text" value=${igActorId} onInput=${(e) => setIgActorId(e.target.value)} placeholder="Ex: 17841400000000000" className="grow-input" />
                      ${(!pages || pages.length === 0) && !pagesLoading ? html`
                        <button className="ghost small" onClick=${onLoadPages}>Carregar páginas</button>
                      ` : null}
                    </div>
                    ${(!pages || pages.length === 0) && !pagesLoading ? html`
                      <span className="muted small">Carregue as páginas acima para selecionar a conta IG.</span>
                    ` : null}
                  `;
                })()}
              </div>
              <div className="field full-span">
                <label>Formato do criativo</label>
                <div className="option-list compact" style=${{ marginTop: "4px" }}>
                  ${["image", "video"].map((fmt) => html`
                    <label key=${fmt} className="checkbox checkbox-row" style=${{ fontWeight: adFormat === fmt ? 700 : 400 }}>
                      <input type="radio" name="adFormat" checked=${adFormat === fmt} onChange=${() => setAdFormat(fmt)} />
                      ${fmt === "image" ? "ðŸ–¼ï¸ Imagem" : "🎬 Vídeo"}
                    </label>
                  `)}
                </div>
              </div>
              ${adFormat === "image" ? html`
                <div className="field full-span">
                  <label>URL da imagem * (.jpg, .png — mín. 1080×1080 recomendado)</label>
                  <input type="url" value=${imageUrl} onInput=${(e) => setImageUrl(e.target.value)} placeholder="https://seusite.com/imagem.jpg" />
                </div>
                ${imageUrl ? html`
                  <div className="soft-panel preview-panel full-span">
                    <p className="muted small" style=${{ margin: "0 0 8px" }}>Pré-visualização:</p>
                    <img src=${imageUrl} alt="preview" className="preview-image"
                      onError=${(e) => { e.target.style.display = "none"; }} />
                  </div>
                ` : null}
              ` : html`
                <div className="field full-span">
                  <label>ID do vídeo no Facebook *</label>
                  <input type="text" value=${videoId} onInput=${(e) => setVideoId(e.target.value)} placeholder="ID do vídeo (ex: 123456789) — já deve estar na biblioteca de mídia da página" />
                </div>
                <div className="field full-span">
                  <label>URL da thumbnail <span className="muted small">— opcional</span></label>
                  <input type="url" value=${thumbUrl} onInput=${(e) => setThumbUrl(e.target.value)} placeholder="https://seusite.com/thumb.jpg" />
                </div>
              `}
              <div className="field full-span">
                <label>Título (headline) * — máx. 40 caracteres</label>
                <input type="text" value=${headline} onInput=${(e) => setHeadline(e.target.value)} placeholder="Ex: Você precisa ler isso!" maxLength="40" />
                <span className="muted small">${headline.length}/40</span>
              </div>
              <div className="field full-span">
                <label>Texto principal — máx. 125 caracteres</label>
                <textarea value=${adBody} onInput=${(e) => setAdBody(e.target.value)}
                  placeholder="Texto que aparece acima do criativo..."
                  rows="3" maxLength="125"
                  className="field-textarea"
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
              <div className="field full-span">
                <label>URL de destino * (inclua UTMs!)</label>
${(() => {
                  const UTM_SUFFIX = `utm_source=fb&utm_medium=cpc&utm_campaign=${encodeURIComponent(campName)}&utm_term=${encodeURIComponent(adsetName)}&utm_content=${encodeURIComponent(adName)}&ad_id={{ad.id}}`;
                  const filtered = _savedUrls.filter((u) => !u.nicho || !nicho || u.nicho === nicho.slug);
                  return filtered.length > 0 ? html`
                    <select style=${{ marginBottom: "6px", fontSize: "0.85rem" }}
                      onChange=${(e) => {
                        if (!e.target.value) return;
                        const base = e.target.value;
                        const sep = base.includes("?") ? "&" : "?";
                        setDestUrl(base + sep + UTM_SUFFIX);
                        e.target.value = "";
                      }}>
                      <option value="">⚡ Usar URL salva...</option>
                      ${filtered.map((u, i) => html`<option key=${i} value=${u.url}>${u.nome}</option>`)}
                    </select>
                  ` : null;
                })()}
                <input type="url" value=${destUrl} onInput=${(e) => setDestUrl(e.target.value)} placeholder="https://seusite.com/artigo?utm_source=fb&utm_medium=cpc&utm_content={{ad.name}}" />
                <div className="action-row" style=${{ marginTop: "6px" }}>
                  <span className="muted small">Macros:</span>
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
          ${!skipAd && savedAds.length > 0 ? html`
            <div className="soft-panel accent compact" style=${{ marginBottom: "4px" }}>
              <p className="helper-text-inline" style=${{ marginBottom: "8px" }}>Anúncios já salvos (${savedAds.length}):</p>
              ${savedAds.map((a, i) => html`
                <div key=${i} className="action-row-between" style=${{ padding: "4px 0", borderBottom: i < savedAds.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <span><strong>AN${a._anNum}</strong> — ${a.name || "(sem nome)"} · ${a.ad_format === "video" ? "Vídeo" : "Imagem"}</span>
                  <button className="ghost small" style=${{ color: "var(--danger)" }} onClick=${() => setSavedAds((prev) => prev.filter((_, j) => j !== i))}>✕</button>
                </div>
              `)}
            </div>
          ` : null}

          <div className="action-row-between">
            <button onClick=${() => setStep(2)}>â† Voltar</button>
            <div className="action-group">
              ${!skipAd ? html`
                <button className="ghost" disabled=${!step3Valid} onClick=${() => {
                  setSavedAds((prev) => [...prev, snapshotCurrentAd()]);
                  const nextAn = String(savedAds.length + 2).padStart(2, "0");
                  setAnNum(nextAn);
                  setAdNameManual(false);
                  setImageUrl(""); setVideoId(""); setThumbUrl("");
                  setHeadline(""); setAdBody(""); setAdDescription("");
                }}>
                  ➕ Salvar e adicionar outro anúncio
                </button>
              ` : null}
              <button className="primary" disabled=${!step3Valid} onClick=${() => setStep(4)}>
                Revisar →
              </button>
            </div>
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
          <div className="review-grid">
            <div className="review-card primary">
              <p className="eyebrow" style=${{ marginBottom: "12px" }}>🎯 Campanha</p>
              <p><strong>Nome:</strong> ${campName}</p>
              <p><strong>Objetivo:</strong> ${OBJECTIVES.find((o) => o.value === objective)?.label}</p>
              <p><strong>Status:</strong> ${campStatus === "PAUSED" ? "Pausado" : "Ativo"}</p>
              ${specialCat !== "NONE" ? html`<p><strong>Categoria especial:</strong> ${specialCat}</p>` : null}
              ${cbo ? html`<p><strong>CBO:</strong> R$ ${campBudget} (${campBudgetType === "daily" ? "diário" : "vitalício"})</p>` : null}
              ${spendingLimit ? html`<p><strong>Limite de gastos:</strong> R$ ${spendingLimit}</p>` : null}
            </div>
            <div className="review-card">
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
            <div className="review-card">
              <p className="eyebrow" style=${{ marginBottom: "12px" }}>📣 Anúncio</p>
              ${skipAd ? html`<p className="muted small">Não incluído — adicionar depois.</p>` : html`
                <p><strong>Nome:</strong> ${adName || `${campName} — Anúncio`}</p>
                <p><strong>Formato:</strong> ${adFormat === "image" ? "Imagem" : "Vídeo"}</p>
                ${igActorId ? html`<p><strong>Conta IG:</strong> ${(() => {
                  const igAccounts = (pages || []).flatMap((p) => p.instagram_business_account ? [{ id: p.instagram_business_account.id, username: p.instagram_business_account.username || p.instagram_business_account.name }] : []);
                  const found = igAccounts.find((a) => a.id === igActorId);
                  return found ? `@${found.username}` : igActorId;
                })()}</p>` : null}
                <p><strong>Título:</strong> ${headline}</p>
                <p><strong>CTA:</strong> ${CTA_TYPES.find((c) => c.value === ctaType)?.label}</p>
                <p className="review-url"><strong>URL:</strong> ${destUrl}</p>
              `}
            </div>
          </div>
          ${(savedAdsets.length > 0 || savedAds.length > 0) ? html`
            <div className="soft-panel accent">
              <strong>📊 Estrutura a criar:</strong>
              ${' '}${savedAdsets.length + 1} conjunto(s) × ${skipAd ? 0 : savedAds.length + 1} anúncio(s)
              ${' '}= <strong>${skipAd ? savedAdsets.length + 1 : (savedAdsets.length + 1) * (savedAds.length + 1)} combinação(ões)</strong>
              ${savedAdsets.length > 0 ? html`
                <ul style=${{ margin: "8px 0 0 16px", fontSize: "0.83rem" }}>
                  ${savedAdsets.map((s, i) => html`<li key=${i}>CJ${s._cjNum} — ${s.name}</li>`)}
                  <li><strong>CJ${cjNum} — ${adsetName || "(atual)"}</strong></li>
                </ul>
              ` : null}
            </div>
          ` : null}
          <div className="soft-panel warn">
            <strong>âš ï¸ Atenção:</strong> tudo será criado com status <strong>${campStatus === "PAUSED" ? "Pausado" : "Ativo"}</strong>.
            ${campStatus === "ACTIVE" ? html` <span className="muted small">Isso significa que os anúncios entrarão em veiculação imediatamente após aprovação do Meta.</span>` : null}
          </div>
          <div className="action-row-between">
            <button onClick=${() => setStep(3)} disabled=${publishing}>â† Voltar</button>
            <button className="primary publish-btn" onClick=${handlePublish} disabled=${publishing}>
              ${publishing ? "Criando..." : "🚀 Publicar campanha"}
            </button>
          </div>
        </section>
      `}
    </div>
  `;
}

const DEFAULT_DOMAINS = [
  "remediototal.com.br",
  "br.remediototal.com.br",
  "es.remediototal.com.br",
  "intre.remediototal.com.br",
];

const PAISES_NICHOS = [
  // América do Sul
  "Argentina", "Bolívia", "Brasil", "Chile", "Colômbia", "Equador",
  "Guiana", "Guiana Francesa", "Paraguai", "Peru", "Suriname", "Uruguai", "Venezuela",
  // América do Norte
  "Estados Unidos", "Canadá", "México", "Cuba", "Guatemala", "Honduras",
  "Costa Rica", "Panamá", "República Dominicana", "El Salvador", "Nicarágua",
  // Europa
  "Alemanha", "França", "Espanha", "Portugal", "Itália", "Reino Unido",
  "Países Baixos", "Bélgica", "Suécia", "Noruega", "Dinamarca", "Finlândia",
  "Suíça", "Ãustria", "Polônia", "República Tcheca", "Hungria", "Romênia",
  "Grécia", "Croácia", "Irlanda", "Ucrânia",
];

function PaisSelect({ value, onChange, placeholder, inputStyle, onEnter }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const ref = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.trim()
    ? PAISES_NICHOS.filter((p) => p.toLowerCase().includes(query.toLowerCase()))
    : PAISES_NICHOS;

  const select = (p) => { onChange(p); setQuery(p); setOpen(false); };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered.length > 0) {
        select(filtered[0]);
        if (onEnter) setTimeout(onEnter, 0);
      } else if (query.trim() && onEnter) {
        onEnter();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return html`
    <div ref=${ref} style=${{ position: "relative" }}>
      <input
        type="text"
        value=${query}
        onFocus=${() => setOpen(true)}
        onInput=${(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onKeyDown=${handleKeyDown}
        placeholder=${placeholder || "Digite para buscar..."}
        style=${{ width: "100%", boxSizing: "border-box", ...inputStyle }}
      />
      ${open && filtered.length > 0 ? html`
        <ul style=${{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 300,
          background: "#fff", border: "1px solid #dde", borderRadius: "12px",
          boxShadow: "0 6px 20px rgba(0,0,0,0.10)",
          maxHeight: "180px", overflowY: "auto",
          margin: 0, padding: "4px 0", listStyle: "none",
          fontSize: "0.86rem", color: "#1a1a2e",
        }}>
          ${filtered.map((p) => html`
            <li key=${p}
              onMouseDown=${(e) => { e.preventDefault(); select(p); }}
              onMouseEnter=${(e) => { e.currentTarget.style.background = "#f0f1ff"; }}
              onMouseLeave=${(e) => { e.currentTarget.style.background = "transparent"; }}
              style=${{ padding: "7px 14px", cursor: "pointer", color: "#1a1a2e" }}
            >${p}</li>
          `)}
        </ul>
      ` : null}
    </div>
  `;
}

function ConfiguracoesView({ settings, onSave, saving }) {
  const [domains, setDomains] = useState(settings.domains?.length ? settings.domains : [...DEFAULT_DOMAINS]);
  const [metaAccountId, setMetaAccountId] = useState(settings.metaAccountId || "");
  const [metaTaxEnabled, setMetaTaxEnabled] = useState(settings.metaTaxEnabled !== false);
  const [metaTaxRatePercent, setMetaTaxRatePercent] = useState(settings.metaTaxRatePercent ?? 12.15);
  const [metaTaxEffectiveDate, setMetaTaxEffectiveDate] = useState(settings.metaTaxEffectiveDate || "2026-01-01");
  const [metaTaxMode, setMetaTaxMode] = useState(settings.metaTaxMode === "included" ? "included" : "add");
  const [reportType, setReportType] = useState(settings.reportType || "Analytical");
  const [includeAssets, setIncludeAssets] = useState(!!settings.includeAssets);
  const [showMessagesLtvTable, setShowMessagesLtvTable] = useState(settings.showMessagesLtvTable !== false);
  const [messagesLtvExtraDays, setMessagesLtvExtraDays] = useState(
    OPTIONAL_LTV_DAYS.filter((day) =>
      (Array.isArray(settings.messagesLtvExtraDays) ? settings.messagesLtvExtraDays : [])
        .map(Number)
        .includes(day)
    )
  );
  const [nichos, setNichos] = useState(Array.isArray(settings.nichos) ? settings.nichos : []);
  const [urls, setUrls] = useState(Array.isArray(settings.urls) ? settings.urls : []);
  const [users, setUsers] = useState(
    Array.isArray(settings.users)
      ? settings.users.map((user) => ({
          ...user,
          password: "",
          allowedDomains: Array.isArray(user.allowedDomains) ? user.allowedDomains : [],
          commissionPercent: normalizeCommissionPercent(user.commissionPercent),
          active: user.active !== false,
        }))
      : []
  );
  const [newUrlNome, setNewUrlNome] = useState("");
  const [newUrlValue, setNewUrlValue] = useState("");
  const [newUrlNicho, setNewUrlNicho] = useState("");
  const [editingUrlIdx, setEditingUrlIdx] = useState(null);
  const [editUrlNome, setEditUrlNome] = useState("");
  const [editUrlValue, setEditUrlValue] = useState("");
  const [editUrlNicho, setEditUrlNicho] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newNichoNome, setNewNichoNome] = useState("");
  const [newNichoSlug, setNewNichoSlug] = useState("");
  const [newNichoPaises, setNewNichoPaises] = useState([]);
  const [newNichoPaisInput, setNewNichoPaisInput] = useState("");
  const [editingSlug, setEditingSlug] = useState(null);
  const [editNome, setEditNome] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editPaises, setEditPaises] = useState([]);
  const [editPaisInput, setEditPaisInput] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const toggleMessagesLtvExtraDay = (day, checked) => {
    setMessagesLtvExtraDays((prev) => {
      const current = new Set((Array.isArray(prev) ? prev : []).map(Number));
      if (checked) current.add(day);
      else current.delete(day);
      return OPTIONAL_LTV_DAYS.filter((item) => current.has(item));
    });
  };

  const toSlug = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const addNicho = () => {
    const nome = newNichoNome.trim();
    if (!nome) return;
    const slug = newNichoSlug.trim() || toSlug(nome);
    if (nichos.find((n) => n.slug === slug)) return;
    setNichos([...nichos, { nome, slug, paises: newNichoPaises }]);
    setNewNichoNome(""); setNewNichoSlug(""); setNewNichoPaises([]); setNewNichoPaisInput("");
  };

  const addNewPais = () => {
    const p = newNichoPaisInput.trim();
    if (!p || newNichoPaises.includes(p)) return;
    setNewNichoPaises([...newNichoPaises, p]);
    setNewNichoPaisInput("");
  };

  const addEditPais = () => {
    const p = editPaisInput.trim();
    if (!p || editPaises.includes(p)) return;
    setEditPaises([...editPaises, p]);
    setEditPaisInput("");
  };

  const startEditNicho = (n) => { setEditingSlug(n.slug); setEditNome(n.nome); setEditSlug(n.slug); setEditPaises(Array.isArray(n.paises) ? n.paises : (n.pais ? [n.pais] : [])); setEditPaisInput(""); };
  const cancelEditNicho = () => { setEditingSlug(null); setEditNome(""); setEditSlug(""); setEditPaises([]); setEditPaisInput(""); };
  const saveEditNicho = (originalSlug) => {
    const nome = editNome.trim();
    const slug = editSlug.trim() || toSlug(nome);
    if (!nome || !slug) return;
    setNichos(nichos.map((n) => n.slug === originalSlug ? { nome, slug, paises: editPaises } : n));
    cancelEditNicho();
  };

  const removeNicho = (slug) => setNichos(nichos.filter((n) => n.slug !== slug));

  const addUrl = () => {
    const nome = newUrlNome.trim();
    const url = newUrlValue.trim();
    if (!nome || !url) return;
    setUrls([...urls, { nome, url, nicho: newUrlNicho || null }]);
    setNewUrlNome(""); setNewUrlValue(""); setNewUrlNicho("");
  };
  const removeUrl = (i) => setUrls(urls.filter((_, j) => j !== i));
  const startEditUrl = (i) => { setEditingUrlIdx(i); setEditUrlNome(urls[i].nome); setEditUrlValue(urls[i].url); setEditUrlNicho(urls[i].nicho || ""); };
  const saveEditUrl = (i) => {
    const nome = editUrlNome.trim(); const url = editUrlValue.trim();
    if (!nome || !url) return;
    setUrls(urls.map((u, j) => j === i ? { nome, url, nicho: editUrlNicho || null } : u));
    setEditingUrlIdx(null); setEditUrlNome(""); setEditUrlValue(""); setEditUrlNicho("");
  };

  const addDomain = () => {
    const d = newDomain.trim().toLowerCase();
    if (!d || domains.includes(d)) return;
    setDomains([...domains, d]);
    setNewDomain("");
  };

  const removeDomain = (d) => {
    setDomains(domains.filter((x) => x !== d));
    setUsers((prev) =>
      prev.map((user) => ({
        ...user,
        allowedDomains: (user.allowedDomains || []).filter((item) => item !== d),
      }))
    );
  };

  const addUser = () => {
    setUsers((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}-${prev.length}`,
        nome: "",
        username: "",
        password: "",
        role: "gestor",
        allowedDomains: domains[0] ? [domains[0]] : [],
        commissionPercent: 0,
        active: true,
        lastLoginAt: null,
      },
    ]);
  };

  const updateUser = (id, patch) => {
    setUsers((prev) =>
      prev.map((user) => (user.id === id ? { ...user, ...patch } : user))
    );
  };

  const removeUser = (id) => {
    setUsers((prev) => prev.filter((user) => user.id !== id));
  };

  const toggleUserDomain = (id, domain) => {
    setUsers((prev) =>
      prev.map((user) => {
        if (user.id !== id) return user;
        const current = new Set(user.allowedDomains || []);
        if (current.has(domain)) current.delete(domain);
        else current.add(domain);
        return { ...user, allowedDomains: Array.from(current) };
      })
    );
  };

  const handleSave = async () => {
    try {
      await onSave({
        domains,
        metaAccountId,
        metaTaxEnabled,
        metaTaxRatePercent: Math.min(99.99, Math.max(0, toNumber(metaTaxRatePercent))),
        metaTaxEffectiveDate,
        metaTaxMode,
        reportType,
        includeAssets,
        showMessagesLtvTable,
        messagesLtvExtraDays,
        nichos,
        urls,
        users: users.map((user) => ({
          id: user.id,
          nome: user.nome,
          username: user.username,
          password: user.password || "",
          role: user.role,
          allowedDomains: user.allowedDomains || [],
          commissionPercent: normalizeCommissionPercent(user.commissionPercent),
          active: user.active !== false,
        })),
      });
      setSaveMsg("✓ Salvo com sucesso!");
    } catch (err) {
      setSaveMsg("Erro ao salvar: " + (err.message || "tente novamente"));
    }
    setTimeout(() => setSaveMsg(""), 5000);
  };

  return html`
    <main className="grid">
      <section className="card wide">
        <div className="card-head">
          <div>
            <span className="eyebrow">Dashboard</span>
            <h2 className="section-title">Configurações</h2>
          </div>
          <div className="settings-toolbar">
            ${saveMsg ? html`<span className=${`settings-save-msg ${saveMsg.startsWith("Erro") ? "error" : "success"}`}>${saveMsg}</span>` : null}
            <button className="primary" onClick=${handleSave} disabled=${saving}>
              ${saving ? "Salvando..." : "Salvar configurações"}
            </button>
          </div>
        </div>

        <div className="filters section-gap">
          <div className="field">
            <label>ID da conta Meta</label>
            <input
              type="text"
              value=${metaAccountId}
              onInput=${(e) => setMetaAccountId(e.target.value)}
              placeholder="ex.: act_123456789"
            />
            <span className="muted small">Usado em análises, duplicação e criação de campanhas.</span>
          </div>
          <div className="field">
            <label>Impostos nas cobranças Meta</label>
            <label className="checkbox checkbox-row" style=${{ marginTop: "4px" }}>
              <input type="checkbox" checked=${metaTaxEnabled} onChange=${(e) => setMetaTaxEnabled(e.target.checked)} />
              <span>Incluir no custo real</span>
            </label>
            <span className="muted small">Aplicado por data, sem alterar o dado bruto recebido da API.</span>
          </div>
          <div className="field">
            <label>Alíquota total (%)</label>
            <input type="number" min="0" max="99.99" step="0.01" value=${metaTaxRatePercent} onInput=${(e) => setMetaTaxRatePercent(e.target.value)} disabled=${!metaTaxEnabled} />
          </div>
          <div className="field">
            <label>Vigência inicial</label>
            <input type="date" value=${metaTaxEffectiveDate} onInput=${(e) => setMetaTaxEffectiveDate(e.target.value)} disabled=${!metaTaxEnabled} />
          </div>
          <div className="field">
            <label>Como a API informa o gasto</label>
            <select value=${metaTaxMode} onChange=${(e) => setMetaTaxMode(e.target.value)} disabled=${!metaTaxEnabled}>
              <option value="add">Sem imposto — somar ao gasto</option>
              <option value="included">Imposto já incluído — não somar</option>
            </select>
            <span className="muted small">Use “já incluído” se a Meta passar a retornar o total cobrado no campo spend.</span>
          </div>
          <div className="field">
            <label>Tipo de relatório</label>
            <select value=${reportType} onChange=${(e) => setReportType(e.target.value)}>
              <option value="Analytical">Analytical</option>
              <option value="Synthetic">Synthetic</option>
            </select>
          </div>
          <div className="field">
            <label>Carregar criativos (Meta)</label>
            <label className="checkbox checkbox-row" style=${{ marginTop: "4px" }}>
              <input
                type="checkbox"
                checked=${!!includeAssets}
                onChange=${(e) => setIncludeAssets(e.target.checked)}
              />
              <span>Ativado (mais lento)</span>
            </label>
            <span className="muted small">Carrega imagens e vídeos dos anúncios ao buscar dados da Meta.</span>
          </div>
          <div className="field">
            <label>LTV Mensagens</label>
            <label className="checkbox checkbox-row" style=${{ marginTop: "4px" }}>
              <input
                type="checkbox"
                checked=${!!showMessagesLtvTable}
                onChange=${(e) => setShowMessagesLtvTable(e.target.checked)}
              />
              <span>Mostrar tabela de LTV</span>
            </label>
            <span className="muted small">
              Exibe ou oculta a tabela de coortes por <code>utm_term=lead_id</code> em Metricas Mensagens.
            </span>
            <div className="muted small" style=${{ marginTop: "10px" }}>
              Colunas extras de LTV (D0-D3 ficam sempre ativos):
            </div>
            <div style=${{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "6px" }}>
              ${OPTIONAL_LTV_DAYS.map((day) => html`
                <label key=${day} className="checkbox checkbox-row">
                  <input
                    type="checkbox"
                    checked=${messagesLtvExtraDays.includes(day)}
                    onChange=${(e) => toggleMessagesLtvExtraDay(day, e.target.checked)}
                  />
                  <span>D${day}</span>
                </label>
              `)}
            </div>
          </div>
        </div>

        <div className="settings-section first">
          <h3 className="settings-title spacious">Domínios</h3>
          <div className="pill-list">
            ${domains.map((d) => html`
              <span key=${d} className="pill">
                ${d}
                <button
                  onClick=${() => removeDomain(d)}
                  className="pill-remove"
                >✕</button>
              </span>
            `)}
          </div>
          <div className="inline-form-row compact">
            <input
              type="text"
              value=${newDomain}
              onInput=${(e) => setNewDomain(e.target.value)}
              onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); addDomain(); } }}
              placeholder="ex.: meudominio.com.br"
              className="grow-input"
            />
            <button className="ghost" onClick=${addDomain} disabled=${!newDomain.trim()}>
              + Adicionar
            </button>
          </div>
          <p className="muted small" style=${{ marginTop: "8px" }}>Esses domínios ficam disponíveis no seletor de Domínio dos filtros.</p>
        </div>

        <div className="settings-section">
          <div className="card-head">
            <div>
              <h3 className="settings-title">Usu\u00e1rios</h3>
              <p className="muted small settings-lead">
                Cadastre gestores e editores direto pelo dashboard. O admin principal continua separado.
              </p>
            </div>
            <button className="ghost" onClick=${addUser} disabled=${!domains.length}>
              + Adicionar usu\u00e1rio
            </button>
          </div>
          ${users.length === 0
            ? html`<p className="muted small">Nenhum usu\u00e1rio cadastrado ainda.</p>`
            : html`
                <div className="settings-user-grid">
                  ${users.map((user, index) => html`
                    <div key=${user.id || index} className="settings-user-card">
                      <div className="settings-user-head">
                        <div>
                          <strong>${user.nome || `Usu\u00e1rio ${index + 1}`}</strong>
                           <div className="muted small">
                             ${user.username || "sem username"} | ${user.role === "editor" ? "Editor" : "Gestor"} | Comissao ${normalizeCommissionPercent(user.commissionPercent).toFixed(2)}%
                           </div>
                        </div>
                        <button className="icon-danger-btn" onClick=${() => removeUser(user.id)}>x</button>
                      </div>
                      <div className="settings-user-form">
                        <div className="field-stack">
                          <label className="field-label">Nome</label>
                          <input
                            type="text"
                            value=${user.nome || ""}
                            onInput=${(e) => updateUser(user.id, { nome: e.target.value })}
                            placeholder="Nome do usu\u00e1rio"
                          />
                        </div>
                        <div className="field-stack">
                          <label className="field-label">Username</label>
                          <input
                            type="text"
                            value=${user.username || ""}
                            onInput=${(e) => updateUser(user.id, { username: e.target.value.toLowerCase() })}
                            placeholder="usuario"
                          />
                        </div>
                        <div className="field-stack">
                          <label className="field-label">Senha</label>
                          <input
                            type="password"
                            value=${user.password || ""}
                            onInput=${(e) => updateUser(user.id, { password: e.target.value })}
                            placeholder=${user.lastLoginAt ? "Deixe em branco para manter" : "Defina uma senha"}
                          />
                        </div>
                        <div className="field-stack">
                          <label className="field-label">Papel</label>
                          <select
                            value=${user.role || "gestor"}
                            onChange=${(e) => updateUser(user.id, { role: e.target.value })}
                          >
                            <option value="gestor">Gestor</option>
                            <option value="editor">Editor</option>
                          </select>
                        </div>
                        <div className="field-stack">
                          <label className="field-label">Comissao (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value=${user.commissionPercent ?? 0}
                            onInput=${(e) => updateUser(user.id, { commissionPercent: e.target.value })}
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <label className="checkbox checkbox-row settings-user-active">
                        <input
                          type="checkbox"
                          checked=${user.active !== false}
                          onChange=${(e) => updateUser(user.id, { active: e.target.checked })}
                        />
                        <span>Usu\u00e1rio ativo</span>
                      </label>
                      <div className="field-stack">
                        <label className="field-label">Dom\u00ednios permitidos</label>
                        <div className="settings-user-domains">
                          ${domains.map((domain) => html`
                            <label key=${domain} className="checkbox checkbox-row settings-user-domain">
                              <input
                                type="checkbox"
                                checked=${(user.allowedDomains || []).includes(domain)}
                                onChange=${() => toggleUserDomain(user.id, domain)}
                              />
                              <span>${domain}</span>
                            </label>
                          `)}
                        </div>
                      </div>
                      <div className="muted small">
                        \u00daltimo login: ${user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "nunca"}
                      </div>
                    </div>
                  `)}
                </div>
              `}
          <p className="muted small" style=${{ marginTop: "8px" }}>
            Gestor acessa dashboard e cria campanhas. Editor entra em uma \u00e1rea separada.
          </p>
        </div>

        <div className="settings-section">
          <h3 className="settings-title">Nichos</h3>
          <p className="muted small settings-lead">Nichos cadastrados aparecem no Passo 1 da criação de campanhas e serão usados para padronizar nomes, URLs e UTMs.</p>
          ${nichos.length === 0
              ? html`<p className="muted small" style=${{ marginBottom: "12px" }}>Nenhum nicho cadastrado ainda.</p>`
              : html`
                <div className="table-card">
                  <table className="simple-table">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>ID</th>
                        <th>País</th>
                        <th style=${{ width: "120px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${nichos.map((n) => html`
                        <tr key=${n.slug} className=${editingSlug === n.slug ? "is-editing" : ""}>
                          ${editingSlug === n.slug ? html`
                            <td className="table-cell-tight">
                              <input type="text" value=${editNome} onInput=${(e) => setEditNome(e.target.value)}
                                className="table-input" />
                            </td>
                            <td className="table-cell-tight">
                              <input type="text" value=${editSlug} onInput=${(e) => setEditSlug(e.target.value)} placeholder=${toSlug(editNome)}
                                className="table-input mono" />
                            </td>
                            <td className="table-cell-tight">
                              <div className="tag-list sm" style=${{ marginBottom: editPaises.length ? "6px" : 0 }}>
                                ${editPaises.map((p) => html`
                                  <span key=${p} className="tag-chip sm">
                                    ${p}
                                    <button onMouseDown=${(e) => { e.preventDefault(); setEditPaises(editPaises.filter((x) => x !== p)); }} className="tag-chip-remove">✕</button>
                                  </span>
                                `)}
                              </div>
                              <div className="form-inline-tight">
                                <${PaisSelect}
                                  value=${editPaisInput}
                                  onChange=${(v) => setEditPaisInput(v)}
                                  onEnter=${addEditPais}
                                  placeholder="Adicionar país..."
                                  inputStyle=${{ padding: "5px 8px", borderRadius: "8px", border: "1px solid var(--accent)", fontSize: "0.82rem", minWidth: 0 }}
                                />
                                <button onClick=${addEditPais} disabled=${!editPaisInput.trim()} className="primary small">+</button>
                              </div>
                            </td>
                            <td className="table-cell-actions">
                              <button className="primary" onClick=${() => saveEditNicho(n.slug)} style=${{ padding: "4px 12px", fontSize: "0.82rem", marginRight: "4px" }}>✓</button>
                              <button className="ghost" onClick=${cancelEditNicho} style=${{ padding: "4px 10px", fontSize: "0.82rem" }}>✕</button>
                            </td>
                          ` : html`
                            <td><strong>${n.nome}</strong></td>
                            <td className="table-cell-mono">${n.slug}</td>
                            <td>
                              ${(() => {
                                const lista = Array.isArray(n.paises) ? n.paises : (n.pais ? [n.pais] : []);
                                return lista.length
                                  ? html`<div className="tag-list sm">
                                      ${lista.map((p) => html`<span key=${p} className="tag-chip sm">${p}</span>`)}
                                    </div>`
                                  : html`<span className="muted">—</span>`;
                              })()}
                            </td>
                            <td className="table-cell-actions">
                              <button className="ghost" onClick=${() => startEditNicho(n)} style=${{ padding: "3px 10px", fontSize: "0.8rem", marginRight: "4px" }}>Editar</button>
                              <button onClick=${() => removeNicho(n.slug)} className="icon-danger-btn">✕</button>
                            </td>
                          `}
                        </tr>
                      `)}
                    </tbody>
                  </table>
                </div>
              `
            }
          <div className="inline-form-row">
            <div className="field-stack field-grow-wide">
              <label className="field-label">Nome *</label>
              <input
                type="text"
                value=${newNichoNome}
                onInput=${(e) => { setNewNichoNome(e.target.value); setNewNichoSlug(toSlug(e.target.value)); }}
                onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); addNicho(); } }}
                placeholder="ex: Saúde"
              />
            </div>
            <div className="field-stack field-grow">
              <label className="field-label">ID</label>
              <input
                type="text"
                value=${newNichoSlug}
                onInput=${(e) => setNewNichoSlug(e.target.value)}
                onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); addNicho(); } }}
                placeholder="ex: saude"
                style=${{ fontFamily: "monospace" }}
              />
            </div>
            <div className="field-stack field-grow-wide">
              <label className="field-label">Países</label>
              <div className="tag-list sm" style=${{ marginBottom: newNichoPaises.length ? "6px" : 0 }}>
                ${newNichoPaises.map((p) => html`
                  <span key=${p} className="tag-chip">
                    ${p}
                    <button onMouseDown=${(e) => { e.preventDefault(); setNewNichoPaises(newNichoPaises.filter((x) => x !== p)); }} className="tag-chip-remove">✕</button>
                  </span>
                `)}
              </div>
              <div className="form-inline-tight">
                <${PaisSelect}
                  value=${newNichoPaisInput}
                  onChange=${(v) => setNewNichoPaisInput(v)}
                  onEnter=${addNewPais}
                  placeholder="Digite para buscar..."
                  inputStyle=${{ padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--border)", fontSize: "0.88rem" }}
                />
                <button onClick=${addNewPais} disabled=${!newNichoPaisInput.trim()} className="ghost">+ País</button>
              </div>
            </div>
            <button className="ghost" onClick=${addNicho} disabled=${!newNichoNome.trim()} style=${{ whiteSpace: "nowrap" }}>+ Adicionar</button>
          </div>
          <p className="muted small" style=${{ marginTop: "8px" }}>O ID é gerado automaticamente a partir do nome — pode ser editado manualmente.</p>
        </div>

        <div className="settings-section">
          <h3 className="settings-title">URLs cadastradas</h3>
          <p className="muted small settings-lead">Cadastre a URL base (sem UTMs). As UTMs serão adicionadas diretamente no campo de URL ao criar o anúncio.</p>
          ${urls.length === 0
            ? html`<p className="muted small" style=${{ marginBottom: "12px" }}>Nenhuma URL cadastrada ainda.</p>`
            : html`
              <div className="table-card">
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Nicho</th>
                      <th>URL</th>
                      <th style=${{ width: "110px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${urls.map((u, i) => html`
                      <tr key=${i} className=${editingUrlIdx === i ? "is-editing" : ""}>
                        ${editingUrlIdx === i ? html`
                          <td className="table-cell-tight" style=${{ minWidth: "130px" }}>
                            <input type="text" value=${editUrlNome} onInput=${(e) => setEditUrlNome(e.target.value)}
                              className="table-input" />
                          </td>
                          <td className="table-cell-tight" style=${{ minWidth: "120px" }}>
                            <select value=${editUrlNicho} onChange=${(e) => setEditUrlNicho(e.target.value)}
                              className="table-input sm">
                              <option value="">Todos</option>
                              ${nichos.map((n) => html`<option key=${n.slug} value=${n.slug}>${n.nome}</option>`)}
                            </select>
                          </td>
                          <td className="table-cell-tight">
                            <input type="url" value=${editUrlValue} onInput=${(e) => setEditUrlValue(e.target.value)}
                              className="table-input sm mono" />
                          </td>
                          <td className="table-cell-actions">
                            <button className="primary" onClick=${() => saveEditUrl(i)} style=${{ padding: "4px 12px", fontSize: "0.82rem", marginRight: "4px" }}>✓</button>
                            <button className="ghost" onClick=${() => setEditingUrlIdx(null)} style=${{ padding: "4px 10px", fontSize: "0.82rem" }}>✕</button>
                          </td>
                        ` : html`
                          <td style=${{ whiteSpace: "nowrap" }}><strong>${u.nome}</strong></td>
                          <td>
                            ${u.nicho
                              ? html`<span className="tag-chip sm">${nichos.find((n) => n.slug === u.nicho)?.nome || u.nicho}</span>`
                              : html`<span className="muted" style=${{ fontSize: "0.8rem" }}>Todos</span>`
                            }
                          </td>
                          <td className="table-cell-url">${u.url}</td>
                          <td className="table-cell-actions">
                            <button className="ghost" onClick=${() => startEditUrl(i)} style=${{ padding: "3px 10px", fontSize: "0.8rem", marginRight: "4px" }}>Editar</button>
                            <button onClick=${() => removeUrl(i)} className="icon-danger-btn">✕</button>
                          </td>
                        `}
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            `
          }
          <div className="inline-form-row">
            <div className="field-stack field-grow">
              <label className="field-label">Nome *</label>
              <input type="text" value=${newUrlNome} onInput=${(e) => setNewUrlNome(e.target.value)}
                placeholder="ex: Oferta principal"
                onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }} />
            </div>
            <div className="field-stack field-grow">
              <label className="field-label">Nicho</label>
              <select value=${newUrlNicho} onChange=${(e) => setNewUrlNicho(e.target.value)}>
                <option value="">Todos</option>
                ${nichos.map((n) => html`<option key=${n.slug} value=${n.slug}>${n.nome}</option>`)}
              </select>
            </div>
            <div className="field-stack field-grow-url">
              <label className="field-label">URL *</label>
              <input type="url" value=${newUrlValue} onInput=${(e) => setNewUrlValue(e.target.value)}
                placeholder="https://seusite.com/artigo"
                onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
                style=${{ fontFamily: "monospace" }} />
            </div>
            <button className="ghost" onClick=${addUrl} disabled=${!newUrlNome.trim() || !newUrlValue.trim()} style=${{ whiteSpace: "nowrap" }}>+ Adicionar</button>
          </div>
        </div>

        <${MediaLibrarySection} accountId=${metaAccountId} />
      </section>
    </main>
  `;
}

function MediaLibrarySection({ accountId }) {
  const [media, setMedia] = useState([]);
  const [labels, setLabels] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentFolder, setCurrentFolder] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [movingKey, setMovingKey] = useState(null);
  const [moveValue, setMoveValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [hidingFolder, setHidingFolder] = useState(null);

  const extractPrefix = (name) => {
    const m = String(name || "").match(/^([a-zA-Z0-9]+)[-_]/);
    return m ? m[1].toLowerCase() : "geral";
  };

  const getFolder = (item, lbs) => (lbs || labels)[item.key]?.folder || extractPrefix(item.name);
  const getDisplayName = (item) => labels[item.key]?.label || item.name;

  const fetchLabels = async (acct) => {
    try {
      const r = await fetch(`/api/media-labels?account_id=${encodeURIComponent(acct)}`);
      const d = await r.json();
      if (d.code === "success") return d.data || {};
    } catch { }
    return {};
  };

  const loadMedia = async () => {
    if (!accountId) { setError("Configure o ID da conta Meta primeiro."); return; }
    setLoading(true); setError(""); setCurrentFolder(null); setEditingKey(null); setMovingKey(null);
    try {
      const [lbs, r] = await Promise.all([
        fetchLabels(accountId),
        fetch(`/api/meta-media?account_id=${encodeURIComponent(accountId)}`),
      ]);
      setLabels(lbs);
      const d = await r.json();
      if (d.code === "success") {
        setMedia([...d.data.images, ...d.data.videos]);
      } else {
        setError(d.error || "Erro ao carregar mídias");
      }
    } catch (err) {
      setError("Erro: " + (err.message || "verifique o token Meta"));
    }
    setLoading(false);
  };

  const saveLabel = async (key, patch) => {
    setSaving(true);
    const updated = { ...labels, [key]: { ...(labels[key] || {}), ...patch } };
    setLabels(updated);
    try {
      await fetch(`/api/media-labels?account_id=${encodeURIComponent(accountId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels: { [key]: updated[key] } }),
      });
    } catch { }
    setSaving(false);
  };

  const commitRename = (key) => {
    if (!editValue.trim()) { setEditingKey(null); return; }
    saveLabel(key, { label: editValue.trim() });
    setEditingKey(null);
  };

  const commitMove = (key) => {
    const folder = moveValue.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") || "geral";
    saveLabel(key, { folder });
    setMovingKey(null);
    setCurrentFolder(folder);
  };

  const hideItem = (key) => {
    saveLabel(key, { hidden: true });
    setEditingKey(null); setMovingKey(null);
  };

  const unhideItem = (key) => {
    saveLabel(key, { hidden: false });
  };

  const hideFolderItems = (folder) => {
    const items = folderMap[folder] || [];
    setSaving(true);
    const patch = {};
    items.forEach((item) => { patch[item.key] = { ...(labels[item.key] || {}), hidden: true }; });
    const updated = { ...labels, ...patch };
    setLabels(updated);
    fetch(`/api/media-labels?account_id=${encodeURIComponent(accountId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labels: patch }),
    }).finally(() => setSaving(false));
    setHidingFolder(null);
  };

  const folderMap = {};
  media.filter((item) => !labels[item.key]?.hidden).forEach((item) => {
    const f = getFolder(item, labels);
    if (!folderMap[f]) folderMap[f] = [];
    folderMap[f].push(item);
  });
  const folderNames = Object.keys(folderMap).sort();
  const hiddenItems = media.filter((item) => labels[item.key]?.hidden);
  const hiddenCount = hiddenItems.length;

  const FolderIcon = () => html`
    <svg width="40" height="36" viewBox="0 0 40 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 8C2 5.79 3.79 4 6 4H15.17C15.70 4 16.21 4.21 16.59 4.59L18.41 6.41C18.79 6.79 19.30 7 19.83 7H34C36.21 7 38 8.79 38 11V30C38 32.21 36.21 34 34 34H6C3.79 34 2 32.21 2 30V8Z" fill="#FFC107" stroke="#E6A800" stroke-width="1.5"/>
      <path d="M2 13H38V30C38 32.21 36.21 34 34 34H6C3.79 34 2 32.21 2 30V13Z" fill="#FFD54F"/>
    </svg>
  `;

  const MediaCard = (item, isHidden) => html`
    <div key=${item.key} className=${`media-card${isHidden ? " is-hidden" : ""}`}>
      <div className="media-thumb">
        ${item.url
          ? html`<img src=${item.url} alt=${item.name} />`
          : html`<div className="media-thumb-fallback">${item.type === "video" ? "🎬" : "ðŸ–¼ï¸"}</div>`
        }
        <span className=${`media-badge ${item.type === "video" ? "video" : "image"}`}>${item.type === "video" ? "VID" : "IMG"}</span>
      </div>
      <div className="media-card-body">
        ${editingKey === item.key ? html`
          <input
            type="text" value=${editValue}
            onInput=${(e) => setEditValue(e.target.value)}
            onKeyDown=${(e) => { if (e.key === "Enter") commitRename(item.key); if (e.key === "Escape") setEditingKey(null); }}
            className="media-input"
          />
          <button onClick=${() => commitRename(item.key)} className="media-save-btn">✓ Salvar</button>
        ` : html`
          <p className="media-card-title">${getDisplayName(item)}</p>
          ${isHidden ? html`
            <button onClick=${() => unhideItem(item.key)} className="media-mini-btn full">ðŸ‘ï¸ Mostrar</button>
          ` : html`
            <div className="media-card-actions">
              <button onClick=${() => { setEditingKey(item.key); setEditValue(getDisplayName(item)); setMovingKey(null); }} title="Renomear" className="media-mini-btn">âœï¸</button>
              <button onClick=${() => { setMovingKey(movingKey === item.key ? null : item.key); setMoveValue(getFolder(item, labels)); setEditingKey(null); }} title="Mover para pasta" className="media-mini-btn">📂</button>
              <button onClick=${() => hideItem(item.key)} title="Ocultar" className="media-mini-btn">🙈</button>
            </div>
          `}
        `}
        ${movingKey === item.key && editingKey !== item.key ? html`
          <div className="media-inline-editor">
            <input
              type="text" value=${moveValue}
              onInput=${(e) => setMoveValue(e.target.value)}
              onKeyDown=${(e) => { if (e.key === "Enter") commitMove(item.key); if (e.key === "Escape") setMovingKey(null); }}
              placeholder="nome-da-pasta"
              className="media-input folder"
            />
            <button onClick=${() => commitMove(item.key)} className="media-move-btn">Mover</button>
          </div>
        ` : null}
      </div>
    </div>
  `;

  return html`
    <div className="media-section">
      <div className="media-toolbar">
        <div>
          <h3 className="settings-title" style=${{ marginBottom: "2px" }}>Biblioteca de Mídia</h3>
          <p className="muted small" style=${{ margin: 0 }}>Imagens e vídeos da conta Meta. Organize por pastas e renomeie os criativos localmente.</p>
        </div>
        <div className="media-toolbar-actions">
          ${hiddenCount > 0 ? html`
            <button className="ghost" onClick=${() => { setCurrentFolder("__hidden__"); setEditingKey(null); setMovingKey(null); }} style=${{ whiteSpace: "nowrap", fontSize: "0.82rem" }}>
              🙈 Ocultos (${hiddenCount})
            </button>
          ` : null}
          <button className="ghost" onClick=${loadMedia} disabled=${loading} style=${{ whiteSpace: "nowrap" }}>
            ${loading ? "Carregando..." : "↺ Carregar mídias"}
          </button>
        </div>
      </div>

      ${error ? html`<div className="status error" style=${{ marginBottom: "12px" }}>${error}</div>` : null}

      ${media.length > 0 ? html`
        <div className="media-statusbar">
          ${currentFolder !== null ? html`
            <button
              onClick=${() => { setCurrentFolder(null); setEditingKey(null); setMovingKey(null); setHidingFolder(null); }}
              className="media-back-btn"
            >â† Pastas</button>
            <span className="media-statustext">/</span>
            <span className="media-statustext" style=${{ fontWeight: 700, color: "var(--ink)" }}>
              ${currentFolder === "__hidden__" ? "🙈 Arquivos Ocultos" : html`ðŸ“ ${currentFolder}`}
            </span>
          ` : html`<span className="media-statustext">${media.length} mídias em ${folderNames.length} pasta${folderNames.length !== 1 ? "s" : ""}${saving ? " — salvando..." : ""}</span>`}
        </div>
      ` : null}

      ${currentFolder === "__hidden__" ? html`
        ${hiddenItems.length === 0 ? html`
          <p className="muted small media-empty">Nenhum arquivo oculto.</p>
        ` : html`
          <div className="media-grid">
            ${hiddenItems.map((item) => MediaCard(item, true))}
          </div>
        `}
      ` : currentFolder !== null ? html`
        <div className="media-grid">
          ${(folderMap[currentFolder] || []).map((item) => MediaCard(item, false))}
        </div>
        ${(folderMap[currentFolder] || []).length === 0 ? html`
          <p className="muted small media-empty">Pasta vazia.</p>
        ` : null}
      ` : html`
        <div className="folder-grid">
          ${folderNames.map((folder) => {
            const items = folderMap[folder];
            const isConfirming = hidingFolder === folder;
            return html`
              <div key=${folder} className="folder-card-wrap">
                <div
                  onClick=${() => { if (!isConfirming) { setCurrentFolder(folder); setEditingKey(null); setMovingKey(null); } }}
                  className=${`folder-card${isConfirming ? " confirming" : ""}`}
                >
                  <div className="folder-thumb">
                    <${FolderIcon} />
                  </div>
                  <div className="folder-body">
                    ${isConfirming ? html`
                      <p className="folder-confirm-text">Ocultar todos os ${items.length} itens?</p>
                      <div className="folder-confirm-actions">
                        <button onClick=${(e) => { e.stopPropagation(); hideFolderItems(folder); }} className="folder-confirm-primary">Sim</button>
                        <button onClick=${(e) => { e.stopPropagation(); setHidingFolder(null); }} className="folder-confirm-secondary">Não</button>
                      </div>
                    ` : html`
                      <p className="folder-name">${folder}</p>
                      <div className="folder-meta">
                        <p className="folder-count">${items.length} item${items.length !== 1 ? "s" : ""}</p>
                        <button onClick=${(e) => { e.stopPropagation(); setHidingFolder(folder); }} title="Ocultar pasta" className="folder-hide-btn">🙈</button>
                      </div>
                    `}
                  </div>
                </div>
              </div>
            `;
          })}
        </div>
      `}

      ${media.length === 0 && !loading ? html`
        <p className="muted small media-empty">Clique em "↺ Carregar mídias" para visualizar imagens e vídeos da conta Meta.</p>
      ` : null}
    </div>
  `;
}

function LoginView({ onAuthed }) {
  const [login, setLogin] = useState("");
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
        body: JSON.stringify({ login: login.trim(), password }),
      });
      const data = await res.json();
      if (data.code === "success") {
        onAuthed(data.session || null);
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
        </div>
        <form onSubmit=${handleSubmit} className="login-form">
          ${error ? html`<div className="login-error">${error}</div>` : null}
          <div className="field">
            <label>Usu\u00e1rio ou e-mail</label>
            <input
              type="text"
              value=${login}
              onInput=${(e) => setLogin(e.target.value)}
              placeholder="usuario ou seu@email.com"
              required
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label>Senha</label>
            <div style=${{ position: "relative" }}>
              <input
                type=${showPwd ? "text" : "password"}
                value=${password}
                onInput=${(e) => setPassword(e.target.value)}
                placeholder="********"
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
          <button type="submit" className="primary login-btn" disabled=${loading || !login || !password}>
            ${loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  `;
}

function EditorPlaceholderView({ session, onLogout }) {
  return html`
    <div className="layout">
      <header className="topbar">
        <div>
          <h1>Painel do Editor</h1>
          <p className="subtitle">
            \u00c1rea reservada para o editor de v\u00eddeo.
            <span className="muted small"> | Em constru\u00e7\u00e3o</span>
          </p>
        </div>
        <div className="actions">
          ${html`<${ThemeToggle} />`}
          <div className="login-topbar-user">
            <span className="login-topbar-email">${getSessionName(session)}</span>
            <button className="ghost" style=${{ fontSize: "0.8rem", padding: "5px 12px" }} onClick=${onLogout}>
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="grid">
        <section className="card wide">
          <div className="card-head">
            <div>
              <span className="eyebrow">Editor</span>
              <h2 className="section-title">Painel em constru\u00e7\u00e3o</h2>
            </div>
            <span className="chip neutral">${session?.role || "editor"}</span>
          </div>
          <p className="muted">
            Este acesso j\u00e1 est\u00e1 separado do dashboard operacional. Quando o fluxo do editor for definido,
            esta \u00e1rea pode receber tarefas, fila de criativos, status e entregas.
          </p>
        </section>
      </main>
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
    pageId: "",
    includeAssets: false,
  });
  const [superFilter, setSuperFilter] = useState([]);
  const [joinadsContentRows, setJoinadsContentRows] = useState([]);
  const [joinadsCampaignRows, setJoinadsCampaignRows] = useState([]);
  const [joinadsUserRows, setJoinadsUserRows] = useState([]);
  const [joinadsMediumRows, setJoinadsMediumRows] = useState([]);
  const [joinadsSuperFilterDiagnostics, setJoinadsSuperFilterDiagnostics] = useState({});
  const [advertiserRows, setAdvertiserRows] = useState([]);
  const [advertiserDiagnostics, setAdvertiserDiagnostics] = useState({});
  const [messenleadSources, setMessenleadSources] = useState([]);
  const [messenleadUnresolved, setMessenleadUnresolved] = useState([]);
  const [messenleadLeads, setMessenleadLeads] = useState([]);
  const [messenleadUnresolvedLeadIds, setMessenleadUnresolvedLeadIds] = useState([]);
  const [messenleadLeadDiagnostics, setMessenleadLeadDiagnostics] = useState({});
  const [topUrls, setTopUrls] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [earningsAll, setEarningsAll] = useState([]);
  const [keyValueContent, setKeyValueContent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [snapshotEligible, setSnapshotEligible] = useState(false);
  const [loadHealth, setLoadHealth] = useState({});
  const restoredSnapshotRef = useRef(false);
  const [domains, setDomains] = useState([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [metaRows, setMetaRows] = useState([]);
  const [metaLtvRows, setMetaLtvRows] = useState([]);
  const [metaDiagnostics, setMetaDiagnostics] = useState({});
  const [fxInfo, setFxInfo] = useState(() => readCachedFxInfo(formatDate(new Date())));
  const [fxStatus, setFxStatus] = useState("idle");
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard | urls
  const [paramPairs, setParamPairs] = useState([]);
  const [superKey, setSuperKey] = useState("utm_content");
  const [metaSourceRows, setMetaSourceRows] = useState([]);
  const [superTermRows, setSuperTermRows] = useState([]);
  const [joinadsTermDailyRows, setJoinadsTermDailyRows] = useState([]);
  const [adStatusLoading, setAdStatusLoading] = useState({});
  const [budgetLoading, setBudgetLoading] = useState({});
  const [bidLoading, setBidLoading] = useState({});
  const [bidFeedback, setBidFeedback] = useState({});
  const [bidHistoryRows, setBidHistoryRows] = useState([]);
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
  const [editCampaigns, setEditCampaigns] = useState([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [editDateStart, setEditDateStart] = useState(todayStr);
  const [editDateEnd, setEditDateEnd] = useState(todayStr);
  const [editSaving, setEditSaving] = useState({});
  const [editVerifying, setEditVerifying] = useState({});
  const [editRenaming, setEditRenaming] = useState({});
  const [editDeleting, setEditDeleting] = useState({});
  const [editTogglingStatus, setEditTogglingStatus] = useState({});
  const [hiddenCampaigns, setHiddenCampaigns] = useState(() => {
    try {
      const raw = localStorage.getItem("__cd_hidden_camps__");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) { return new Set(); }
  });
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesError, setPagesError] = useState("");
  const [pagesList, setPagesList] = useState([]);
  const [pixelsLoading, setPixelsLoading] = useState(false);
  const [pixelsList, setPixelsList] = useState([]);
  const [adDestMap, setAdDestMap] = useState({});
  const [editCampaignFilter, setEditCampaignFilter] = useState("");
  const resetScopedState = () => {
    setSuperFilter([]);
    setJoinadsContentRows([]);
    setJoinadsCampaignRows([]);
    setJoinadsUserRows([]);
    setJoinadsMediumRows([]);
    setJoinadsSuperFilterDiagnostics({});
    setAdvertiserRows([]);
    setAdvertiserDiagnostics({});
    setMessenleadSources([]);
    setMessenleadUnresolved([]);
    setMessenleadLeads([]);
    setMessenleadUnresolvedLeadIds([]);
    setMessenleadLeadDiagnostics({});
    setTopUrls([]);
    setEarnings([]);
    setEarningsAll([]);
    setKeyValueContent([]);
    setError("");
    setLastRefreshed(null);
    setSnapshotEligible(false);
    setLoadHealth({});
    setDomains([]);
    setLogs([]);
    setMetaRows([]);
    setMetaDiagnostics({});
    setFxStatus("idle");
    setParamPairs([]);
    setMetaSourceRows([]);
    setSuperTermRows([]);
    setJoinadsTermDailyRows([]);
    setBidHistoryRows([]);
    setDupCampaigns([]);
    setDupError("");
    setDrafts([]);
    setPagesError("");
    setPagesList([]);
    setPixelsList([]);
    setTokenInfo(null);
    setTokenError("");
    setEditAds([]);
    setEditCampaigns([]);
    setEditError("");
    setActiveTab("dashboard");
    setAppliedFilters(null);
  };

  // ── Auth ──────────────────────────────────────────────────
  const [authed, setAuthed] = useState(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    fetch("/api/auth-check")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.session) {
          if (typeof window !== "undefined") {
            window.__cd_session_scope__ = `${d.session.role}:${d.session.username || d.session.email || "user"}`;
          }
          setAuthed(true);
          setSession(d.session);
        } else {
          resetScopedState();
          if (typeof window !== "undefined") {
            window.__cd_session_scope__ = "anon";
          }
          setAuthed(false);
          setSession(null);
        }
      })
      .catch(() => {
        resetScopedState();
        if (typeof window !== "undefined") {
          window.__cd_session_scope__ = "anon";
        }
        setAuthed(false);
        setSession(null);
      });
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth-logout", { method: "POST" }).catch(() => {});
    resetScopedState();
    if (typeof window !== "undefined") {
      window.__cd_session_scope__ = "anon";
    }
    setAuthed(false);
    setSession(null);
  };
  // ─────────────────────────────────────────────────────────

  // ── Settings ─────────────────────────────────────────────
  const [settingsDomains, setSettingsDomains] = useState([...DEFAULT_DOMAINS]);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsData, setSettingsData] = useState({
    domains: [...DEFAULT_DOMAINS], metaAccountId: "", metaTaxEnabled: true, metaTaxRatePercent: 12.15, metaTaxEffectiveDate: "2026-01-01", metaTaxMode: "add", reportType: "Analytical", includeAssets: false, showMessagesLtvTable: true, messagesLtvExtraDays: [], nichos: [], urls: [], users: [],
  });

  useEffect(() => {
    if (!authed) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.code === "success" && d.data) {
          const s = {
            ...d.data,
            metaTaxEnabled: d.data.metaTaxEnabled !== false,
            metaTaxRatePercent: d.data.metaTaxRatePercent ?? 12.15,
            metaTaxEffectiveDate: d.data.metaTaxEffectiveDate || "2026-01-01",
            metaTaxMode: d.data.metaTaxMode === "included" ? "included" : "add",
            showMessagesLtvTable: d.data.showMessagesLtvTable !== false,
            messagesLtvExtraDays: OPTIONAL_LTV_DAYS.filter((day) =>
              (Array.isArray(d.data.messagesLtvExtraDays) ? d.data.messagesLtvExtraDays : [])
                .map(Number)
                .includes(day)
            ),
          };
          setSettingsData(s);
          if (Array.isArray(s.domains) && s.domains.length) setSettingsDomains(s.domains);
          setFilters((p) => ({
            ...p,
            ...(s.metaAccountId ? { metaAccountId: s.metaAccountId } : {}),
            ...(s.reportType    ? { reportType: s.reportType }         : {}),
            includeAssets: !!s.includeAssets,
            ...(session?.role === "gestor" && Array.isArray(s.domains) && s.domains.length
              ? { domain: p.domain && s.domains.includes(p.domain) ? p.domain : s.domains[0] }
              : {}),
          }));
        }
      })
      .catch(() => {});
  }, [authed, session?.role]);

  const handleSaveSettings = async (payload) => {
    setSettingsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (d.code === "success" && d.data) {
        const s = {
          ...d.data,
          metaTaxEnabled: d.data.metaTaxEnabled !== false,
          metaTaxRatePercent: d.data.metaTaxRatePercent ?? 12.15,
          metaTaxEffectiveDate: d.data.metaTaxEffectiveDate || "2026-01-01",
          metaTaxMode: d.data.metaTaxMode === "included" ? "included" : "add",
          showMessagesLtvTable: d.data.showMessagesLtvTable !== false,
          messagesLtvExtraDays: OPTIONAL_LTV_DAYS.filter((day) =>
            (Array.isArray(d.data.messagesLtvExtraDays) ? d.data.messagesLtvExtraDays : [])
              .map(Number)
              .includes(day)
          ),
        };
        setSettingsData(s);
        if (Array.isArray(s.domains) && s.domains.length) setSettingsDomains(s.domains);
        setFilters((p) => ({
          ...p,
          metaAccountId: s.metaAccountId || p.metaAccountId,
          reportType: s.reportType || p.reportType,
          includeAssets: !!s.includeAssets,
        }));
        setSettingsSaving(false);
        return true;
      } else {
        throw new Error(d.message || "Erro ao salvar");
      }
    } catch (err) {
      setSettingsSaving(false);
      throw err;
    }
  };

  const mergedDomains = useMemo(() => {
    const all = [...settingsDomains, ...domains];
    return all.filter((d, i) => all.indexOf(d) === i);
  }, [settingsDomains, domains]);

  const availableTabs = useMemo(
    () => ROLE_TABS[session?.role || "admin"] || ROLE_TABS.admin,
    [session?.role]
  );
  const usePmLabels = isGestorSession(session);
  const selectTab = (tab) => {
    if (!availableTabs.includes(tab)) return;
    setActiveTab(tab);
  };
  const renderTabBar = () => html`
    <div className="tabs">
      ${availableTabs.map((tab) => {
        const createStyle =
          tab === "criar"
            ? {
                background: activeTab === "criar" ? "var(--accent)" : "#e8f5e9",
                borderColor: activeTab === "criar" ? "transparent" : "#a5d6a7",
                color: activeTab === "criar" ? "#fff" : "#1b5e20",
              }
            : undefined;
        return html`<${TabButton}
          key=${tab}
          tab=${tab}
          label=${TAB_LABELS[tab] || tab}
          activeTab=${activeTab}
          onSelect=${selectTab}
          style=${createStyle}
        />`;
      })}
    </div>
  `;

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__cd_session_scope__ = session
      ? `${session.role}:${session.username || session.email || "user"}`
      : "anon";
  }, [session]);

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] || "dashboard");
    }
  }, [activeTab, availableTabs]);

  useEffect(() => {
    if (!isGestorSession(session) || !mergedDomains.length) return;
    if (!filters.domain || !mergedDomains.includes(filters.domain)) {
      setFilters((prev) => ({ ...prev, domain: mergedDomains[0] }));
    }
  }, [filters.domain, mergedDomains, session]);
  // ─────────────────────────────────────────────────────────

  const totals = useTotalsFromEarnings(earnings, superFilter);
  const fxTargetDate =
    appliedFilters?.endDate || filters.endDate || formatDate(new Date());
  const brlRate = fxInfo?.rate || 0;

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

  const applyDashboardDataSnapshot = (snapshot) => {
    const d = snapshot?.data || snapshot || {};
    const arr = (value) => (Array.isArray(value) ? value : []);
    const obj = (value) => (value && typeof value === "object" ? value : {});
    setMetaRows(arr(d.metaRows));
    setMetaLtvRows(arr(d.metaRows));
    setEarnings(arr(d.earnings));
    setEarningsAll(arr(d.earningsAll));
    setJoinadsContentRows(arr(d.joinadsContentRows));
    setJoinadsCampaignRows(arr(d.joinadsCampaignRows));
    setJoinadsUserRows(arr(d.joinadsUserRows));
    setJoinadsMediumRows(arr(d.joinadsMediumRows));
    setJoinadsSuperFilterDiagnostics(obj(d.joinadsSuperFilterDiagnostics));
    setLoadHealth(obj(d.loadHealth));
    setAdvertiserRows(arr(d.advertiserRows));
    setAdvertiserDiagnostics(obj(d.advertiserDiagnostics));
    setMessenleadSources(arr(d.messenleadSources));
    setMessenleadUnresolved(arr(d.messenleadUnresolved));
    setMessenleadLeads(arr(d.messenleadLeads));
    setMessenleadUnresolvedLeadIds(arr(d.messenleadUnresolvedLeadIds));
    setMessenleadLeadDiagnostics(obj(d.messenleadLeadDiagnostics));
    setSuperKey(d.superKey || "utm_content");
    setSuperTermRows(arr(d.superTermRows));
    setJoinadsTermDailyRows(arr(d.joinadsTermDailyRows));
    setTopUrls(arr(d.topUrls));
    setKeyValueContent(arr(d.keyValueContent));
    setMetaSourceRows(arr(d.metaSourceRows));
    setMetaDiagnostics(obj(d.metaDiagnostics));
    setAdDestMap(obj(d.adDestMap));
    const contentRows = arr(d.joinadsContentRows);
    const campaignRows = arr(d.joinadsCampaignRows);
    setSuperFilter(contentRows.length ? contentRows : campaignRows);
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
    const ltvWindow = {
      startDate: filters.startDate,
      endDate: filters.endDate,
      requestedStartDate: filters.startDate,
      maxDay: 0,
      dates: listIsoDatesInRange(filters.startDate, filters.endDate, 15),
      truncated: false,
    };
    if (diffDays > 15) {
      setError("Intervalo máximo permitido é de 15 dias.");
      return;
    }

    setLoading(true);
    setError("");
    setSnapshotEligible(false);
    const criticalFailures = [];
    const loadStartedAt = new Date().toISOString();
    let loadedMetaRowsCount = 0;

    try {
      // Nao aplica snapshots antigos na interface durante uma atualizacao. Os dados que ja
      // estao visiveis permanecem na tela ate a nova carga terminar. O cache diario interno
      // da JoinAds continua sendo tratado pelos endpoints do backend.

      const topPromise = fetchJson(
        `${API_BASE}/top-url?${new URLSearchParams({
          start_date: filters.startDate,
          end_date: filters.endDate,
          "domain[]": filters.domain.trim(),
          limit: 500,
          sort: "revenue",
        }).toString()}`,
        {
          force: true,
          cacheTtlMs: filters.endDate === formatDate(new Date()) ? 0 : 3 * 60 * 1000,
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
          force: true,
          cacheTtlMs: filters.endDate === formatDate(new Date()) ? 0 : 3 * 60 * 1000,
          cacheKey: `earnings:${filters.domain}:${filters.startDate}:${filters.endDate}`,
        }
      );
      const earningsAllPromise = fetchJson(
        `${API_BASE}/earnings?${new URLSearchParams({
          start_date: filters.startDate,
          end_date: filters.endDate,
        }).toString()}`,
        {
          force: true,
          cacheTtlMs: filters.endDate === formatDate(new Date()) ? 0 : 3 * 60 * 1000,
          cacheKey: `earnings:all:${filters.startDate}:${filters.endDate}`,
        }
      ).catch((err) => {
        pushLog("earnings-all", err);
        return { data: [] };
      });
      // super-filter utm_content — sequencial necessário pela lógica de fallback
      let contentSuperRes = { data: [] };
      let campaignSuperRes = { data: [] };
      let messenleadRes = { sources: [], unresolved: [] };
      let messenleadLeadRes = { leads: [], unresolvedLeadIds: [] };
      let leadResolveDiagnostics = {};
      let termDailyRows = [];
      let contentSuperError = null;
      let campaignSuperError = null;
      let superKeyUsed = "utm_content";
      const contentSuperPayload = {
        start_date: filters.startDate,
        end_date: filters.endDate,
        "domain[]": [filters.domain.trim()],
        custom_key: "utm_content",
        group: ["domain", "custom_value"],
      };
      const campaignSuperPayload = {
        start_date: filters.startDate,
        end_date: filters.endDate,
        "domain[]": [filters.domain.trim()],
        custom_key: "utm_campaign",
        group: ["domain", "custom_value"],
      };
      try {
        contentSuperRes = await fetchJson(`${API_BASE}/super-filter`, {
          method: "POST",
          body: JSON.stringify(contentSuperPayload),
        });
      } catch (err) {
        contentSuperError = formatError(err);
        criticalFailures.push({ source: "joinads-super-filter-content", error: contentSuperError });
        pushLog("super-filter-content", err);
      }
      try {
        campaignSuperRes = await fetchJson(`${API_BASE}/super-filter`, {
          method: "POST",
          body: JSON.stringify(campaignSuperPayload),
        });
      } catch (err) {
        campaignSuperError = formatError(err);
        criticalFailures.push({ source: "joinads-super-filter-campaign", error: campaignSuperError });
        pushLog("super-filter-campaign", err);
      }
      const summarizeSuperFilter = (payload, response, requestError) => {
        const rows = Array.isArray(response?.data) ? response.data : [];
        return {
          request: payload,
          error: requestError,
          response: {
            code: response?.code || null,
            rows: rows.length,
            customKeys: Array.from(
              new Set(rows.map((row) => row?.custom_key).filter(Boolean))
            ),
            customValues: rows
              .map((row) => row?.custom_value)
              .filter(Boolean)
              .slice(0, 20),
            sample: rows.slice(0, 10),
            cache: response?.cache || null,
          },
        };
      };
      setJoinadsSuperFilterDiagnostics({
        report: "Relatorio de URL Avancado",
        method: "POST",
        endpoint: "https://office.joinads.me/api/clients-endpoints/super-filter",
        authorization: "Bearer [REDACTED]",
        constraints: {
          maxDateRangeDays: 15,
          validCustomKeys: [
            "utm_campaign",
            "id_post_wp",
            "id_post",
            "utm_source",
            "utm_medium",
            "utm_content",
            "utm_term",
            "land_uri",
          ],
          validGroups: ["custom_key", "country", "domain", "custom_value"],
        },
        utmContent: summarizeSuperFilter(
          contentSuperPayload,
          contentSuperRes,
          contentSuperError
        ),
        utmCampaign: summarizeSuperFilter(
          campaignSuperPayload,
          campaignSuperRes,
          campaignSuperError
        ),
      });
      if (!contentSuperRes?.data?.length && campaignSuperRes?.data?.length) {
        superKeyUsed = "utm_campaign";
      }

      const sourceKeys = Array.from(
        new Set(
          (campaignSuperRes?.data || [])
            .map((row) => normalizeKey(row.custom_value))
            .filter((value) => value.startsWith("src_"))
        )
      );
      if (sourceKeys.length) {
        try {
          messenleadRes = await fetchJson(`${API_BASE}/messenlead-resolve`, {
            method: "POST",
            body: JSON.stringify({ sourceKeys }),
          });
        } catch (err) {
          criticalFailures.push({ source: "messenlead-source-resolution", error: formatError(err) });
          pushLog("messenlead-resolve", err);
        }
      }

      // Todas as demais requisições independentes em paralelo (elimina 4 awaits sequenciais)
      const liveMetaStructureParams = new URLSearchParams({
        account_id: filters.metaAccountId.trim(),
        _ts: String(Date.now()),
      });
      const editListPromise = fetchJson(
        `${API_BASE}/meta-ad-edit-list?${liveMetaStructureParams.toString()}`,
        { force: true, cache: "no-store" }
      ).catch((err) => {
        pushLog("meta-edit-list-load", err);
        return { data: [] };
      });
      const bidHistoryPromise = session?.role === "admin" || session?.role === "gestor"
        ? fetchJson(`${API_BASE}/meta-bid-history?${new URLSearchParams({
            start_date: filters.startDate,
            end_date: filters.endDate,
            account_id: filters.metaAccountId.trim(),
            _ts: String(Date.now()),
          }).toString()}`, { force: true, cache: "no-store" }).catch((err) => {
            pushLog("meta-bid-history-load", err);
            return { data: [], available: false };
          })
        : Promise.resolve({ data: [], available: false });

      const [
        topRes,
        earningsRes,
        earningsAllRes,
        editListRes,
        superTermRes,
        keyValueContentRes,
        metaSourceRes,
        metaMediumRes,
        joinadsUserRes,
        bidHistoryRes,
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
          `${API_BASE}/key-value-country?${new URLSearchParams({
            start_date: filters.startDate,
            end_date: filters.endDate,
            domain: filters.domain.trim(),
            // A exportacao de Metricas Mensagens precisa preservar cada ad_unit.
            report_type: "Analytical",
            custom_key: "utm_campaign",
          }).toString()}`,
          {
            force: true,
            cacheTtlMs: filters.endDate === formatDate(new Date()) ? 0 : 3 * 60 * 1000,
            cacheKey: `key-value-country:${filters.domain}:${filters.startDate}:${filters.endDate}:Analytical`,
          }
        ).catch((err) => { criticalFailures.push({ source: "joinads-key-value-country", error: formatError(err) }); pushLog("key-value-country", err); return { data: [], _dashboardError: formatError(err) }; }),
        fetchJson(`${API_BASE}/super-filter`, {
          method: "POST",
          body: JSON.stringify({
            start_date: filters.startDate,
            end_date: filters.endDate,
            "domain[]": [filters.domain.trim()],
            custom_key: "utm_source",
            group: ["domain", "custom_value"],
          }),
        }).catch((err) => { criticalFailures.push({ source: "joinads-utm-source", error: formatError(err) }); pushLog("meta-utmsource", err); return { data: [] }; }),
        fetchJson(`${API_BASE}/super-filter`, {
          method: "POST",
          body: JSON.stringify({
            start_date: filters.startDate,
            end_date: filters.endDate,
            "domain[]": [filters.domain.trim()],
            custom_key: "utm_medium",
            group: ["domain", "custom_value"],
          }),
        }).catch((err) => { criticalFailures.push({ source: "joinads-utm-medium", error: formatError(err) }); pushLog("meta-utmmedium", err); return { data: [] }; }),
        fetchJson(`${API_BASE}/super-filter`, {
          method: "POST",
          body: JSON.stringify({
            start_date: filters.startDate,
            end_date: filters.endDate,
            "domain[]": [filters.domain.trim()],
            custom_key: "utm_user",
            group: ["domain", "custom_value"],
          }),
        }).catch((err) => { pushLog("joinads-utmuser", err); return { data: [] }; }),
        bidHistoryPromise,
      ]);

      setBidHistoryRows(Array.isArray(bidHistoryRes?.data) ? bidHistoryRes.data : []);

      const superTermRowsData = Array.isArray(superTermRes?.data) ? superTermRes.data : [];
      setJoinadsSuperFilterDiagnostics((prev) => ({
        ...(prev || {}),
        earnings: {
          endpoint: "https://office.joinads.me/api/clients-endpoints/earnings",
          rows: Array.isArray(earningsRes?.data) ? earningsRes.data.length : 0,
          cache: earningsRes?.cache || null,
        },
        keyValueCountry: {
          endpoint: "https://office.joinads.me/api/clients-endpoints/key-value-country",
          reportType: "Analytical",
          customKey: "utm_campaign",
          rows: Array.isArray(keyValueContentRes?.data) ? keyValueContentRes.data.length : 0,
          error: keyValueContentRes?._dashboardError || null,
          fields: Array.from(new Set((keyValueContentRes?.data || []).flatMap((row) => Object.keys(row || {})))).sort(),
          cache: keyValueContentRes?.cache || null,
        },
      }));
      const advertiserCampaigns = Array.from(new Set(
        (keyValueContentRes?.data || [])
          .map((row) => String(row.custom_value ?? row.custon_value ?? "").trim())
          .filter((value) => normalizeKey(value).startsWith("src_"))
      ));
      if (advertiserCampaigns.length) {
        // Diagnostico secundario: nao bloqueia Meta, atribuicao, tela nem persistencia principal.
        (async () => {
          const allRows = [];
          const allFailures = [];
          for (let index = 0; index < advertiserCampaigns.length; index += 40) {
            const batch = advertiserCampaigns.slice(index, index + 40);
            const advertiserRes = await fetchJson(`${API_BASE}/advertiser-campaign`, {
              method: "POST",
              body: JSON.stringify({ start_date: filters.startDate, end_date: filters.endDate, domain: filters.domain.trim(), utm_campaigns: batch }),
            });
            allRows.push(...(Array.isArray(advertiserRes?.data) ? advertiserRes.data : []));
            allFailures.push(...(advertiserRes?.diagnostics?.failures || []));
          }
          setAdvertiserRows(allRows);
          setAdvertiserDiagnostics({ requested: advertiserCampaigns.length, queried: advertiserCampaigns.length, rows: allRows.length, failures: allFailures, tokenInvalid: allFailures.some((item) => item.tokenInvalid), mode: "background_batches_of_40" });
        })().catch((err) => {
          pushLog("advertiser-campaign", err);
          setAdvertiserRows([]);
          setAdvertiserDiagnostics({
            endpoint: "https://office.joinads.me/api/clients-endpoints/report/advertiser/campaign",
            requested: advertiserCampaigns.length,
            error: formatError(err),
            tokenInvalid: err?.status === 401 || err?.status === 403 || !!err?.data?.tokenInvalid,
          });
        });
      } else {
        setAdvertiserRows([]);
        setAdvertiserDiagnostics({ requested: 0, rows: 0, note: "Nenhuma utm_campaign src_ encontrada no periodo." });
      }
      const leadIdSourceRows = superTermRowsData;
      const leadIds = Array.from(
        new Set(
          leadIdSourceRows
            .map((row) => cleanTermValue(row.custom_value))
            .filter(looksLikeMessenleadLeadId)
        )
      );
      leadResolveDiagnostics = {
        status: leadIds.length ? "pending" : "sem_candidatos",
        superTermRows: superTermRowsData.length,
        ltvWindow,
        requestedLeadIds: leadIds.length,
        termSamples: leadIdSourceRows.slice(0, 20).map((row) => ({
          value: row.custom_value || "",
          domain: row.domain || row.name || "",
          revenueClient: row.revenue_client ?? row.earnings_client ?? null,
          impressions: row.impressions ?? null,
          clicks: row.clicks ?? null,
          revenueDate: row.revenue_date || null,
        })),
        leadIdSamples: leadIds.slice(0, 30),
      };
      if (leadIds.length) {
        try {
          messenleadLeadRes = await fetchJson(`${API_BASE}/messenlead-resolve`, {
            method: "POST",
            body: JSON.stringify({ leadIds }),
          });
          const resolvedLeadSamples = (Array.isArray(messenleadLeadRes?.leads)
            ? messenleadLeadRes.leads
            : [])
            .map(normalizeMessenleadLead)
            .filter(Boolean)
            .slice(0, 20)
            .map((lead) => ({
              leadId: lead.leadId,
              firstSeenAt: lead.firstSeenAt,
              adId: lead.adId,
              sourceKey: lead.sourceKey,
              pageId: lead.pageId || "",
            }));
          leadResolveDiagnostics = {
            ...leadResolveDiagnostics,
            status: "ok",
            responseKeys: Object.keys(messenleadLeadRes || {}),
            resolvedLeads: Array.isArray(messenleadLeadRes?.leads)
              ? messenleadLeadRes.leads.length
              : 0,
            unresolvedLeadIds: Array.isArray(messenleadLeadRes?.unresolvedLeadIds)
              ? messenleadLeadRes.unresolvedLeadIds
              : [],
            leadResolved: messenleadLeadRes?.leadResolved ?? null,
            endpointDiagnostics: messenleadLeadRes?.leadDiagnostics || null,
            resolvedLeadSamples,
          };
        } catch (err) {
          pushLog("messenlead-leads-resolve", err);
          leadResolveDiagnostics = {
            ...leadResolveDiagnostics,
            status: "erro",
            errorStatus: err?.status || null,
            error: formatError(err),
            errorData: err?.data || null,
          };
        }

        const resolvedLeadKeySet = new Set(
          (Array.isArray(messenleadLeadRes?.leads) ? messenleadLeadRes.leads : [])
            .map(normalizeMessenleadLead)
            .filter(Boolean)
            .map((lead) => normalizeKey(lead.leadId))
        );
        const fallbackLegacyLeadKeySet = new Set(
          leadIds
            .map((leadId) => normalizeKey(leadId))
            .filter((leadId) => leadId.startsWith("ml_"))
        );
        const dailyLeadKeySet = resolvedLeadKeySet.size
          ? resolvedLeadKeySet
          : fallbackLegacyLeadKeySet;

        const dailyDates = listIsoDatesInRange(filters.startDate, filters.endDate, 15);
        const dailyResults = await Promise.all(
          dailyDates.map((day) =>
            withTimeout(
              fetchJson(`${API_BASE}/super-filter`, {
                method: "POST",
                body: JSON.stringify({
                  start_date: day,
                  end_date: day,
                  "domain[]": [filters.domain.trim()],
                  custom_key: "utm_term",
                  group: ["domain", "custom_value"],
                }),
              })
                .then((res) =>
                  (Array.isArray(res?.data) ? res.data : []).map((row) => ({
                    ...row,
                    revenue_date: day,
                  }))
                )
                .catch((err) => {
                  pushLog(`super-filter-term-daily:${day}`, err);
                  return [];
                }),
              10000,
              []
            )
          )
        );
        termDailyRows = dailyResults
          .flat()
          .filter((row) => dailyLeadKeySet.has(normalizeKey(row.custom_value)));
      }

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
        item.revenue += Number(row.earnings_client ?? row.revenue_client ?? 0);
        item.count += 1;
      });
      setParamPairs(Array.from(kvMap.values()));

      try {
        const metaParams = new URLSearchParams({
          account_id: filters.metaAccountId.trim(),
          start_date: filters.startDate,
          end_date: filters.endDate,
          include_assets: filters.includeAssets ? "1" : "0",
          schema: "message-metrics-v2",
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
        const insightRows = Array.isArray(metaRes?.data) ? metaRes.data : [];
        const structureRows = Array.isArray(editListRes?.data) ? editListRes.data : [];
        const liveStructureByAdset = new Map();
        structureRows.forEach((row) => {
          const key = String(row.adset_id || "");
          if (key && !liveStructureByAdset.has(key)) liveStructureByAdset.set(key, row);
        });
        const withLiveBid = (row) => {
          const live = liveStructureByAdset.get(String(row.adset_id || ""));
          if (!live) return row;
          return {
            ...row,
            adset_bid_amount: live.adset_bid_amount ?? null,
            adset_bid_strategy: live.campaign_bid_strategy || live.adset_bid_strategy || "",
            adset_optimization_goal: live.adset_optimization_goal || "",
            adset_bid_constraints: live.adset_bid_constraints ?? null,
          };
        };
        const buildMessageFallbackRows = (rowsForRange, fallbackDate) => {
          const insightAdIds = new Set(
            (rowsForRange || []).map((row) => normalizeKey(row.ad_id || "")).filter(Boolean)
          );
          return structureRows
            .filter((row) => isMessageMetricsRow(row))
            .filter((row) => !insightAdIds.has(normalizeKey(row.ad_id || row.id || "")))
            .map((row) => ({
              ...row,
              ad_id: row.ad_id || row.id,
              ad_name: row.ad_name || row.name,
              date_start: fallbackDate,
              date: fallbackDate,
              spend: row.spend || 0,
              results: row.results || null,
              cost_per_result: row.cost_per_result || null,
              meta_source: "structure_fallback",
            }));
        };
        const messageFallbackRows = buildMessageFallbackRows(insightRows, filters.endDate);
        const mergedMetaRows = [
          ...insightRows.map((row) => ({ ...withLiveBid(row), meta_source: "insights" })),
          ...messageFallbackRows,
        ];
        loadedMetaRowsCount = mergedMetaRows.length;
        setMetaRows(mergedMetaRows);
        setMetaLtvRows(mergedMetaRows);
        setMetaDiagnostics({
          accountId: filters.metaAccountId.trim(),
          startDate: filters.startDate,
          endDate: filters.endDate,
          ltvStartDate: ltvWindow.startDate,
          ltvEndDate: ltvWindow.endDate,
          ltvMetaSource: "selected_range",
          ltvInsightsRows: insightRows.length,
          insightsRows: insightRows.length,
          structureRows: structureRows.length,
          structureEngagementRows: structureRows.filter((row) => isEngagementObjective(row.objective)).length,
          structureMessageRows: structureRows.filter((row) => isMessageMetricsRow(row)).length,
          structureTrafficMessengerRows: structureRows.filter(
            (row) => String(row.objective || "").toUpperCase() === "OUTCOME_TRAFFIC" && hasMessengerSignal(row)
          ).length,
          fallbackMessageRows: messageFallbackRows.length,
          finalMetaRows: mergedMetaRows.length,
          apiDiagnostics: metaRes?.diagnostics || null,
          structureObjectiveCounts: structureRows.reduce((acc, row) => {
            const key = row.objective || "sem_objective";
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
          structureSamples: structureRows.slice(0, 8).map((row) => ({
            campaign: row.campaign_name || row.campaign_id || "-",
            ad: row.ad_name || row.name || row.ad_id || "-",
            objective: row.objective || "-",
            status: row.effective_status || row.status || "-",
          })),
        });
        const destMap = {};
        structureRows.forEach((row) => {
          if (row?.id) {
            destMap[row.id] = row.destination_url || row.url || "";
          }
        });
        setAdDestMap(destMap);
      } catch (err) {
        criticalFailures.push({ source: "meta-insights", error: formatError(err) });
        pushLog("meta", err);
        setMetaRows([]);
        setMetaLtvRows([]);
        setMetaDiagnostics({
          accountId: filters.metaAccountId.trim(),
          startDate: filters.startDate,
          endDate: filters.endDate,
          error: formatError(err),
        });
      }

      setSuperFilter(
        Array.isArray(contentSuperRes?.data) && contentSuperRes.data.length
          ? contentSuperRes.data
          : Array.isArray(campaignSuperRes?.data)
          ? campaignSuperRes.data
          : []
      );
      setJoinadsContentRows(Array.isArray(contentSuperRes?.data) ? contentSuperRes.data : []);
      setJoinadsCampaignRows(Array.isArray(campaignSuperRes?.data) ? campaignSuperRes.data : []);
      setJoinadsUserRows(Array.isArray(joinadsUserRes?.data) ? joinadsUserRes.data : []);
      setJoinadsMediumRows(Array.isArray(metaMediumRes?.data) ? metaMediumRes.data : []);
      setMessenleadSources(Array.isArray(messenleadRes?.sources) ? messenleadRes.sources : []);
      setMessenleadUnresolved(Array.isArray(messenleadRes?.unresolved) ? messenleadRes.unresolved : []);
      setMessenleadLeads(Array.isArray(messenleadLeadRes?.leads) ? messenleadLeadRes.leads : []);
      setMessenleadUnresolvedLeadIds(
        Array.isArray(messenleadLeadRes?.unresolvedLeadIds)
          ? messenleadLeadRes.unresolvedLeadIds
          : []
      );
      setMessenleadLeadDiagnostics(leadResolveDiagnostics);
      setSuperKey(superKeyUsed || "utm_content");
      setSuperTermRows(superTermRowsData);
      setJoinadsTermDailyRows(termDailyRows);
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
        (acc, r) => acc + Number(r.revenue_client ?? r.earnings_client ?? 0),
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
          acc.revenue += Number(row.revenue_client ?? row.earnings_client ?? 0);
          return acc;
        },
        { impressions: 0, clicks: 0, revenue: 0 }
      );
      const totalsUtm = filteredSource.reduce(
        (acc, row) => {
          acc.impressions += Number(row.impressions || 0);
          acc.clicks += Number(row.clicks || 0);
          acc.revenue += Number(row.revenue_client ?? row.earnings_client ?? 0);
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
      const completedHealth = {
        complete: criticalFailures.length === 0,
        startedAt: loadStartedAt,
        completedAt: new Date().toISOString(),
        failures: criticalFailures,
        sources: {
          metaRows: loadedMetaRowsCount,
          joinadsKeyValueRows: Array.isArray(keyValueContentRes?.data) ? keyValueContentRes.data.length : 0,
          joinadsCampaignRows: Array.isArray(campaignSuperRes?.data) ? campaignSuperRes.data.length : 0,
          joinadsContentRows: Array.isArray(contentSuperRes?.data) ? contentSuperRes.data.length : 0,
        },
      };
      setLoadHealth(completedHealth);
      setSnapshotEligible(completedHealth.complete);
      if (!completedHealth.complete) {
        setError(`Carga parcial: ${criticalFailures.map((item) => item.source).join(", ")}. Os dados foram exibidos apenas para diagnostico e nao foram salvos como definitivos.`);
      }
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

  // ---- Cache local dos ultimos dados carregados (sobrevive a recarregar a pagina) ----
  const DASHBOARD_SNAPSHOT_KEY = "__cd_dashboard_snapshot__:v5";
  const USE_DASHBOARD_DISPLAY_SNAPSHOT = false;
  const snapshotRestoredRef = useRef(false);

  // Salva um snapshot dos dados brutos sempre que uma carga completa (lastRefreshed muda).
  useEffect(() => {
    if (!USE_DASHBOARD_DISPLAY_SNAPSHOT) return;
    if (!lastRefreshed || !snapshotEligible) return;
    try {
      const snapshot = {
        v: 5,
        savedAt: Date.now(),
        scope: (typeof window !== "undefined" && window.__cd_session_scope__) || "anon",
        filters,
        appliedFilters,
        lastRefreshed:
          lastRefreshed instanceof Date ? lastRefreshed.toISOString() : lastRefreshed,
        data: {
          metaRows,
          earnings,
          earningsAll,
          joinadsContentRows,
          joinadsCampaignRows,
          joinadsUserRows,
          joinadsMediumRows,
          joinadsSuperFilterDiagnostics,
          advertiserRows,
          advertiserDiagnostics,
          messenleadSources,
          messenleadUnresolved,
          messenleadLeads,
          messenleadUnresolvedLeadIds,
          messenleadLeadDiagnostics,
          superKey,
          superTermRows,
          joinadsTermDailyRows,
          topUrls,
          keyValueContent,
          metaSourceRows,
          metaDiagnostics,
          loadHealth,
          adDestMap,
        },
      };
      localStorage.setItem(DASHBOARD_SNAPSHOT_KEY, JSON.stringify(snapshot));
      if (restoredSnapshotRef.current) {
        restoredSnapshotRef.current = false;
        return;
      }
      const persistedFilters = snapshot.appliedFilters || snapshot.filters || {};
      if (persistedFilters.domain && persistedFilters.metaAccountId && persistedFilters.startDate && persistedFilters.endDate) {
        fetchJson(`${API_BASE}/report-cache`, {
          method: "POST",
          body: JSON.stringify({
            domain: persistedFilters.domain,
            account_id: persistedFilters.metaAccountId,
            start_date: persistedFilters.startDate,
            end_date: persistedFilters.endDate,
            include_assets: !!persistedFilters.includeAssets,
            schema: "integrity-v2",
            snapshot,
          }),
        }).catch((cacheError) => {
          // Mantem o cache local como fallback quando o D1 ainda nao estiver vinculado.
          if (cacheError?.status !== 503) pushLog("report-cache-write", cacheError);
        });
      }
    } catch (e) {
      // Quota estourada / falha de serializacao: descarta para nao deixar cache pela metade.
      try {
        localStorage.removeItem(DASHBOARD_SNAPSHOT_KEY);
      } catch (_) {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRefreshed, snapshotEligible]);

  // Restaura o snapshot uma unica vez apos o login, se ainda nao houver dados carregados.
  useEffect(() => {
    if (!USE_DASHBOARD_DISPLAY_SNAPSHOT) {
      snapshotRestoredRef.current = true;
      return;
    }
    if (authed !== true || snapshotRestoredRef.current) return;
    if (metaRows.length) {
      snapshotRestoredRef.current = true;
      return;
    }
    let snapshot = null;
    try {
      const raw = localStorage.getItem(DASHBOARD_SNAPSHOT_KEY);
      if (raw) snapshot = JSON.parse(raw);
    } catch (e) {
      snapshot = null;
    }
    if (!snapshot || snapshot.v !== 5) return;
    const scope = (typeof window !== "undefined" && window.__cd_session_scope__) || "anon";
    if (snapshot.scope && snapshot.scope !== scope) return; // cache de outra sessao/usuario
    if (snapshot.savedAt && Date.now() - snapshot.savedAt > 7 * 24 * 60 * 60 * 1000) return; // > 7 dias

    snapshotRestoredRef.current = true;
    const d = snapshot.data || {};
    const arr = (x) => (Array.isArray(x) ? x : []);
    const obj = (x) => (x && typeof x === "object" ? x : {});
    setMetaRows(arr(d.metaRows));
    setMetaLtvRows(arr(d.metaRows));
    setEarnings(arr(d.earnings));
    setEarningsAll(arr(d.earningsAll));
    setJoinadsContentRows(arr(d.joinadsContentRows));
    setJoinadsCampaignRows(arr(d.joinadsCampaignRows));
    setJoinadsUserRows(arr(d.joinadsUserRows));
    setJoinadsMediumRows(arr(d.joinadsMediumRows));
    setJoinadsSuperFilterDiagnostics(obj(d.joinadsSuperFilterDiagnostics));
    setLoadHealth(obj(d.loadHealth));
    setAdvertiserRows(arr(d.advertiserRows));
    setAdvertiserDiagnostics(obj(d.advertiserDiagnostics));
    setMessenleadSources(arr(d.messenleadSources));
    setMessenleadUnresolved(arr(d.messenleadUnresolved));
    setMessenleadLeads(arr(d.messenleadLeads));
    setMessenleadUnresolvedLeadIds(arr(d.messenleadUnresolvedLeadIds));
    setMessenleadLeadDiagnostics(obj(d.messenleadLeadDiagnostics));
    setSuperKey(d.superKey || "utm_content");
    setSuperTermRows(arr(d.superTermRows));
    setJoinadsTermDailyRows(arr(d.joinadsTermDailyRows));
    setTopUrls(arr(d.topUrls));
    setKeyValueContent(arr(d.keyValueContent));
    setMetaSourceRows(arr(d.metaSourceRows));
    setMetaDiagnostics(obj(d.metaDiagnostics));
    setAdDestMap(obj(d.adDestMap));
    // superFilter e derivado das linhas de conteudo/campanha da JoinAds.
    const contentRows = arr(d.joinadsContentRows);
    const campaignRows = arr(d.joinadsCampaignRows);
    setSuperFilter(contentRows.length ? contentRows : campaignRows);
    if (snapshot.appliedFilters) setAppliedFilters(snapshot.appliedFilters);
    if (snapshot.filters) setFilters((prev) => ({ ...prev, ...snapshot.filters }));
    if (snapshot.lastRefreshed) {
      setSnapshotEligible(d.loadHealth?.complete === true);
      restoredSnapshotRef.current = true;
      const dt = new Date(snapshot.lastRefreshed);
      if (!Number.isNaN(dt.getTime())) setLastRefreshed(dt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

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

  const saveHiddenCampaigns = (set) => {
    try {
      localStorage.setItem("__cd_hidden_camps__", JSON.stringify([...set]));
    } catch (e) {}
  };

  const handleHideCampaign = (campaignId) => {
    setHiddenCampaigns((prev) => {
      const next = new Set(prev);
      next.add(campaignId);
      saveHiddenCampaigns(next);
      return next;
    });
  };

  const handleUnhideCampaign = (campaignId) => {
    setHiddenCampaigns((prev) => {
      const next = new Set(prev);
      next.delete(campaignId);
      saveHiddenCampaigns(next);
      return next;
    });
  };

  const handleLoadEditar = async (force = false, dateStart, dateEnd) => {
    if (!filters.metaAccountId.trim()) {
      setEditError("Informe o ID da conta de anúncios (Meta).");
      return;
    }
    setEditLoading(true);
    setEditError("");
    try {
      const qs = new URLSearchParams({ account_id: filters.metaAccountId.trim() });
      if (force) qs.set("force", "1");
      const ds = dateStart || editDateStart;
      const de = dateEnd || editDateEnd;
      if (ds) qs.set("start_date", ds);
      if (de) qs.set("end_date", de);
      const res = await fetchJson(`${API_BASE}/meta-structure?${qs.toString()}`);
      const cache = loadEditDestinationCache();
      const rows = (res.data || []).map((row) => {
        if (row.destination_url) return row;
        const cached = cache[row.id];
        return cached ? { ...row, destination_url: cached } : row;
      });
      setEditAds(rows);
      setEditCampaigns(res.campaigns || []);
    } catch (err) {
      setEditError(formatError(err));
      pushLog("meta-structure", err);
      setEditAds([]);
      setEditCampaigns([]);
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

  const handleToggleAdStatus = async (row) => {
    if (!row?.id) return;
    const current = row.effective_status || row.status;
    const next = current === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setEditTogglingStatus((prev) => ({ ...prev, [row.id]: true }));
    try {
      await fetchJson(`${API_BASE}/meta-ad-status`, {
        method: "POST",
        body: JSON.stringify({ ad_id: row.id, status: next }),
      });
      updateEditAdField(row.id, { status: next, effective_status: next });
      pushLog("meta-ad-status", { message: `Anúncio ${row.id} → ${next}` });
    } catch (err) {
      pushLog("meta-ad-status", err);
    } finally {
      setEditTogglingStatus((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  const handleDeleteEditAd = async (row) => {
    if (!row?.id) return;
    if (!window.confirm(`Apagar anúncio "${row.name || row.id}"? Esta ação não pode ser desfeita.`)) return;
    setEditDeleting((prev) => ({ ...prev, [row.id]: true }));
    try {
      await fetchJson(`${API_BASE}/meta-delete-ad`, {
        method: "POST",
        body: JSON.stringify({ ad_id: row.id }),
      });
      setEditAds((prev) => (prev || []).filter((r) => r.id !== row.id));
      pushLog("meta-delete-ad", { message: `Anúncio apagado: ${row.id}` });
    } catch (err) {
      pushLog("meta-delete-ad", err);
    } finally {
      setEditDeleting((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
    }
  };

  const handleToggleAdsetStatus = async (adsetId, currentStatus) => {
    if (!adsetId) return;
    const next = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setEditTogglingStatus((prev) => ({ ...prev, [adsetId]: true }));
    try {
      await fetchJson(`${API_BASE}/meta-adset-status`, {
        method: "POST",
        body: JSON.stringify({ adset_id: adsetId, status: next }),
      });
      setEditAds((prev) =>
        (prev || []).map((r) =>
          r.adset_id === adsetId ? { ...r, adset_status: next } : r
        )
      );
      pushLog("meta-adset-status", { message: `Conjunto ${adsetId} → ${next}` });
    } catch (err) {
      pushLog("meta-adset-status", err);
    } finally {
      setEditTogglingStatus((prev) => ({ ...prev, [adsetId]: false }));
    }
  };

  const handleDeleteCampaigns = async (ids, onDone) => {
    if (!ids || ids.length === 0) return;
    const plural = ids.length > 1 ? `${ids.length} campanhas` : "esta campanha";
    if (!window.confirm(`Apagar ${plural} permanentemente? Todos os conjuntos e anúncios vinculados também serão excluídos. Esta ação não pode ser desfeita.`)) return;
    const loading = {};
    ids.forEach((id) => (loading[id] = true));
    setEditDeleting((prev) => ({ ...prev, ...loading }));
    let deleted = [];
    for (const id of ids) {
      try {
        await fetchJson(`${API_BASE}/meta-campaign-delete`, {
          method: "POST",
          body: JSON.stringify({ campaign_id: id }),
        });
        deleted.push(id);
        pushLog("meta-campaign-delete", { message: `Campanha apagada: ${id}` });
      } catch (err) {
        pushLog("meta-campaign-delete", err);
      }
    }
    if (deleted.length > 0) {
      const deletedSet = new Set(deleted);
      setEditAds((prev) => (prev || []).filter((r) => !deletedSet.has(r.campaign_id)));
      setEditCampaigns((prev) => (prev || []).filter((c) => !deletedSet.has(c.id)));
    }
    setEditDeleting((prev) => { const n = { ...prev }; ids.forEach((id) => delete n[id]); return n; });
    onDone?.();
  };

  const handleDeleteEditAdset = async (adsetId, adsetName) => {
    if (!adsetId) return;
    if (!window.confirm(`Apagar conjunto "${adsetName || adsetId}" e todos os seus anúncios? Esta ação não pode ser desfeita.`)) return;
    setEditDeleting((prev) => ({ ...prev, [adsetId]: true }));
    try {
      await fetchJson(`${API_BASE}/meta-adset-delete`, {
        method: "POST",
        body: JSON.stringify({ adset_id: adsetId }),
      });
      setEditAds((prev) => (prev || []).filter((r) => r.adset_id !== adsetId));
      pushLog("meta-adset-delete", { message: `Conjunto apagado: ${adsetId}` });
    } catch (err) {
      pushLog("meta-adset-delete", err);
    } finally {
      setEditDeleting((prev) => { const n = { ...prev }; delete n[adsetId]; return n; });
    }
  };

  const handleToggleCampaignStatus = async (campaignId, currentStatus) => {
    if (!campaignId) return;
    const next = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setEditTogglingStatus((prev) => ({ ...prev, [campaignId]: true }));
    try {
      await fetchJson(`${API_BASE}/meta-campaign-status`, {
        method: "POST",
        body: JSON.stringify({ campaign_id: campaignId, status: next }),
      });
      setEditAds((prev) =>
        (prev || []).map((r) =>
          r.campaign_id === campaignId ? { ...r, campaign_status: next } : r
        )
      );
      pushLog("meta-campaign-status", { message: `Campanha ${campaignId} → ${next}` });
    } catch (err) {
      pushLog("meta-campaign-status", err);
    } finally {
      setEditTogglingStatus((prev) => ({ ...prev, [campaignId]: false }));
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

  const handleUpdateBudget = async (targetId, budgetValue, scope = "adset") => {
    if (!targetId) return;
    const raw = String(budgetValue ?? "").trim();
    if (!raw) return;
    const budgetNumber = Number(raw.replace(",", "."));
    if (!Number.isFinite(budgetNumber) || budgetNumber <= 0) {
      pushLog("meta-budget", { message: "Orcamento invalido" });
      return;
    }

    const isCampaignBudget = scope === "campaign";
    setBudgetLoading((prev) => ({ ...prev, [targetId]: true }));
    try {
      const res = await fetchJson(
        `${API_BASE}/${isCampaignBudget ? "meta-campaign-budget" : "meta-adset-budget"}`,
        {
        method: "POST",
        body: JSON.stringify({
          [isCampaignBudget ? "campaign_id" : "adset_id"]: targetId,
          daily_budget_brl: budgetNumber,
        }),
      });
      const updated = isCampaignBudget ? res?.campaign || null : res?.adset || null;
      if (updated) {
        setMetaRows((prev) =>
          (prev || []).map((row) =>
            (isCampaignBudget ? row.campaign_id === targetId : row.adset_id === targetId)
              ? {
                  ...row,
                  ...(isCampaignBudget
                    ? {
                        campaign_daily_budget: updated.daily_budget,
                        campaign_lifetime_budget: updated.lifetime_budget,
                        campaign_budget_remaining: updated.budget_remaining,
                      }
                    : {
                        adset_daily_budget: updated.daily_budget,
                        adset_lifetime_budget: updated.lifetime_budget,
                        adset_budget_remaining: updated.budget_remaining,
                      }),
                }
              : row
          )
        );
      }
      pushLog("meta-budget", {
        message: `Orcamento atualizado (${isCampaignBudget ? "campanha" : "conjunto"}): ${targetId} -> R$ ${budgetNumber.toFixed(2)}`,
      });
    } catch (err) {
      pushLog("meta-budget", err);
    } finally {
      setBudgetLoading((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
    }
  };

  const handleUpdateBid = async (adsetId, bidValue, bidMode = "with_bid", options = {}) => {
    if (!adsetId) return;
    const { campaignId = "", cbo = false } = options || {};

    const requestedStrategy = String(bidMode || "").toUpperCase();
    const bidStrategy = [
      BID_STRATEGY_WITH_BID,
      BID_STRATEGY_WITHOUT_BID,
      BID_STRATEGY_COST_CAP,
    ].includes(requestedStrategy)
      ? requestedStrategy
      : modeToStrategy(bidMode);
    const requiresBidValue =
      bidStrategy === BID_STRATEGY_WITH_BID ||
      bidStrategy === BID_STRATEGY_COST_CAP;

    const syncBidHistory = async (response) => {
      const history = response?.history;
      if (history?.saved === false && history?.reason && history.reason !== "NO_CONFIRMED_CHANGE") {
        pushLog("meta-bid-history", {
          message: `A alteracao foi enviada a Meta, mas o historico nao foi gravado (${history.reason}).`,
          data: history,
        });
      }
      if (!history?.saved) return;
      try {
        const params = new URLSearchParams({
          start_date: filters.startDate,
          end_date: filters.endDate,
          account_id: filters.metaAccountId.trim(),
          _ts: String(Date.now()),
        });
        const refreshed = await fetchJson(`${API_BASE}/meta-bid-history?${params.toString()}`, {
          force: true,
          cache: "no-store",
        });
        setBidHistoryRows(Array.isArray(refreshed?.data) ? refreshed.data : []);
      } catch (historyError) {
        pushLog("meta-bid-history-refresh", historyError);
      }
    };

    const confirmLiveBid = async () => {
      let actual = null;
      let rawActual = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const params = new URLSearchParams({ adset_id: adsetId, _ts: String(Date.now()) });
        const confirmation = await fetchJson(`${API_BASE}/meta-adset-bid?${params.toString()}`, {
          force: true,
          cache: "no-store",
        });
        actual = confirmation?.adset || null;
        const actualStrategy = String(actual?.bid_strategy || "").toUpperCase();
        rawActual = actualStrategy === BID_STRATEGY_COST_CAP
          ? actual?.bid_constraints?.cost_per_result_goal ?? actual?.bid_constraints?.cost_cap ?? actual?.bid_amount
          : actual?.bid_amount ?? actual?.bid_constraints?.bid_cap;
        const amountBrl = rawActual != null ? toNumber(rawActual) / 100 : null;
        if (!requiresBidValue || (amountBrl != null && Math.abs(amountBrl - bidNumber) < 0.005)) break;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700));
      }
      if (!actual) throw new Error("A Meta nao retornou o lance para confirmacao.");
      setMetaRows((prev) =>
        (prev || []).map((row) =>
          row.adset_id === adsetId
            ? {
                ...row,
                adset_bid_amount: actual.bid_amount ?? null,
                adset_bid_strategy: actual.bid_strategy || row.adset_bid_strategy || "",
                adset_optimization_goal: actual.optimization_goal || row.adset_optimization_goal || "",
                adset_bid_constraints: actual.bid_constraints ?? null,
              }
            : row
        )
      );
      return { actual, amountBrl: rawActual != null ? toNumber(rawActual) / 100 : null };
    };

    const showBidConfirmation = (confirmed) => {
      const matches = !requiresBidValue || (
        confirmed.amountBrl != null && Math.abs(confirmed.amountBrl - bidNumber) < 0.005
      );
      const message = matches
        ? requiresBidValue
          ? `Confirmado na Meta: R$ ${confirmed.amountBrl.toFixed(2)}.`
          : "Confirmado na Meta: sem limite definido."
        : `NAO APLICADO: voce pediu R$ ${bidNumber.toFixed(2)}, mas a Meta manteve R$ ${confirmed.amountBrl != null ? confirmed.amountBrl.toFixed(2) : "0,00"}.`;
      setBidFeedback((prev) => ({ ...prev, [adsetId]: { ok: matches, message } }));
      pushLog(matches ? "meta-bid-confirmed" : "meta-bid-not-applied", { message, data: confirmed.actual });
    };

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
    setBidFeedback((prev) => ({ ...prev, [adsetId]: { ok: true, message: "Salvando e confirmando na Meta..." } }));
    try {
      // Campanha com Orcamento de Campanha (CBO): a estrategia vai na CAMPANHA; o valor vai no CONJUNTO.
      // As duas chamadas sao independentes para que uma falhar nao aborte a outra.
      if (cbo && campaignId) {
        // 1) Estrategia na CAMPANHA. Em CBO a Meta pode controlar a estrategia neste nivel.
        let campaignStrategy = "";
        let campApplied = null;
        let campWarning = "";
        let strategyError = null;
        try {
          const campRes = await fetchJson(`${API_BASE}/meta-campaign-bid`, {
            method: "POST",
            body: JSON.stringify({
              campaign_id: campaignId,
              bid_strategy: bidStrategy,
              soft_fail: true,
            }),
          });
          if (campRes?.ok === false) {
            strategyError = {
              message: campRes.warning || "A Meta recusou alterar a estrategia da campanha.",
              data: campRes,
            };
          } else {
            campaignStrategy = String(campRes?.campaign?.bid_strategy || "").toUpperCase();
            campApplied = campRes?.applied ?? null;
            campWarning = campRes?.warning || "";
          }
        } catch (err) {
          strategyError = err;
        }

        // 2) Estrategia e valor no CONJUNTO. O Gerenciador costuma exibir o rotulo pelo conjunto;
        //    se a Meta rejeitar a estrategia aqui, mantemos pelo menos o valor do cap.
        let adsetUpdated = null;
        let adsetStrategyError = null;
        if (requiresBidValue) {
          try {
            const adsetRes = await fetchJson(`${API_BASE}/meta-adset-bid`, {
              method: "POST",
              body: JSON.stringify({
                adset_id: adsetId,
                bid_strategy: bidStrategy,
                bid_amount_brl: bidNumber,
                soft_fail: true,
              }),
            });
            if (adsetRes?.ok === false) {
              throw {
                message: adsetRes.warning || "A Meta recusou alterar a estrategia do conjunto.",
                data: adsetRes,
              };
            }
            await syncBidHistory(adsetRes);
            adsetUpdated = adsetRes?.adset || null;
          } catch (err) {
            adsetStrategyError = err;
            try {
              const adsetRes = await fetchJson(`${API_BASE}/meta-adset-bid`, {
                method: "POST",
                body: JSON.stringify({
                  adset_id: adsetId,
                  bid_amount_brl: bidNumber,
                  amount_only: true,
                  soft_fail: true,
                }),
              });
              if (adsetRes?.ok === false) {
                pushLog("meta-bid", {
                  message: adsetRes.warning || "A Meta recusou salvar o valor do cap no conjunto.",
                  data: adsetRes,
                });
              } else {
                await syncBidHistory(adsetRes);
                adsetUpdated = adsetRes?.adset || null;
              }
            } catch (fallbackErr) {
              pushLog("meta-bid", fallbackErr);
            }
          }
        }

        setMetaRows((prev) =>
          (prev || []).map((row) => {
            let next = row;
            if (campaignStrategy && row.campaign_id === campaignId) {
              next = { ...next, adset_bid_strategy: campaignStrategy };
            }
            if (row.adset_id === adsetId && adsetUpdated) {
              next = {
                ...next,
                adset_bid_amount: adsetUpdated.bid_amount ?? next.adset_bid_amount,
                adset_bid_strategy: adsetUpdated.bid_strategy || next.adset_bid_strategy,
                adset_bid_constraints: adsetUpdated.bid_constraints ?? next.adset_bid_constraints,
              };
            }
            return next;
          })
        );

        if (requiresBidValue && adsetUpdated) {
          pushLog("meta-bid", {
            message: `Custo do conjunto ${adsetId} -> R$ ${bidNumber.toFixed(2)} atualizado.`,
          });
        }
        if (strategyError) {
          pushLog("meta-bid", strategyError);
        } else if (campApplied === false) {
          pushLog("meta-bid", {
            message:
              campWarning ||
              `A Meta nao aplicou a estrategia ${formatBidStrategy(bidStrategy)} na campanha ${campaignId}.`,
          });
        } else {
          pushLog("meta-bid", {
            message: `Estrategia da campanha atualizada (${formatBidStrategy(bidStrategy)}) para ${campaignId}.`,
          });
        }
        if (adsetStrategyError) {
          pushLog("meta-bid", {
            message:
              "A Meta rejeitou aplicar a estrategia no conjunto; o dashboard tentou salvar apenas o valor do cap como fallback. Se o Gerenciador continuar mostrando Limite de Lance, a estrategia do conjunto nao foi aceita pela API.",
            detail: adsetStrategyError?.data || adsetStrategyError?.message || adsetStrategyError,
          });
        }
        const confirmed = await confirmLiveBid();
        showBidConfirmation(confirmed);
        return;
      }

      // Sem CBO: estrategia e valor no proprio conjunto.
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
      await syncBidHistory(res);
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
      if (res?.applied === false) {
        pushLog("meta-bid", {
          message:
            res.warning ||
            `A Meta nao aplicou a estrategia ${formatBidStrategy(bidStrategy)} no conjunto ${adsetId}. Ela pode ser controlada na campanha (CBO) — altere a estrategia na campanha.`,
        });
      } else {
        pushLog("meta-bid", {
          message: requiresBidValue
            ? `Custo atualizado (${formatBidStrategy(bidStrategy)}): ${adsetId} -> R$ ${bidNumber.toFixed(2)}`
            : `Estrategia atualizada (sem bid): ${adsetId}`,
        });
      }
      const confirmed = await confirmLiveBid();
      showBidConfirmation(confirmed);
    } catch (err) {
      setBidFeedback((prev) => ({
        ...prev,
        [adsetId]: { ok: false, message: `Nao foi possivel confirmar na Meta: ${formatError(err)}` },
      }));
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
    if (!authed || session?.role === "editor") return;
    handleLoadDomains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, session?.role]);


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
    const sourceKeyToAdId = new Map(
      (messenleadSources || [])
        .filter((item) => item?.sourceKey && item?.adId)
        .map((item) => [normalizeKey(item.sourceKey), normalizeKey(item.adId)])
    );
    const metaAdIds = new Set(
      (metaRows || []).map((row) => normalizeKey(row.ad_id || "")).filter(Boolean)
    );
    const domainFilteredContentRows = (joinadsContentRows || []).filter((row) => {
      const d = normalizeKey(row.domain || row.name || "");
      return domainKey ? d === domainKey : true;
    });
    const domainFilteredCampaignRows = (joinadsCampaignRows || []).filter((row) => {
      const d = normalizeKey(row.domain || row.name || "");
      return domainKey ? d === domainKey : true;
    });

    const addJoinadsByAdId = (map, adId, row, dataLevel, sourceValue) => {
      const key = normalizeKey(adId);
      if (!key) return;
      const entry =
        map.get(key) || {
          impressions: 0,
          clicks: 0,
          revenue: 0,
          revenue_client: 0,
          ecpm: null,
          ecpm_client: null,
          data_level: dataLevel,
          source_value: sourceValue || "",
        };
      entry.impressions += toNumber(row.impressions);
      entry.clicks += toNumber(row.clicks);
      entry.revenue += toNumber(row.revenue);
      entry.revenue_client += toNumber(row.revenue_client);
      if (row.ecpm != null) entry.ecpm = toNumber(row.ecpm);
      if (row.ecpm_client != null) entry.ecpm_client = toNumber(row.ecpm_client);
      map.set(key, entry);
    };

    const contentByAdId = new Map();
    domainFilteredContentRows.forEach((row) => {
      const adId = normalizeKey(row.custom_value);
      if (metaAdIds.has(adId)) {
        addJoinadsByAdId(contentByAdId, adId, row, "utm_content_ad_id", row.custom_value);
      }
    });

    const sourceByAdId = new Map();
    domainFilteredCampaignRows.forEach((row) => {
      const sourceKey = normalizeKey(row.custom_value);
      if (!sourceKey.startsWith("src_")) return;
      const adId = sourceKeyToAdId.get(sourceKey);
      if (adId && metaAdIds.has(adId)) {
        addJoinadsByAdId(sourceByAdId, adId, row, "messenlead_source_key", row.custom_value);
      }
    });

    // Atribuicao persistida por src_ tem precedencia. utm_content e apenas fallback quando
    // nao existe uma origem Messenlead resolvida para o anuncio.
    const joinadsByAdId = new Map([...contentByAdId, ...sourceByAdId]);

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
      const resolvedJoin = joinadsByAdId.get(adIdKey) || {};

      const fromCustom =
        Object.keys(resolvedJoin).length
          ? resolvedJoin
          :
        superByCustom.get(nameKey) ||
        superByCustom.get(adIdKey) ||
        {};

      const fromKv =
        kvByCustom.get(nameKey) ||
        kvByCustom.get(adIdKey) ||
        {};

      const matchedByResolvedAdId = Object.keys(resolvedJoin).length > 0;
      const matchedByContent = contentSet.has(nameKey) || contentSet.has(adIdKey);
      const matchedByTerm = termSet.has(adsetKey);
      const hasJoinads = hasContentData
        ? matchedByResolvedAdId ||
          matchedByContent ||
          Object.keys(fromCustom).length > 0 ||
          Object.keys(fromKv).length > 0
        : matchedByResolvedAdId
        ? true
        : hasTermData
        ? matchedByTerm
        : false;

      const impressionsJoin = toNumber(
        fromKv.impressions ?? fromCustom.impressions ?? null
      );

      const explicitClientRevenue =
        fromKv.revenue_client ??
        fromKv.earnings_client ??
        fromCustom.revenue_client ??
        fromCustom.earnings_client ??
        null;

      const ecpmClient =
        fromKv.ecpm_client ??
        fromCustom.ecpm_client ??
        (impressionsJoin
          && explicitClientRevenue != null
          ? (explicitClientRevenue / impressionsJoin) *
            1000
          : null);

      const revenueClientRaw =
        explicitClientRevenue ??
        (ecpmClient != null && impressionsJoin
          ? (Number(ecpmClient) * impressionsJoin) / 1000
          : null);
      const clicksJoinads = toNumber(
        fromKv.clicks ?? fromCustom.clicks ?? null
      );

      const revenueClientBrl =
        revenueClientRaw != null && brlRate ? revenueClientRaw * brlRate : null;

      const metaCharge = calculateMetaCharge(row.spend, date, settingsData);
      const spend = metaCharge.total;
      const cost = toNumber(row.cost_per_result) * metaCharge.multiplier;
      const messagingConversations = getMessagingConversationStarts(row);
      const messagingCostRaw = getMessagingConversationCost(row);
      const messagingCostFromMeta = messagingCostRaw != null
        ? messagingCostRaw * metaCharge.multiplier
        : null;
      const messagingCost =
        messagingCostFromMeta != null
          ? messagingCostFromMeta
          : messagingConversations > 0
          ? spend / messagingConversations
          : null;
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
      const campaignDailyBudgetBrl =
        row.campaign_daily_budget != null
          ? toNumber(row.campaign_daily_budget) / 100
          : null;
      const campaignLifetimeBudgetBrl =
        row.campaign_lifetime_budget != null
          ? toNumber(row.campaign_lifetime_budget) / 100
          : null;
      const bidConstraints = row.adset_bid_constraints || {};
      const rawBid = String(row.adset_bid_strategy || "").toUpperCase() === BID_STRATEGY_COST_CAP
        ? bidConstraints.cost_per_result_goal ?? bidConstraints.cost_cap ?? row.adset_bid_amount
        : row.adset_bid_amount ?? bidConstraints.bid_cap;
      const bidAmountBrl =
        rawBid != null ? toNumber(rawBid) / 100 : null;

      return {
        ...row,
        date,
        destination_url: adDestMap[row.ad_id] || row.destination_url || "",
        joinads_matched: hasJoinads,
        cost_per_result: currencyBRL.format(cost),
        cost_per_result_value: cost,
        spend_brl: currencyBRL.format(spend),
        spend_value: spend,
        spend_media_value: metaCharge.mediaSpend,
        meta_tax_value: metaCharge.tax,
        meta_tax_rate_percent: metaCharge.tax > 0 ? toNumber(settingsData.metaTaxRatePercent) : 0,
        meta_impressions_value: toNumber(row.impressions),
        meta_clicks_value: toNumber(row.clicks),
        messaging_conversations_started: messagingConversations,
        messaging_cost_per_conversation: messagingCost,
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
        clicks_joinads: clicksJoinads || null,
        data_level: resolvedJoin.data_level || (Object.keys(fromKv).length ? "utm_content" : superKey),
        joinads_source_value: resolvedJoin.source_value || "",
        results_meta: resultsCount,
        adset_daily_budget_brl: dailyBudgetBrl,
        adset_lifetime_budget_brl: lifetimeBudgetBrl,
        campaign_daily_budget_brl: campaignDailyBudgetBrl,
        campaign_lifetime_budget_brl: campaignLifetimeBudgetBrl,
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
    joinadsContentRows,
    joinadsCampaignRows,
    messenleadSources,
    superTermRows,
    keyValueContent,
    brlRate,
    settingsData.metaTaxEnabled,
    settingsData.metaTaxRatePercent,
    settingsData.metaTaxEffectiveDate,
    settingsData.metaTaxMode,
    superKey,
    appliedFilters,
    adDestMap,
  ]);

  const messengerAttributionAudit = useMemo(
    () =>
      buildMessengerAttributionAudit({
        campaignRows: joinadsCampaignRows,
        contentRows: joinadsContentRows,
        metaRows,
        messenleadSources,
        messenleadUnresolved,
        domainKey: normalizeKey(appliedFilters?.domain || filters.domain || ""),
        brlRate,
      }),
    [
      joinadsCampaignRows,
      joinadsContentRows,
      metaRows,
      messenleadSources,
      messenleadUnresolved,
      appliedFilters,
      filters.domain,
      brlRate,
    ]
  );

  const isTodaySelected = useMemo(() => {
    const endRaw = appliedFilters?.endDate || filters.endDate;
    if (!endRaw) return false;
    return endRaw === formatDate(new Date());
  }, [appliedFilters, filters.endDate]);

  const metaDomainFiltered = useMemo(() => {
    const term = filters.adsetFilter.trim().toLowerCase();
    const domainKey = normalizeKey(appliedFilters?.domain || filters.domain || "");
    const base = mergedMeta.filter((row) => {
      if (hiddenCampaigns.has(row.campaign_id)) return false;
      if (!domainKey) return true;
      const host = getHostname(row.destination_url);
      if (!host) return true;
      return normalizeKey(host) === domainKey;
    });
    const scopedBase = isGestorSession(session)
      ? base.filter((row) => rowMatchesDashboardUser(row, session?.username))
      : base;
    if (!term) return scopedBase;
    return scopedBase.filter((row) =>
      (row.adset_name || "").toLowerCase().includes(term)
    );
  }, [
    mergedMeta,
    filters.adsetFilter,
    appliedFilters,
    filters.domain,
    hiddenCampaigns,
    session?.role,
    session?.username,
  ]);

  const metaMessageFiltered = useMemo(() => {
    const term = filters.adsetFilter.trim().toLowerCase();
    const pageId = String(filters.pageId || "").trim();
    const base = mergedMeta.filter((row) => {
      if (hiddenCampaigns.has(row.campaign_id)) return false;
      return true;
    });
    const scopedBase = isGestorSession(session)
      ? base.filter((row) => rowMatchesDashboardUser(row, session?.username))
      : base;
    const pageFiltered = pageId
      ? scopedBase.filter((row) => String(row.page_id || "") === pageId)
      : scopedBase;
    if (!term) return pageFiltered;
    return pageFiltered.filter((row) =>
      [row.campaign_name, row.adset_name, row.ad_name, row.name]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [
    mergedMeta,
    filters.adsetFilter,
    filters.pageId,
    hiddenCampaigns,
    session?.role,
    session?.username,
  ]);

  // Paginas (Facebook) presentes nas linhas de mensagem, para o filtro por Pagina.
  const messagePageOptions = useMemo(() => {
    const gestor = isGestorSession(session);
    const map = new Map();
    (mergedMeta || []).forEach((row) => {
      if (!isMessageMetricsRow(row)) return;
      if (gestor && !rowMatchesDashboardUser(row, session?.username)) return;
      const id = String(row.page_id || "").trim();
      if (!id) return;
      const name = row.page_name || "";
      if (!map.has(id) || (!map.get(id) && name)) map.set(id, name);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name: name || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [mergedMeta, session?.role, session?.username]);

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
      entry.revenue += toNumber(row.revenue_client ?? row.earnings_client ?? 0);
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
    let result = (editAds || []).filter((row) => !hiddenCampaigns.has(row.campaign_id));
    if (!term) return result;
    return result.filter((row) =>
      (row.campaign_name || "").toLowerCase().includes(term) ||
      (row.adset_name || "").toLowerCase().includes(term) ||
      (row.name || "").toLowerCase().includes(term)
    );
  }, [editAds, editCampaignFilter, hiddenCampaigns]);

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
        acc.revenue += Number(row.revenue_client ?? row.earnings_client ?? 0);
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
    const requestedDate = fxTargetDate || formatDate(new Date());
    const cached = readCachedFxInfo(requestedDate);
    if (cached?.rate) {
      setFxInfo(cached);
    } else {
      // Nao recalcula um periodo com a cotacao em cache de outra data.
      setFxInfo(null);
    }
    setFxStatus("loading");

    const controller = new AbortController();
    let cancelled = false;
    const timeoutId = setTimeout(() => controller.abort(), FX_FETCH_TIMEOUT_MS);

    fetchFxWithProviders(requestedDate, controller.signal)
      .then((nextFxInfo) => {
        if (cancelled) return;
        setFxInfo(nextFxInfo);
        saveCachedFxInfo(nextFxInfo);
        setFxStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setFxStatus(cached?.rate ? "stale" : "unavailable");
        pushLog("dollar", {
          message:
            err?.name === "AbortError"
              ? "Timeout ao consultar cotacao USD/BRL nas APIs configuradas."
              : formatError(err),
          data: err?.data || null,
        });
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [fxTargetDate]);

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
    <${LoginView} onAuthed=${(nextSession) => {
      if (typeof window !== "undefined") {
        window.__cd_session_scope__ = nextSession
          ? `${nextSession.role}:${nextSession.username || nextSession.email || "user"}`
          : "anon";
      }
      setAuthed(true);
      setSession(nextSession);
    }} />
  `;

  if (session?.role === "editor") {
    return html`<${EditorPlaceholderView} session=${session} onLogout=${handleLogout} />`;
  }

  if (session?.role === "gestor") {
    return html`
      <div className="layout">
        <header className="topbar">
          <div>
            <h1>Painel do Gestor</h1>
            <p className="subtitle">
              Visao operacional por dominio.
              <span className="muted small"> | Versao ${APP_VERSION}</span>
            </p>
          </div>
          <div className="actions">
            ${html`<${ThemeToggle} />`}
            ${(activeTab === "dashboard" || activeTab === "metricas_mensagens")
              ? html`<div className="muted small">
                  ${formatFxLabel(fxInfo, fxStatus)}
                </div>`
              : null}
            ${(activeTab === "dashboard" || activeTab === "metricas_mensagens")
              ? html`<div className="muted small">
                  Ultima atualizacao: ${formatDateTime(lastRefreshed)}
                </div>`
              : null}
            ${(activeTab === "dashboard" || activeTab === "metricas_mensagens")
              ? html`<button
                  className="ghost"
                  onClick=${handleLoad}
                  disabled=${loading || !filters.domain}
                >
                  ${loading ? "Atualizando..." : "Atualizar"}
                </button>`
              : null}
            <div className="login-topbar-user">
              <span className="login-topbar-email">${getSessionName(session)}</span>
              <button className="ghost" style=${{ fontSize: "0.8rem", padding: "5px 12px" }} onClick=${handleLogout}>
                Sair
              </button>
            </div>
          </div>
        </header>

        ${renderTabBar()}

        ${(activeTab === "dashboard" || activeTab === "metricas_mensagens")
          ? html`<${Status} error=${error} lastRefreshed=${lastRefreshed} />`
          : null}

        ${(activeTab === "dashboard" || activeTab === "metricas_mensagens") ? html`
          <${Filters}
            filters=${filters}
            setFilters=${setFilters}
            onSubmit=${handleLoad}
            loading=${loading}
            domains=${mergedDomains}
            domainsLoading=${domainsLoading}
            pages=${messagePageOptions}
            showPageFilter=${activeTab === "metricas_mensagens"}
          />
        ` : null}

        ${activeTab === "dashboard"
          ? html`
              <main className="grid">
                ${html`<${UserCommissionOverview}
                  totals=${totals}
                  usdToBrl=${brlRate}
                  commissionPercent=${session?.commissionPercent || 0}
                  fxDateLabel=${fxInfo?.effectiveDate ? formatFxDate(fxInfo.effectiveDate) : ""}
                />`}
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
                  nichos=${settingsData.nichos}
                  savedUrls=${settingsData.urls || []}
                />
              </main>
            `
          : html`
              <${MetricasMensagensView}
                rows=${metaMessageFiltered}
                earningsRows=${earnings}
                joinadsDetailRows=${keyValueContent}
                advertiserRows=${advertiserRows}
                advertiserDiagnostics=${advertiserDiagnostics}
                messenleadSources=${messenleadSources}
                reportFilters=${appliedFilters || filters}
                pageScoped=${!!filters.pageId}
                usePmLabels=${true}
                brlRate=${brlRate}
                metaTaxSettings=${settingsData}
                commissionPercent=${session?.commissionPercent || 0}
                showUserCommission=${true}
                mediumRows=${joinadsMediumRows}
                termRows=${superTermRows}
                termDailyRows=${joinadsTermDailyRows}
                leadRows=${messenleadLeads}
                ltvMetaRows=${metaLtvRows}
                unresolvedLeadIds=${messenleadUnresolvedLeadIds}
                showLtvTable=${settingsData.showMessagesLtvTable !== false}
                ltvExtraDays=${settingsData.messagesLtvExtraDays || []}
                bidHistoryRows=${bidHistoryRows}
                allowBidControl=${false}
                diagnostics=${{
                  joinadsContentRowsCount: joinadsContentRows.length,
                  joinadsCampaignRowsCount: joinadsCampaignRows.length,
                  joinadsUserRowsCount: joinadsUserRows.length,
                  joinadsSuperFilterDiagnostics,
                  messenleadSourcesCount: messenleadSources.length,
                  messenleadUnresolved,
                  messenleadLeadDiagnostics,
                  metaDiagnostics,
                  messageSourceRowsCount: metaMessageFiltered.length,
                }}
              />
            `}
      </div>
    `;
  }

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
          ${html`<${ThemeToggle} />`}
          <div className="muted small">
            ${formatFxLabel(fxInfo, fxStatus)}
          </div>
          <div className="muted small">
            Ultima atualizacao: ${formatDateTime(lastRefreshed)}
          </div>
          ${availableTabs.includes("dashboard")
            ? html`<button
                className="ghost"
                onClick=${handleLoad}
                disabled=${loading || !filters.domain}
              >
                ${loading ? "Atualizando..." : "Atualizar"}
              </button>`
            : null}
          <div className="login-topbar-user">
            <span className="login-topbar-email">${getSessionName(session)}</span>
            <button className="ghost" style=${{ fontSize: "0.8rem", padding: "5px 12px" }} onClick=${handleLogout}>
              Sair
            </button>
          </div>
        </div>
      </header>

      ${renderTabBar()}
      <div className="tabs legacy-tabs-hidden" aria-hidden="true">
        <button
          hidden=${!availableTabs.includes("dashboard")}
          className=${`tab ${activeTab === "dashboard" ? "active" : ""}`}
          onClick=${() => setActiveTab("dashboard")}
        >
          Dashboard
        </button>
        <button
          hidden=${!availableTabs.includes("metricas_mensagens")}
          className=${`tab ${activeTab === "metricas_mensagens" ? "active" : ""}`}
          onClick=${() => setActiveTab("metricas_mensagens")}
        >
          Metricas Mensagens
        </button>
        <button
          hidden=${!availableTabs.includes("duplicar")}
          className=${`tab ${activeTab === "duplicar" ? "active" : ""}`}
          onClick=${() => setActiveTab("duplicar")}
        >
          Duplicar
        </button>
        <button
          hidden=${!availableTabs.includes("editar")}
          className=${`tab ${activeTab === "editar" ? "active" : ""}`}
          onClick=${() => setActiveTab("editar")}
        >
          Editar
        </button>
        <button
          hidden=${!availableTabs.includes("urls")}
          className=${`tab ${activeTab === "urls" ? "active" : ""}`}
          onClick=${() => setActiveTab("urls")}
        >
          URLs com Parâmetros
        </button>
        <button
          hidden=${!availableTabs.includes("meta")}
          className=${`tab ${activeTab === "meta" ? "active" : ""}`}
          onClick=${() => setActiveTab("meta")}
        >
          Fontes
        </button>
        <button
          hidden=${!availableTabs.includes("diag")}
          className=${`tab ${activeTab === "diag" ? "active" : ""}`}
          onClick=${() => setActiveTab("diag")}
        >
          Diagnóstico JoinAds
        </button>
        <button
          hidden=${!availableTabs.includes("token")}
          className=${`tab ${activeTab === "token" ? "active" : ""}`}
          onClick=${() => setActiveTab("token")}
        >
          Token Meta
        </button>
        <button
          hidden=${!availableTabs.includes("pages")}
          className=${`tab ${activeTab === "pages" ? "active" : ""}`}
          onClick=${() => setActiveTab("pages")}
        >
          Páginas
        </button>
        <button
          hidden=${!availableTabs.includes("configuracoes")}
          className=${`tab ${activeTab === "configuracoes" ? "active" : ""}`}
          onClick=${() => setActiveTab("configuracoes")}
        >
          ⚙ Configurações
        </button>
        <button
          hidden=${!availableTabs.includes("criar")}
          className=${`tab ${activeTab === "criar" ? "active" : ""}`}
          onClick=${() => setActiveTab("criar")}
          style=${{ background: activeTab === "criar" ? "var(--accent)" : "#e8f5e9", borderColor: activeTab === "criar" ? "transparent" : "#a5d6a7", color: activeTab === "criar" ? "#fff" : "#1b5e20" }}
        >
          + Criar campanha
        </button>
      </div>

      ${html`<${Status} error=${error} lastRefreshed=${lastRefreshed} />`}

      ${(activeTab === "dashboard" || activeTab === "metricas_mensagens") ? html`
        <${Filters}
          filters=${filters}
          setFilters=${setFilters}
          onSubmit=${handleLoad}
          loading=${loading}
          domains=${mergedDomains}
          domainsLoading=${domainsLoading}
          pages=${messagePageOptions}
          showPageFilter=${activeTab === "metricas_mensagens"}
        />
      ` : null}

      ${activeTab === "dashboard"
        ? html`
            <main className="grid">
              ${html`<${Metrics}
                totals=${totals}
                usdToBrl=${brlRate}
                metaSpendBrl=${metaTotals.spendBrl}
                fxDateLabel=${fxInfo?.effectiveDate ? formatFxDate(fxInfo.effectiveDate) : ""}
                usePmLabels=${usePmLabels}
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
                  usePmLabels=${usePmLabels}
                />
              `}
              ${html`<${MetaJoinAdsetTable} rows=${filteredMeta} joinadsRows=${superTermRows} brlRate=${brlRate} usePmLabels=${usePmLabels} />`}
              ${html`<${SemUtmAttribution} semUtmRow=${semUtmRow} joinadsRows=${superTermRows} metaRows=${filteredMeta} brlRate=${brlRate} usePmLabels=${usePmLabels} />`}
              ${html`<${MetaJoinGroupedTable} rows=${filteredMeta} usePmLabels=${usePmLabels} />`}
              ${html`<${EarningsTable} rows=${earningsAll.filter((r) => { const d = typeof r.date === "string" ? r.date.slice(0, 10) : ""; return !d || ((!filters.startDate || d >= filters.startDate) && (!filters.endDate || d <= filters.endDate)); })} usePmLabels=${usePmLabels} />`}
            </main>
          `
        : activeTab === "metricas_mensagens"
        ? html`<${MetricasMensagensView}
            rows=${metaMessageFiltered}
            earningsRows=${earnings}
            joinadsDetailRows=${keyValueContent}
            advertiserRows=${advertiserRows}
            advertiserDiagnostics=${advertiserDiagnostics}
            messenleadSources=${messenleadSources}
            reportFilters=${appliedFilters || filters}
            pageScoped=${!!filters.pageId}
            usePmLabels=${usePmLabels}
            brlRate=${brlRate}
            metaTaxSettings=${settingsData}
            commissionPercent=${session?.commissionPercent || 0}
            showUserCommission=${isGestorSession(session)}
            mediumRows=${joinadsMediumRows}
            termRows=${superTermRows}
            termDailyRows=${joinadsTermDailyRows}
            leadRows=${messenleadLeads}
            ltvMetaRows=${metaLtvRows}
            unresolvedLeadIds=${messenleadUnresolvedLeadIds}
            showLtvTable=${settingsData.showMessagesLtvTable !== false}
            ltvExtraDays=${settingsData.messagesLtvExtraDays || []}
            onBudgetUpdate=${handleUpdateBudget}
            budgetLoading=${budgetLoading}
            onBidUpdate=${handleUpdateBid}
            bidLoading=${bidLoading}
            bidFeedback=${bidFeedback}
            bidHistoryRows=${bidHistoryRows}
            allowBidControl=${session?.role === "admin"}
            attributionAudit=${messengerAttributionAudit}
            diagnostics=${{
              joinadsContentRowsCount: joinadsContentRows.length,
              joinadsCampaignRowsCount: joinadsCampaignRows.length,
              joinadsUserRowsCount: joinadsUserRows.length,
              joinadsSuperFilterDiagnostics,
              messenleadSourcesCount: messenleadSources.length,
              messenleadUnresolved,
              messenleadLeadDiagnostics,
              metaDiagnostics,
              messageSourceRowsCount: metaMessageFiltered.length,
            }}
          />`
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
              allAds=${editAds}
              campaigns=${editCampaigns}
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
              onRenameAd=${(id, name, key) => handleRenameObject(id, name, key)}
              onRenameAdset=${(id, name, key) => handleRenameObject(id, name, key)}
              editRenaming=${editRenaming}
              onResolveDestination=${handleResolveDestination}
              onToggleAdStatus=${handleToggleAdStatus}
              onDeleteAd=${handleDeleteEditAd}
              onToggleAdsetStatus=${handleToggleAdsetStatus}
              onDeleteAdset=${handleDeleteEditAdset}
              onToggleCampaignStatus=${handleToggleCampaignStatus}
              onDeleteCampaigns=${handleDeleteCampaigns}
              deleting=${editDeleting}
              togglingStatus=${editTogglingStatus}
              hiddenCampaigns=${hiddenCampaigns}
              onHideCampaign=${handleHideCampaign}
              onUnhideCampaign=${handleUnhideCampaign}
              dateStart=${editDateStart}
              dateEnd=${editDateEnd}
              onDateChange=${(s, e) => { setEditDateStart(s); setEditDateEnd(e); }}
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
        : activeTab === "configuracoes"
        ? html`
            <${ConfiguracoesView}
              settings=${settingsData}
              onSave=${handleSaveSettings}
              saving=${settingsSaving}
            />
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
                nichos=${settingsData.nichos}
                savedUrls=${settingsData.urls || []}
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
                  userRows=${joinadsUserRows}
                  messenleadUnresolved=${messenleadUnresolved}
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
