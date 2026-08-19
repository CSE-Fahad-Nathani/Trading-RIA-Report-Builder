import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clipboard, Columns2, ExternalLink, Eye, FolderOpen, Info, Mail, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'

const TIMES = ['11:30 AM', '5:30 PM']
const LAYOUT_KEY = 'trading-ria-layout-mode'
const CUSTOM_TIME_VALUE = '__custom__'

const TIME_OPTIONS = (() => {
  const options = []
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 30]) {
      const date = new Date(2000, 0, 1, hour, minute)
      options.push(date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }))
    }
  }
  return options
})()

function isPresetTime(time) {
  return TIMES.includes(time)
}

function parseTime12h(time) {
  const match = String(time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = Number(match[2])
  const meridiem = match[3].toUpperCase()
  if (meridiem === 'PM' && hours !== 12) hours += 12
  if (meridiem === 'AM' && hours === 12) hours = 0
  return { hours, minutes }
}

const emptyTransfer = () => ({ date: '', accountType: '', type: 'Deposit', amount: '0', accounts: '0' })
const emptyUtmRow = () => ({ source: '', medium: '', campaign: '', total: '0', draft: '0', created: '0' })
const emptyProductionFailedApi = () => ({ apiName: '', userId: '', error: '', issueOwner: 'User', createdAt: '' })

const fixedUtmRows = [
  { source: 'musaffa_mobile_app', medium: '—', campaign: '—', total: '118', draft: '44', created: '20' },
  { source: 'website', medium: 'popup', campaign: 'MP_Popup_DB_Web', total: '18', draft: '1', created: '0' },
  { source: 'app', medium: 'popup', campaign: 'MP_Popup_In-app', total: '8', draft: '3', created: '1' },
  { source: 'email', medium: 'mpemail', campaign: 'usactivestockviewed', total: '4', draft: '1', created: '1' },
  { source: 'email', medium: 'mpemail', campaign: 'uspaidusers', total: '2', draft: '1', created: '1' },
  { source: 'musaffa_mobile_app', medium: 'general_popup', campaign: '6_years_free_trading', total: '1', draft: '0', created: '0' },
  { source: 'Webinar', medium: '16Jul', campaign: 'SD_Webinar', total: '1', draft: '1', created: '0' },
  { source: 'website', medium: 'web-popup', campaign: 'mp', total: '1', draft: '0', created: '0' },
]

const commonFields = [
  ['kycWaiting', 'Users Waiting for KYC Approval'],
  ['kycWaitingSsn', 'SSN'],
  ['kycWaitingNonSsn', 'Non-SSN'],
  ['riaPortfolioChangeRequests', 'RIA Portfolio Change Requests'],
  ['signupErrors', 'Users with Account Errors'],
  ['w8ben', 'W8BEN Not Submitted'],
  ['tradeCron', 'send_trade_confirmation [Cron]'],
  ['duplicateAlpaca', 'Duplicate Alpaca Accounts [Cron]'],
  ['duplicateDrafts', 'Duplicate Drafts (Multiple Account Risk)'],
  ['duplicateEmails', 'Duplicate Email Notifications (RIA)'],
  ['inactivePortfolios', 'RIA Inactive Portfolios'],
]

const cipFields = [
  ['canSubmit', 'Can Submit'],
  ['submittedToday', 'Total Submitted Today'],
  ['ssnToday', 'Total SSN CIP Submitted Today'],
  ['nonSsnToday', 'Total Non-SSN CIP Submitted Today'],
]

const tradingFields = [
  ['draft', 'Total Draft'],
  ['created', 'Alpaca Account Created'],
  ['openToday', 'Alpaca Accounts Open Today'],
  ['draftsToday', 'Drafts Open Today'],
  ['totalFund', 'Total fund'],
  ['maxFund', 'Max portfolio'],
  ['fundedUsers', 'Total Funded users'],
]

const riaFields = [
  ...tradingFields,
  ['portfolioCheck', 'ria_portfolio_check'],
]

const accountFields = [
  ['active', 'Active'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['closed', 'Acc. Closed'],
]

const riaAccountFields = [
  ['active', 'Active'],
  ['approved', 'Approved'],
]

const emptyObject = (fields) => Object.fromEntries(fields.map(([key]) => [key, '0']))

const initialState = () => ({
  transfers: [emptyTransfer()],
  common: emptyObject(commonFields),
  multiAccounts: { total: '0', tradingToRia: '0', riaToTrading: '0' },
  cip: emptyObject(cipFields),
  productionFailedApis: [emptyProductionFailedApi()],
  utm: fixedUtmRows.map((row) => ({ ...row })),
  trading: emptyObject(tradingFields),
  tradingAccount: emptyObject(accountFields),
  ria: emptyObject(riaFields),
  riaAccount: emptyObject(riaAccountFields),
  subscription: { without: '0', funded: '0', unfunded: '0' },
})

const moneyKeys = new Set(['totalFund', 'maxFund'])
const warningCommon = new Set(['signupErrors', 'w8ben', 'duplicateAlpaca', 'duplicateDrafts', 'duplicateEmails', 'inactivePortfolios'])
const warningKeys = new Set([...warningCommon, 'canSubmit', 'portfolioCheck', 'without'])
const greenMoneyKeys = new Set(['totalFund', 'maxFund'])
const panicKeys = new Set(['riaPortfolioChangeRequests', 'signupErrors', 'w8ben', 'duplicateAlpaca', 'duplicateDrafts', 'duplicateEmails', 'inactivePortfolios', 'closed', 'canSubmit'])
// "Panic Alert" — clean premium card with red dot + accent count. Trigger: value > 0.

function isPanicAlert(key, value) {
  return panicKeys.has(key) && num(value) > 0
}

function panicDotHtml() {
  return '<span style="display:inline-block;width:7px;height:7px;background:#ffffff;border-radius:50%;margin-right:8px;vertical-align:middle"></span>'
}

function panicLabelHtml(label) {
  return `${panicDotHtml()}<span style="font-weight:700;color:#ffffff">${label}</span>`
}

function panicValueHtml(value) {
  return `<span style="font-weight:800;color:#ffffff;font-variant-numeric:tabular-nums">${value}</span>`
}

function panicCellStyles(side = 'left', padding = '9px') {
  const card = `padding:${padding};background:#c40000;border-top:1px solid #7f1d1d;border-bottom:1px solid #7f1d1d;box-shadow:0 2px 6px rgba(127,29,29,0.25);vertical-align:middle`
  if (side === 'left') return `${card};border-left:3px solid #000000;border-right:none`
  return `${card};border-right:1px solid #7f1d1d;border-left:none;text-align:right`
}

function panicAlertRow(label, valueHtml, padding = '10px 12px') {
  return `<tr>
    <td style="${panicCellStyles('left', padding)}">${panicLabelHtml(label)}</td>
    <td style="${panicCellStyles('right', padding)}">${valueHtml}</td>
  </tr>`
}

const panicFormTone = {
  box: 'border border-[#7f1d1d] bg-[#c40000] shadow-sm ring-1 ring-[#7f1d1d]/40',
  label: 'text-black font-semibold',
  input: 'font-bold text-white',
}

const panicBlackTextKeys = new Set(['closed', 'riaPortfolioChangeRequests', 'signupErrors', 'w8ben', 'canSubmit'])

function panicInputClass(key) {
  return panicBlackTextKeys.has(key)
    ? 'border-[#7f1d1d] bg-[#c40000] text-black'
    : 'border-[#7f1d1d] bg-[#c40000] text-white'
}

function panicFormToneFor(key) {
  if (panicBlackTextKeys.has(key)) {
    return { ...panicFormTone, input: 'font-bold text-black' }
  }
  return panicFormTone
}

const fieldTooltips = {
  tradeCron: 'CRON 14: send_trade_confirmation',
  duplicateAlpaca: 'CRON 12: duplicate_alpaca_accounts',
  riaPortfolioChangeRequests: '3rd last table',
  duplicateDrafts: '2nd last table',
  duplicateEmails: 'Last table',
  inactivePortfolios: '5th last table',
  portfolioCheck: 'CRON 13: ria_portfolio_check',
}

const MULTI_ACCOUNTS_TOOLTIP = '2nd table: Users with Multi Accounts'
const CIP_TOOLTIP = 'CRON 9: submit_pending_cip'
const KYC_WAITING_BREAKDOWN_TOOLTIP = 'KYC waiting count split by SSN and Non-SSN'

const commonReportLabels = {
  tradeCron: 'Trade confirmation emails sent',
}

function num(value) {
  const n = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function ordinal(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`
}

function formatLongDate(isoDate) {
  if (!isoDate) return '—'
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return `${ordinal(d.getDate())} ${d.toLocaleString('en-GB', { month: 'long' })} ${d.getFullYear()}`
}

function parseCreatedAtParts(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?$/)
  if (!match) return { date: '', time: '' }
  const date = match[1]
  const time = match[2] ? `${match[2]}:${match[3] || '00'}` : ''
  return { date, time }
}

function formatCreatedAtDisplay(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!match) return value || '—'
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match
  const d = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
  if (Number.isNaN(d.getTime())) return value || '—'
  const datePart = `${ordinal(d.getDate())} ${d.toLocaleString('en-GB', { month: 'long' })} ${d.getFullYear()}`
  if (!match[4]) return datePart
  return `${datePart}, ${d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}`
}

function composeCreatedAt(date, time) {
  if (!date) return ''
  return time ? `${date} ${time}` : date
}

function maskEmail(value) {
  const email = String(value || '').trim()
  const [local, domain] = email.split('@')
  if (!local || !domain) return email || '—'
  const suffixLength = local.length <= 6 ? 1 : local.length > 8 ? 4 : 2
  const prefixLength = local.length <= 6 ? 1 : Math.min(7, Math.max(2, local.length - suffixLength - 1))
  const hiddenLength = Math.max(3, local.length - prefixLength - suffixLength)
  return `${local.slice(0, prefixLength)}${'*'.repeat(hiddenLength)}${local.slice(local.length - suffixLength)}@${domain}`
}

function periodFor(time) {
  const parsed = parseTime12h(time)
  if (!parsed) return 'morning'
  const mins = parsed.hours * 60 + parsed.minutes
  const fourAm = 4 * 60
  const noon = 12 * 60
  const fourPm = 16 * 60
  if (mins >= fourAm && mins < noon) return 'morning'
  if (mins >= noon && mins < fourPm) return 'afternoon'
  return 'evening'
}

function reportFileName(date, time) {
  const d = new Date(`${date}T12:00:00`)
  if (Number.isNaN(d.getTime())) return 'report.json'
  return `${ordinal(d.getDate())} ${d.toLocaleString('en-GB', { month: 'long' })} ${periodFor(time)} report.json`
}

function subjectFor(date, time) {
  const d = new Date(`${date}T12:00:00`)
  return `Trading & RIA Report - ${ordinal(d.getDate())} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()} (${time})`
}

function display(value, money = false) {
  if (value === '' || value == null) return '0'
  const number = Number(String(value).replace(/,/g, ''))
  if (Number.isNaN(number)) return value
  return money ? `$${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : number.toLocaleString('en-US')
}

function displayDelta(diff, money = false) {
  const sign = diff > 0 ? '+' : ''
  if (money) {
    const abs = Math.abs(diff).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return `${sign}${diff < 0 ? '-' : ''}$${abs}`
  }
  return `${sign}${diff.toLocaleString('en-US')}`
}

function calcUnfunded(total, funded) {
  return String(Math.max(0, num(total) - num(funded)))
}

function withDerived(data) {
  const ssn = num(data.cip?.ssnToday)
  const nonSsn = num(data.cip?.nonSsnToday)
  const kycWaitingSsn = num(data.common?.kycWaitingSsn)
  const kycWaitingNonSsn = Math.max(0, num(data.common?.kycWaiting) - kycWaitingSsn)
  return {
    ...data,
    common: {
      ...data.common,
      kycWaitingNonSsn: String(kycWaitingNonSsn),
    },
    cip: {
      ...data.cip,
      submittedToday: String(ssn + nonSsn),
    },
    subscription: {
      ...data.subscription,
      unfunded: calcUnfunded(data.subscription?.without, data.subscription?.funded),
    },
  }
}

function normalizeLoaded(raw) {
  const base = initialState()
  if (!raw || typeof raw !== 'object') return base
  const commonMerged = { ...base.common, ...(raw.common || {}) }
  delete commonMerged.multiAccounts
  const merged = {
    ...base,
    ...raw,
    transfers: Array.isArray(raw.transfers) && raw.transfers.length ? raw.transfers.map((t) => ({ ...emptyTransfer(), ...t, accountType: t.accountType === 'RIA' || t.accountType === 'Trading' ? t.accountType : '' })) : base.transfers,
    common: commonMerged,
    multiAccounts: { ...base.multiAccounts, ...(raw.multiAccounts || {}) },
    cip: { ...base.cip, ...(raw.cip || {}) },
    productionFailedApis: Array.isArray(raw.productionFailedApis) && raw.productionFailedApis.length ? raw.productionFailedApis.map((row) => ({ ...emptyProductionFailedApi(), ...row })) : [],
    utm: Array.isArray(raw.utm) ? base.utm.map((row, i) => ({ ...row, ...(raw.utm[i] || {}) })) : base.utm,
    trading: { ...base.trading, ...(raw.trading || {}) },
    tradingAccount: { ...base.tradingAccount, ...(raw.tradingAccount || {}) },
    ria: { ...base.ria, ...(raw.ria || {}) },
    riaAccount: { ...base.riaAccount, ...(raw.riaAccount || {}) },
    subscription: { ...base.subscription, ...(raw.subscription || {}) },
  }
  return withDerived(merged)
}

function DeltaHint({ current, previous, money = false, className = 'mt-1.5' }) {
  if (previous === undefined || previous === null) return null
  const diff = num(current) - num(previous)
  const tone = diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-400'
  return (
    <span className={`${className} flex flex-wrap items-center gap-x-2 text-[11px] font-medium text-slate-500`}>
      <span>prev {display(previous, money)}</span>
      <span className={tone}>{displayDelta(diff, money)}</span>
    </span>
  )
}

function LabelWithTip({ label, tip, className = '', alertDot = false }) {
  const dot = alertDot ? <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" aria-hidden /> : null
  if (!tip) {
    return (
      <span className={`mb-2 flex items-center gap-2 text-xs font-semibold ${className}`}>
        {dot}
        {label}
      </span>
    )
  }
  return (
    <span className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${className}`}>
      {dot}
      <span>{label}</span>
      <span className="group relative inline-flex">
        <Info size={13} className="shrink-0 cursor-help opacity-70" aria-label={tip} />
        <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100">
          {tip}
        </span>
      </span>
    </span>
  )
}

function NumberInput({ value, onChange, money = false, ariaLabel, readOnly = false, className = '' }) {
  return (
    <div className="relative">
      {money && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">$</span>}
      <input
        aria-label={ariaLabel}
        type="number"
        min="0"
        step={money ? '0.01' : '1'}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border border-slate-200 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-100 ${money ? 'pl-7 pr-3' : 'px-3'} ${readOnly ? 'cursor-default bg-slate-100 text-slate-700' : 'bg-white'} ${className}`}
        placeholder="0"
      />
    </div>
  )
}

function Section({ number, title, subtitle, children, headerRight = null }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-[11px] font-bold text-white">{number}</span>
          <div>
            <h2 className="text-sm font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {headerRight}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function fieldTone(key, value) {
  if (key === 'active' || key === 'approved') return { box: 'border-emerald-200 bg-[#E8FAF1]', label: 'text-emerald-700', input: 'font-semibold text-emerald-700' }
  if (key === 'rejected') return { box: 'border-red-200 bg-[#FFF0F3]', label: 'text-red-700', input: 'font-semibold text-red-700' }
  if (greenMoneyKeys.has(key)) return { box: 'border-slate-200 bg-slate-50', label: 'text-slate-600', input: 'font-semibold text-emerald-600' }
  if (isPanicAlert(key, value)) return panicFormToneFor(key)
  if (warningKeys.has(key) && num(value) > 0) return { box: 'border-red-200 bg-red-50', label: 'text-red-700', input: 'font-semibold text-red-700' }
  return { box: 'border-slate-200 bg-slate-50', label: 'text-slate-600', input: '' }
}

function FieldGrid({ fields, values, setValues, previousValues, readOnlyKeys = new Set() }) {
  return (
    <div className="space-y-2.5">
      {fields.map(([key, label]) => {
        const tone = fieldTone(key, values[key])
        const alert = isPanicAlert(key, values[key])
        return (
          <label key={key} className={`block rounded-xl border px-3 py-2.5 ${tone.box}`} title={fieldTooltips[key] || undefined}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 flex-1">
                <LabelWithTip label={label} tip={fieldTooltips[key]} className={tone.label} alertDot={alert} />
              </div>
              <div className="sm:w-[140px] sm:min-w-[140px]">
                <NumberInput
                  ariaLabel={label}
                  value={values[key]}
                  money={moneyKeys.has(key)}
                  readOnly={readOnlyKeys.has(key)}
                  className={tone.input}
                  onChange={(value) => setValues({ ...values, [key]: value })}
                />
              </div>
            </div>
            <div className="mt-1.5 sm:text-right">
              <DeltaHint current={values[key]} previous={previousValues?.[key]} money={moneyKeys.has(key)} />
            </div>
          </label>
        )
      })}
    </div>
  )
}

function SimpleFormGrid({ fields, values, setValues, previousValues, readOnlyKeys = new Set(), columns = 'sm:grid-cols-2' }) {
  return (
    <div className={`grid gap-x-3 gap-y-3 ${columns}`}>
      {fields.map(([key, label]) => {
        const tone = fieldTone(key, values[key])
        const alert = isPanicAlert(key, values[key])
        const inputTone = alert || (warningKeys.has(key) && num(values[key]) > 0)
          ? alert
            ? panicInputClass(key)
            : 'border-red-200 bg-red-50'
          : greenMoneyKeys.has(key)
            ? 'border-slate-200 bg-slate-50'
            : ''
        return (
          <label key={key} className="block" title={fieldTooltips[key] || undefined}>
            <LabelWithTip label={label} tip={fieldTooltips[key]} className={tone.label} alertDot={alert} />
            <NumberInput
              ariaLabel={label}
              value={values[key]}
              money={moneyKeys.has(key)}
              readOnly={readOnlyKeys.has(key)}
              className={`${inputTone} ${tone.input}`.trim()}
              onChange={(value) => setValues({ ...values, [key]: value })}
            />
            <div className="mt-1">
              <DeltaHint current={values[key]} previous={previousValues?.[key]} money={moneyKeys.has(key)} />
            </div>
          </label>
        )
      })}
    </div>
  )
}

const emailCss = {
  wrap: 'margin:0 auto;max-width:760px;background:#ffffff;font-family:Arial,sans-serif;color:#182230;border:1px solid #dbe3ef;border-radius:14px;overflow:hidden',
  header: 'background:#0f4cce;color:#ffffff;padding:22px 26px',
  section: 'padding:18px 22px;border-top:1px solid #e4eaf2',
  title: 'font-size:15px;font-weight:700;color:#0f4cce;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px',
  table: 'width:100%;border-collapse:collapse;font-size:13px',
  th: 'background:#edf3ff;color:#182230;text-align:left;padding:9px;border:1px solid #dbe3ef;font-size:13px;font-weight:700;text-transform:uppercase',
  td: 'padding:9px;border:1px solid #dbe3ef;vertical-align:top',
}

function tableHtml(headers, rows, align = [], thExtra = '') {
  return `<table role="presentation" style="${emailCss.table}"><thead><tr>${headers.map((h, i) => `<th style="${emailCss.th};${thExtra};${align[i] === 'right' ? 'text-align:right' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, i) => `<td style="${emailCss.td};${align[i] === 'right' ? 'text-align:right' : ''}">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

const emphasisReportKeys = new Set(['totalFund', 'maxFund', 'fundedUsers', 'active', 'approved', 'rejected'])

function emphasisLabel(label) {
  return `<span style="font-weight:600">${label}</span>`
}

function metricCards(items, color, valueSize = '22px', labelSize = '10px') {
  return `<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:5px"><tr>${items.map(([label, value]) => `<td style="width:25%;padding:12px;background:#f7f9fc;border:1px solid #dbe3ef;border-radius:9px"><div style="font-size:${valueSize};font-weight:700;color:${color}">${value}</div><div style="font-size:${labelSize};font-weight:700;color:#61708a;text-transform:uppercase;margin-top:4px">${label}</div></td>`).join('')}</tr></table>`
}

function warningCell(key, value) {
  const warning = warningKeys.has(key) && num(value) > 0
  return `<span style="${warning ? 'color:#b42318;background:#fee4e2;padding:3px 7px;border-radius:12px;font-weight:700' : ''}">${display(value)}</span>`
}

function transferTypeCell(type) {
  const deposit = type === 'Deposit'
  const bg = deposit ? '#E8FAF1' : '#FFF0F3'
  const color = deposit ? '#067647' : '#b42318'
  return `<span style="display:inline-block;background:${bg};color:${color};padding:3px 8px;border-radius:10px;font-weight:700">${type}</span>`
}

function accountTypeCell(accountType) {
  if (accountType === 'RIA' || accountType === 'Trading') {
    const ria = accountType === 'RIA'
    const bg = ria ? '#f3e8ff' : '#e8f1ff'
    const color = ria ? '#7138dc' : '#0874e8'
    return `<span style="display:inline-block;background:${bg};color:${color};padding:3px 8px;border-radius:10px;font-weight:700">${accountType}</span>`
  }
  return `<span style="display:inline-block;background:#f1f5f9;color:#64748b;padding:3px 8px;border-radius:10px;font-weight:600">Not selected</span>`
}

function statusCell(key, value) {
  if (key === 'active' || key === 'approved') return `<span style="display:inline-block;background:#E8FAF1;color:#067647;padding:3px 8px;border-radius:10px;font-weight:700">${display(value)}</span>`
  if (key === 'rejected') return `<span style="display:inline-block;background:#FFF0F3;color:#b42318;padding:3px 8px;border-radius:10px;font-weight:700">${display(value)}</span>`
  return display(value)
}

function accountStatusRows(fields, values) {
  return fields
    .filter(([key]) => key !== 'approved' || num(values[key]) > 0)
    .map(([key, label]) => [emphasisReportKeys.has(key) ? emphasisLabel(label) : label, statusCell(key, values[key])])
}

function buildAccountStatusHtml(fields, values) {
  const body = fields
    .filter(([key]) => key !== 'approved' || num(values[key]) > 0)
    .map(([key, label]) => {
      const val = values[key]
      if (key === 'closed' && num(val) > 0) {
        return `<tr>
          <td style="${panicCellStyles('left')}">${panicLabelHtml(label)}</td>
          <td style="${panicCellStyles('right')}">${panicValueHtml(display(val))}</td>
        </tr>`
      }
      return `<tr><td style="${emailCss.td}">${emphasisReportKeys.has(key) ? emphasisLabel(label) : label}</td><td style="${emailCss.td};text-align:right">${statusCell(key, val)}</td></tr>`
    })
    .join('')
  return `<table role="presentation" style="${emailCss.table}"><thead><tr><th style="${emailCss.th}">Account Status</th><th style="${emailCss.th};text-align:right">Count</th></tr></thead><tbody>${body}</tbody></table>`
}

function buildCommonGroupedHtml(common, cip, multiAccounts) {
  const sectionHeader = (title, isFirst = false) => `<tr>
    <td colspan="2" style="padding:8px 12px;background:#edf3ff;border-left:1px solid #dbe3ef;border-right:1px solid #dbe3ef;border-bottom:1px solid #dbe3ef;${isFirst ? 'border-top:1px solid #dbe3ef' : 'border-top:3px solid #94a3b8'};font-size:11px;font-weight:700;color:#40506a;text-transform:uppercase;letter-spacing:0.04em">${title}</td>
  </tr>`

  const canSubmitWarn = num(cip.canSubmit) > 0
  const canSubmitRow = canSubmitWarn
    ? panicAlertRow('Can Submit', panicValueHtml(display(cip.canSubmit)))
    : `<tr>
        <td style="${emailCss.td};font-weight:600">Can Submit</td>
        <td style="${emailCss.td};text-align:right;font-weight:700">${display(cip.canSubmit)}</td>
      </tr>`

  const totalRow = (label, value) => `<tr style="background:#f7f9fc">
    <td style="${emailCss.td};font-weight:700;color:#0f4cce">${label}</td>
    <td style="${emailCss.td};text-align:right;font-size:17px;font-weight:700;color:#0f4cce">${display(value)}</td>
  </tr>`

  const subRow = (label, value) => `<tr>
    <td style="padding:5px 12px 5px 18px;border-left:1px solid #dbe3ef;border-right:1px solid #dbe3ef;border-bottom:1px solid #dbe3ef;border-top:none;color:#61708a;font-size:12.5px;line-height:1.35">${label}</td>
    <td style="padding:5px 12px;border-left:1px solid #dbe3ef;border-right:1px solid #dbe3ef;border-bottom:1px solid #dbe3ef;border-top:none;text-align:right;font-weight:600;font-size:12.5px;line-height:1.35">${display(value)}</td>
  </tr>`

  const body = [
    sectionHeader('KYC Waiting', true),
    totalRow('Users Waiting for KYC Approval', common.kycWaiting),
    subRow('↳ SSN', common.kycWaitingSsn),
    subRow('↳ Non-SSN', common.kycWaitingNonSsn),
    sectionHeader('CIP'),
    canSubmitRow,
    totalRow('Total Submitted Today', cip.submittedToday),
    subRow('↳ SSN CIP', cip.ssnToday),
    subRow('↳ Non-SSN CIP', cip.nonSsnToday),
    sectionHeader('Users with Multi Accounts'),
    totalRow('Users with Multi Accounts', multiAccounts.total),
    subRow('↳ Trading → <span style="color:#067647;font-weight:700">RIA</span>', multiAccounts.tradingToRia),
    subRow('↳ RIA → <span style="color:#067647;font-weight:700">Trading</span>', multiAccounts.riaToTrading),
  ].join('')

  return `<table role="presentation" style="${emailCss.table}"><thead><tr><th style="${emailCss.th}">Check</th><th style="${emailCss.th};text-align:right">Count</th></tr></thead><tbody>${body}</tbody></table>`
}

function buildCommonChecksHtml(values) {
  const body = commonFields
    .filter(([key]) => !['kycWaiting', 'kycWaitingSsn', 'kycWaitingNonSsn'].includes(key))
    .map(([key, label]) => {
      const val = values[key]
      const reportLabel = commonReportLabels[key] || label
      if (panicKeys.has(key) && num(val) > 0) {
        return `<tr>
          <td style="${panicCellStyles('left')}">${panicLabelHtml(reportLabel)}</td>
          <td style="${panicCellStyles('right')}">${panicValueHtml(display(val))}</td>
        </tr>`
      }
      return `<tr><td style="${emailCss.td}">${reportLabel}</td><td style="${emailCss.td};text-align:right">${warningCell(key, val)}</td></tr>`
    })
    .join('')
  return `<table role="presentation" style="${emailCss.table}"><thead><tr><th style="${emailCss.th}">Check</th><th style="${emailCss.th};text-align:right">Count</th></tr></thead><tbody>${body}</tbody></table>`
}

function moneyCell(key, value) {
  if (greenMoneyKeys.has(key)) return `<span style="color:#067647;font-weight:700">${display(value, true)}</span>`
  return display(value, moneyKeys.has(key))
}

function buildSubscriptionHtml(subscription) {
  const totalWarn = num(subscription.without) > 0
  return `<div style="border:1px solid #dbe3ef;border-radius:10px;overflow:hidden;background:#ffffff;margin-top:10px">
    <div style="padding:8px 12px;background:#edf3ff;border-bottom:1px solid #dbe3ef;font-size:11px;font-weight:700;color:#40506a;text-transform:uppercase">Users Without Subscription</div>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#f7f9fc">
        <td style="padding:10px 12px;border-bottom:1px solid #e4eaf2;font-weight:700;color:${totalWarn ? '#b42318' : '#0f4cce'}">Total</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e4eaf2;text-align:right;font-size:17px;font-weight:700;color:${totalWarn ? '#b42318' : '#0f4cce'}">${display(subscription.without)}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px 8px 20px;border-bottom:1px solid #e4eaf2;color:#61708a">↳ Funded Users</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e4eaf2;text-align:right;font-weight:600">${display(subscription.funded)}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px 10px 20px;color:#61708a">↳ Unfunded Users</td>
        <td style="padding:8px 12px 10px;text-align:right;font-weight:600">${display(subscription.unfunded)}</td>
      </tr>
    </table>
  </div>`
}

function buildProductionFailedApisHtml(rows) {
  if (!rows.length) {
    return `<div style="border:1px solid #dbe3ef;border-radius:10px;overflow:hidden;background:#ffffff">
      <div style="padding:8px 12px;background:#c40000;border-bottom:1px solid #7f1d1d;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase">Production Failed APIs</div>
      <div style="padding:16px 12px;color:#61708a;font-size:13px;text-align:center">No API errors today</div>
    </div>`
  }

  const body = rows.map((row) => [
    row.apiName || '—',
    maskEmail(row.userId),
    row.error || '—',
    row.issueOwner || '—',
    formatCreatedAtDisplay(row.createdAt),
  ])

  return `<div style="border:1px solid #dbe3ef;border-radius:10px;overflow:hidden;background:#ffffff">
    <div style="padding:8px 12px;background:#c40000;border-bottom:1px solid #7f1d1d;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase">Production Failed APIs</div>
    <table role="presentation" style="${emailCss.table}">
      <thead>
        <tr>
          ${['API Name', 'Email', 'Error Details', 'Issue Source', 'Reported At'].map((h) => `<th style="${emailCss.th}">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${body.map((row) => `<tr>${row.map((cell) => `<td style="${emailCss.td}">${cell}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  </div>`
}

function buildEmail(data, subject) {
  const commonHtml = buildCommonChecksHtml(data.common)
  const commonGroupedHtml = buildCommonGroupedHtml(data.common, data.cip, data.multiAccounts)
  const productionFailedApisHtml = buildProductionFailedApisHtml(data.productionFailedApis || [])
  const tradingRows = tradingFields.map(([key, label]) => [emphasisReportKeys.has(key) ? emphasisLabel(label) : label, moneyCell(key, data.trading[key])])
  const riaRows = riaFields.map(([key, label]) => [emphasisReportKeys.has(key) ? emphasisLabel(label) : label, key === 'portfolioCheck' ? warningCell(key, data.ria[key]) : moneyCell(key, data.ria[key])])
  const utmTotal = data.utm.reduce((sum, row) => sum + num(row.total), 0)
  const utmCreatedTotal = data.utm.reduce((sum, row) => sum + num(row.created), 0)
  const html = `<div style="background:#f4f7fb;padding:20px 8px"><div style="${emailCss.wrap}"><div style="${emailCss.header}"><div style="font-size:24px;font-weight:700">Trading &amp; RIA Report</div><div style="font-size:13px;margin-top:7px;opacity:.9">${subject.replace('Trading & RIA Report - ', '')}</div></div>
  <div style="${emailCss.section}"><div style="${emailCss.title}">1. Latest Fund Transfers <span style="font-weight:600;text-transform:none;letter-spacing:0;color:#61708a">(Last Two Days)</span></div>${data.transfers.length ? tableHtml(['Date', 'Account Type', 'Type', 'Total Amount', 'Accounts'], data.transfers.map((r) => [formatLongDate(r.date), accountTypeCell(r.accountType), transferTypeCell(r.type), display(r.amount, true), display(r.accounts)]), ['', '', '', 'right', 'right']) : `<div style="padding:16px 12px;border:1px dashed #cbd5e1;border-radius:10px;background:#f8fafc;color:#64748b;text-align:center;font-size:13px;font-weight:500">No cash deposit/withdrawal events found.</div>`}</div>
  <div style="${emailCss.section}"><div style="${emailCss.title}">2. Trading User Stats</div>${metricCards([['Total Draft', display(data.trading.draft)], ['Account Created', display(data.trading.created)], ['Opened Today', display(data.trading.openToday)], ['Drafts Today', display(data.trading.draftsToday)]], '#0874e8', '26px', '11px')}<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:10px 8px"><tr><td style="width:60%;vertical-align:top">${tableHtml(['Trading Report', 'Value'], tradingRows.slice(4), ['', 'right'])}</td><td style="width:40%;vertical-align:top">${buildAccountStatusHtml(accountFields, data.tradingAccount)}</td></tr></table></div>
  <div style="${emailCss.section}"><div style="${emailCss.title};color:#7138dc">3. RIA User Stats</div>${metricCards([['Total Draft', display(data.ria.draft)], ['Account Created', display(data.ria.created)], ['Opened Today', display(data.ria.openToday)], ['Drafts Today', display(data.ria.draftsToday)]], '#7c3aed')}<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:10px 8px"><tr><td style="width:52%;vertical-align:top">${tableHtml(['RIA Report', 'Value'], riaRows.slice(4), ['', 'right'])}</td><td style="width:48%;vertical-align:top">${tableHtml(['Account Status', 'Count'], accountStatusRows(riaAccountFields, data.riaAccount), ['', 'right'])}<div style="height:8px"></div>${buildSubscriptionHtml(data.subscription)}</td></tr></table></div>
  <div style="${emailCss.section}"><div style="${emailCss.title}">4. Common</div><table role="presentation" style="width:100%;border-collapse:separate;border-spacing:10px 0"><tr><td style="width:55%;vertical-align:top">${commonHtml}</td><td style="width:45%;vertical-align:top">${commonGroupedHtml}</td></tr></table></div>
  <div style="${emailCss.section}"><div style="${emailCss.title}">5. Production Failed APIs</div>${productionFailedApisHtml}</div>
  <div style="${emailCss.section}"><div style="${emailCss.title}">6. User UTM Tracking (Top 100) <span style="float:right;background:#E8FAF1;color:#067647;padding:4px 10px;border-radius:999px;font-weight:700;text-transform:none;letter-spacing:0">Total UTM: ${display(utmTotal)} | Account Created: ${display(utmCreatedTotal)}</span></div>${tableHtml(['Source', 'Medium', 'Campaign', 'Total', 'In Drafts', 'Acc Created'], data.utm.map((r) => [r.source, r.medium, r.campaign, display(r.total), display(r.draft), display(r.created)]), ['', '', '', 'right', 'right', 'right'])}</div>
  </div></div>`
  return { html, text: `${subject}\n\nPlease view the formatted HTML report in this email.` }
}

function transferRowBg(type) {
  return type === 'Deposit' ? 'bg-[#E8FAF1]' : 'bg-[#FFF0F3]'
}

function accountTypeSelectClass(accountType) {
  if (accountType === 'RIA') return 'text-purple-700'
  if (accountType === 'Trading') return 'text-blue-700'
  return 'text-slate-500'
}

function transferTextClass(type) {
  return type === 'Deposit' ? 'text-emerald-700' : 'text-red-700'
}

export default function App() {
  const today = new Date().toLocaleDateString('en-CA')
  const fileRef = useRef(null)
  const [date, setDate] = useState(today)
  const [time, setTime] = useState(TIMES[0])
  const [data, setData] = useState(initialState)
  const [previous, setPrevious] = useState(null)
  const [copied, setCopied] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [layoutMode, setLayoutMode] = useState(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY)
      return saved === 'split' || saved === 'modal' ? saved : 'modal'
    } catch {
      return 'modal'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, layoutMode)
    } catch {
      /* ignore */
    }
    if (layoutMode === 'split') setShowPreviewModal(false)
  }, [layoutMode])

  const subject = useMemo(() => subjectFor(date, time), [date, time])
  const email = useMemo(() => buildEmail(data, subject), [data, subject])
  const prev = previous?.data
  const commonSimpleFields = commonFields.filter(([key]) => !['kycWaiting', 'kycWaitingSsn', 'kycWaitingNonSsn'].includes(key))
  const hasProductionFailedApis = data.productionFailedApis.length > 0
  const utmTotal = data.utm.reduce((sum, row) => sum + num(row.total), 0)
  const utmCreatedTotal = data.utm.reduce((sum, row) => sum + num(row.created), 0)

  const updateTransfer = (index, key, value) => setData((old) => ({ ...old, transfers: old.transfers.map((row, i) => (i === index ? { ...row, [key]: value } : row)) }))
  const updateUtm = (index, key, value) => setData((old) => ({ ...old, utm: old.utm.map((row, i) => (i === index ? { ...row, [key]: value } : row)) }))
  const updateProductionFailedApi = (index, key, value) => setData((old) => ({ ...old, productionFailedApis: old.productionFailedApis.map((row, i) => (i === index ? { ...row, [key]: value } : row)) }))
  const updateCommon = (patch) => {
    setData((old) => {
      const common = { ...old.common, ...patch }
      common.kycWaitingNonSsn = String(Math.max(0, num(common.kycWaiting) - num(common.kycWaitingSsn)))
      return { ...old, common }
    })
  }

  const updateCip = (patch) => {
    setData((old) => {
      const cip = { ...old.cip, ...patch }
      cip.submittedToday = String(num(cip.ssnToday) + num(cip.nonSsnToday))
      return { ...old, cip }
    })
  }

  const updateMultiAccounts = (patch) => {
    setData((old) => {
      const multiAccounts = { ...old.multiAccounts, ...patch }
      const total = num(multiAccounts.total)

      if ('riaToTrading' in patch) {
        multiAccounts.tradingToRia = String(Math.max(0, total - num(multiAccounts.riaToTrading)))
      } else {
        multiAccounts.riaToTrading = String(Math.max(0, total - num(multiAccounts.tradingToRia)))
      }

      return { ...old, multiAccounts }
    })
  }

  const updateSubscription = (patch) => {
    setData((old) => {
      const subscription = { ...old.subscription, ...patch }
      subscription.unfunded = calcUnfunded(subscription.without, subscription.funded)
      return { ...old, subscription }
    })
  }

  const flash = (message) => {
    setCopied(message)
    setTimeout(() => setCopied(''), 2200)
  }

  const copySubject = async () => {
    await navigator.clipboard.writeText(subject)
    flash('Subject copied')
  }

  const copyEmail = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([email.html], { type: 'text/html' }), 'text/plain': new Blob([email.text], { type: 'text/plain' }) })])
      flash('Email copied — paste it into Gmail')
    } catch {
      await navigator.clipboard.writeText(email.text)
      flash('Plain text copied')
    }
    setShowSaveModal(true)
  }

  const openGmail = () => window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}`, '_blank', 'noopener,noreferrer')

  const saveData = () => {
    const savedAt = new Date().toISOString()
    const fileName = reportFileName(date, time)
    const record = {
      id: fileName.replace(/\.json$/i, ''),
      savedAt,
      meta: { date, time, subject, period: periodFor(time), fileName },
      data: withDerived(data),
    }

    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setShowSaveModal(false)
    flash(`Saved as ${fileName}`)
  }

  const loadPrevious = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const loaded = normalizeLoaded(parsed.data || parsed)
        const meta = parsed.meta || {}
        setPrevious({ data: loaded, meta, fileName: file.name })
        setData(loaded)
        if (meta.date) setDate(meta.date)
        if (meta.time) setTime(meta.time)
        flash('Previous cycle loaded — edit values to see deltas')
      } catch {
        flash('Could not read that JSON file')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const canSubmitTone = fieldTone('canSubmit', data.cip.canSubmit)
  const canSubmitAlert = isPanicAlert('canSubmit', data.cip.canSubmit)

  const clearAll = () => {
    setData(initialState())
    setDate(today)
    setTime(TIMES[0])
  }

  const previewToolbar = (
    <div className="flex flex-wrap gap-2">
      <button onClick={saveData} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700">
        <Save size={15} /> Save
      </button>
      <button onClick={clearAll} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
        <RotateCcw size={15} /> Clear all
      </button>
      <button onClick={copySubject} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        <Clipboard size={15} /> Subject
      </button>
      <button onClick={copyEmail} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700">
        <Mail size={15} /> Copy for Gmail
      </button>
      <button onClick={openGmail} className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100">
        Open Gmail <ExternalLink size={14} />
      </button>
    </div>
  )

  const previewPanel = (
    <>
      <div className="no-print mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Gmail preview</p>
          <p className="text-sm text-slate-500">What recipients will see</p>
        </div>
        {previewToolbar}
      </div>
      {copied && (
        <div className="no-print mb-3 flex shrink-0 items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          <Check size={16} /> {copied}
        </div>
      )}
      <div className="print-card min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
        <div dangerouslySetInnerHTML={{ __html: email.html }} />
      </div>
    </>
  )

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="no-print relative z-20 shrink-0 border-b border-slate-200/70 bg-gradient-to-b from-white via-white to-slate-50/90 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_10px_30px_-12px_rgba(15,76,206,0.12)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[2000px] flex-wrap items-center justify-between gap-4 px-5 py-3.5 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-md shadow-blue-600/25">
              <Mail size={18} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-600/90">Report Builder</p>
              <h1 className="truncate text-lg font-extrabold tracking-tight text-slate-950 sm:text-xl">Trading &amp; RIA Daily Report</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setLayoutMode('modal')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${layoutMode === 'modal' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80' : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'}`}
              >
                <Eye size={14} /> Modal
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('split')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${layoutMode === 'split' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80' : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'}`}
              >
                <Columns2 size={14} /> Split
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border-0 bg-transparent px-0 py-0 text-sm font-semibold text-slate-800 outline-none focus:ring-0"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Time</span>
              <select
                aria-label="Report time"
                value={isPresetTime(time) ? time : CUSTOM_TIME_VALUE}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === CUSTOM_TIME_VALUE) {
                    setTime(isPresetTime(time) ? '12:00 PM' : time)
                  } else {
                    setTime(value)
                  }
                }}
                className="rounded-md border-0 bg-transparent py-0 pl-0 pr-6 text-sm font-semibold text-slate-800 outline-none focus:ring-0"
              >
                <option value={TIMES[0]}>{TIMES[0]}</option>
                <option value={TIMES[1]}>{TIMES[1]}</option>
                <option value={CUSTOM_TIME_VALUE}>Custom...</option>
              </select>
              {!isPresetTime(time) && (
                <>
                  <span className="hidden h-4 w-px bg-slate-200 sm:block" />
                  <select
                    aria-label="Custom report time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="rounded-md border-0 bg-transparent py-0 pl-0 pr-6 text-sm font-semibold text-slate-800 outline-none focus:ring-0"
                  >
                    {TIME_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className={`mx-auto min-h-0 w-full flex-1 gap-6 overflow-y-auto p-5 ${layoutMode === 'split' ? 'grid max-w-[2000px] xl:grid-cols-[minmax(620px,1fr)_minmax(520px,.9fr)] xl:overflow-hidden' : 'max-w-4xl'}`}>
        <div className={`no-print min-h-0 space-y-5 ${layoutMode === 'split' ? 'xl:overflow-y-auto xl:pr-1' : ''}`}>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={loadPrevious} />
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase text-blue-700">Generated subject</p>
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
              >
                <FolderOpen size={14} /> Load previous
              </button>
            </div>
            <p className="mt-2 font-semibold text-blue-950">{subject}</p>
          </div>

          {previous && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div>
                <p className="text-xs font-bold uppercase text-amber-700">Comparing vs previous cycle</p>
                <p className="mt-0.5 text-sm font-semibold text-amber-950">
                  {previous.fileName}
                  {previous.meta?.date || previous.meta?.time ? ` · ${[previous.meta.date, previous.meta.time].filter(Boolean).join(' · ')}` : ''}
                </p>
                <p className="mt-0.5 text-xs text-amber-700">Each field shows previous value and change (+/−)</p>
              </div>
              <button onClick={() => setPrevious(null)} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                <X size={14} /> Clear compare
              </button>
            </div>
          )}

          <Section number="1" title="Latest Fund Transfers" subtitle="Last Two Days — add or remove rows as transfers change">
            {data.transfers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm font-medium text-slate-500">
                No cash deposit/withdrawal events found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                      {['Date', 'Account Type', 'Type', 'Total Amount', 'Accounts', ''].map((h, i) => (
                        <th key={i} className="px-2 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.transfers.map((row, index) => {
                      return (
                        <tr key={index} className={`border-b border-slate-100 align-top ${transferRowBg(row.type)}`}>
                          <td className="px-2 py-2">
                            <input
                              aria-label={`Transfer ${index + 1} date`}
                              type="date"
                              value={row.date}
                              onChange={(e) => updateTransfer(index, 'date', e.target.value)}
                              className="w-full min-w-[130px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <select
                              aria-label={`Transfer ${index + 1} account type`}
                              value={row.accountType || ''}
                              onChange={(e) => updateTransfer(index, 'accountType', e.target.value)}
                              className={`w-full min-w-[110px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold ${accountTypeSelectClass(row.accountType)}`}
                            >
                              <option value="">Not selected</option>
                              <option>Trading</option>
                              <option>RIA</option>
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <select
                              aria-label={`Transfer ${index + 1} type`}
                              value={row.type}
                              onChange={(e) => updateTransfer(index, 'type', e.target.value)}
                              className={`w-full min-w-[110px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold ${transferTextClass(row.type)}`}
                            >
                              <option>Deposit</option>
                              <option>Withdrawn</option>
                            </select>
                          </td>
                          <td className="w-32 px-2 py-2">
                            <NumberInput
                              ariaLabel={`Transfer ${index + 1} amount`}
                              money
                              value={row.amount}
                              className={transferTextClass(row.type)}
                              onChange={(v) => updateTransfer(index, 'amount', v)}
                            />
                          </td>
                          <td className="w-24 px-2 py-2">
                            <NumberInput
                              ariaLabel={`Transfer ${index + 1} accounts`}
                              value={row.accounts}
                              className={transferTextClass(row.type)}
                              onChange={(v) => updateTransfer(index, 'accounts', v)}
                            />
                          </td>
                          <td className="w-10 px-2 py-2">
                            <button
                              aria-label={`Delete transfer ${index + 1}`}
                              onClick={() => setData({ ...data, transfers: data.transfers.filter((_, i) => i !== index) })}
                              className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <button onClick={() => setData({ ...data, transfers: [...data.transfers, emptyTransfer()] })} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100">
              <Plus size={16} /> Add transfer
            </button>
          </Section>

          <Section number="2" title="Trading User Stats">
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Trading Report</h3>
                <SimpleFormGrid fields={tradingFields} values={data.trading} previousValues={prev?.trading} setValues={(trading) => setData({ ...data, trading })} />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Account Status</h3>
                <SimpleFormGrid fields={accountFields} values={data.tradingAccount} previousValues={prev?.tradingAccount} setValues={(tradingAccount) => setData({ ...data, tradingAccount })} columns="sm:grid-cols-2" />
              </div>
            </div>
          </Section>

          <Section number="3" title="RIA User Stats">
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">RIA Report</h3>
                <SimpleFormGrid fields={riaFields} values={data.ria} previousValues={prev?.ria} setValues={(ria) => setData({ ...data, ria })} />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Account Status</h3>
                <SimpleFormGrid fields={riaAccountFields} values={data.riaAccount} previousValues={prev?.riaAccount} setValues={(riaAccount) => setData({ ...data, riaAccount })} columns="sm:grid-cols-2" />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Users Without Subscription</h3>
                <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className={`mb-2 block text-xs font-semibold ${num(data.subscription.without) > 0 ? 'text-red-700' : 'text-slate-600'}`}>Total</span>
                    <NumberInput ariaLabel="Total" value={data.subscription.without} className={`${num(data.subscription.without) > 0 ? 'border-red-200 bg-red-50 font-semibold text-red-700' : ''}`} onChange={(v) => updateSubscription({ without: v })} />
                    <p className="mt-1 text-[11px] text-slate-500">= Funded Users + Unfunded Users</p>
                    <div className="mt-1">
                      <DeltaHint current={data.subscription.without} previous={prev?.subscription?.without} />
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-slate-600">↳ Funded Users</span>
                    <NumberInput ariaLabel="Funded Users" value={data.subscription.funded} onChange={(v) => updateSubscription({ funded: v })} />
                    <div className="mt-1">
                      <DeltaHint current={data.subscription.funded} previous={prev?.subscription?.funded} />
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-slate-600">↳ Unfunded Users</span>
                    <NumberInput ariaLabel="Unfunded Users" value={data.subscription.unfunded} readOnly />
                    <p className="mt-1 text-[11px] text-slate-500">Auto: Total − Funded</p>
                    <div className="mt-1">
                      <DeltaHint current={data.subscription.unfunded} previous={prev?.subscription?.unfunded} />
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </Section>

          <Section number="4" title="Common">
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Operational Checks</h3>
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900" title={KYC_WAITING_BREAKDOWN_TOOLTIP}>
                      Users Waiting for KYC Approval
                      <span className="group relative inline-flex normal-case tracking-normal">
                        <Info size={13} className="cursor-help opacity-70" aria-label={KYC_WAITING_BREAKDOWN_TOOLTIP} />
                        <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                          {KYC_WAITING_BREAKDOWN_TOOLTIP}
                        </span>
                      </span>
                    </div>
                    <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2">
                      <label className="block sm:col-span-2">
                        <span className="mb-2 block text-xs font-semibold text-slate-600">Users Waiting for KYC Approval</span>
                        <NumberInput ariaLabel="Users Waiting for KYC Approval" value={data.common.kycWaiting} onChange={(v) => updateCommon({ kycWaiting: v })} />
                        <p className="mt-1 text-[11px] text-slate-500">Non-SSN auto = Total - SSN</p>
                        <div className="mt-1">
                          <DeltaHint current={data.common.kycWaiting} previous={prev?.common?.kycWaiting} />
                        </div>
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-xs font-semibold text-slate-600">SSN</span>
                        <NumberInput ariaLabel="KYC Waiting SSN" value={data.common.kycWaitingSsn} onChange={(v) => updateCommon({ kycWaitingSsn: v })} />
                        <div className="mt-1">
                          <DeltaHint current={data.common.kycWaitingSsn} previous={prev?.common?.kycWaitingSsn} />
                        </div>
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-xs font-semibold text-slate-600">Non-SSN</span>
                        <NumberInput ariaLabel="KYC Waiting Non-SSN" value={data.common.kycWaitingNonSsn} readOnly />
                        <p className="mt-1 text-[11px] text-slate-500">Auto: Total - SSN</p>
                        <div className="mt-1">
                          <DeltaHint current={data.common.kycWaitingNonSsn} previous={prev?.common?.kycWaitingNonSsn} />
                        </div>
                      </label>
                    </div>
                  </div>
                  <SimpleFormGrid fields={commonSimpleFields} values={data.common} previousValues={prev?.common} setValues={(common) => setData({ ...data, common })} />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900" title={CIP_TOOLTIP}>
                  CIP
                  <span className="group relative inline-flex normal-case tracking-normal">
                    <Info size={13} className="cursor-help opacity-70" aria-label={CIP_TOOLTIP} />
                    <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                      {CIP_TOOLTIP}
                    </span>
                  </span>
                </h3>
                <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className={`mb-2 flex items-center gap-2 text-xs font-semibold ${canSubmitTone.label}`}>
                      {canSubmitAlert && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" aria-hidden />}
                      Can Submit
                    </span>
                    <NumberInput ariaLabel="Can Submit" value={data.cip.canSubmit} className={`${canSubmitAlert ? panicInputClass('canSubmit') : ''} ${canSubmitTone.input}`.trim()} onChange={(v) => updateCip({ canSubmit: v })} />
                    <div className="mt-1">
                      <DeltaHint current={data.cip.canSubmit} previous={prev?.cip?.canSubmit} />
                    </div>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-xs font-semibold text-slate-600">Total Submitted Today</span>
                    <NumberInput ariaLabel="Total Submitted Today" value={data.cip.submittedToday} readOnly />
                    <p className="mt-1 text-[11px] text-slate-500">= SSN CIP + Non-SSN CIP</p>
                    <div className="mt-1">
                      <DeltaHint current={data.cip.submittedToday} previous={prev?.cip?.submittedToday} />
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-slate-600">Total SSN CIP Submitted Today</span>
                    <NumberInput ariaLabel="Total SSN CIP Submitted Today" value={data.cip.ssnToday} onChange={(v) => updateCip({ ssnToday: v })} />
                    <div className="mt-1">
                      <DeltaHint current={data.cip.ssnToday} previous={prev?.cip?.ssnToday} />
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-slate-600">Total Non-SSN CIP Submitted Today</span>
                    <NumberInput ariaLabel="Total Non-SSN CIP Submitted Today" value={data.cip.nonSsnToday} onChange={(v) => updateCip({ nonSsnToday: v })} />
                    <div className="mt-1">
                      <DeltaHint current={data.cip.nonSsnToday} previous={prev?.cip?.nonSsnToday} />
                    </div>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900" title={MULTI_ACCOUNTS_TOOLTIP}>
                  Users with Multi Accounts
                  <span className="group relative inline-flex normal-case tracking-normal">
                    <Info size={13} className="cursor-help opacity-70" aria-label={MULTI_ACCOUNTS_TOOLTIP} />
                    <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                      {MULTI_ACCOUNTS_TOOLTIP}
                    </span>
                  </span>
                </h3>
                <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-xs font-semibold text-slate-600">Users with Multi Accounts</span>
                    <NumberInput ariaLabel="Users with Multi Accounts" value={data.multiAccounts.total} onChange={(v) => updateMultiAccounts({ total: v })} />
                    <div className="mt-1">
                      <DeltaHint current={data.multiAccounts.total} previous={prev?.multiAccounts?.total} />
                    </div>
                  </label>

                  <div className="sm:col-span-2">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-slate-600">Account Order</p>
                      <p className="text-[11px] text-slate-500">Total − one = other</p>
                    </div>
                    <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-xs font-semibold text-slate-600">Trading → <span className="font-bold text-emerald-700">RIA</span></span>
                        <NumberInput ariaLabel="Trading to RIA" value={data.multiAccounts.tradingToRia} onChange={(v) => updateMultiAccounts({ tradingToRia: v })} />
                        <div className="mt-1">
                          <DeltaHint current={data.multiAccounts.tradingToRia} previous={prev?.multiAccounts?.tradingToRia} />
                        </div>
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-xs font-semibold text-slate-600">RIA → <span className="font-bold text-emerald-700">Trading</span></span>
                        <NumberInput ariaLabel="RIA to Trading" value={data.multiAccounts.riaToTrading} onChange={(v) => updateMultiAccounts({ riaToTrading: v })} />
                        <div className="mt-1">
                          <DeltaHint current={data.multiAccounts.riaToTrading} previous={prev?.multiAccounts?.riaToTrading} />
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className={`flex items-center justify-between border-b px-4 py-3 ${hasProductionFailedApis ? 'border-[#7f1d1d] bg-[#c40000]' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center gap-3">
                <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${hasProductionFailedApis ? 'bg-black text-white' : 'bg-blue-600 text-white'}`}>5</span>
                <div>
                  <h2 className={`text-sm font-bold ${hasProductionFailedApis ? 'text-white' : 'text-slate-900'}`}>Production Failed APIs</h2>
                  <p className={`mt-0.5 text-xs ${hasProductionFailedApis ? 'text-red-100' : 'text-slate-500'}`}>Track production API failures and issue ownership</p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {data.productionFailedApis.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm font-medium text-slate-500">
                  No API errors today
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[900px] w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                        {['API Name', 'Email', 'Error Details', 'Issue Source', 'Reported At', 'Backup Date', 'Backup Time', ''].map((h, i) => (
                          <th key={i} className="px-2 py-2.5 normal-case tracking-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.productionFailedApis.map((row, index) => {
                        const prevRow = prev?.productionFailedApis?.[index]
                        const createdAtParts = parseCreatedAtParts(row.createdAt)
                        return (
                          <tr key={index} className="border-b border-slate-100 align-top">
                            <td className="px-2 py-2">
                              <input
                                aria-label={`Production API ${index + 1} name`}
                                value={row.apiName}
                                onChange={(e) => updateProductionFailedApi(index, 'apiName', e.target.value)}
                                className="w-full min-w-[180px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                aria-label={`Production API ${index + 1} email`}
                                value={row.userId}
                                onChange={(e) => updateProductionFailedApi(index, 'userId', e.target.value)}
                                placeholder="smart.hussain2006@gmail.com"
                                className="w-full min-w-[190px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <textarea
                                aria-label={`Production API ${index + 1} error`}
                                value={row.error}
                                onChange={(e) => updateProductionFailedApi(index, 'error', e.target.value)}
                                rows={3}
                                className="w-full min-w-[240px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <select
                                aria-label={`Production API ${index + 1} issue owner`}
                                value={row.issueOwner}
                                onChange={(e) => updateProductionFailedApi(index, 'issueOwner', e.target.value)}
                                className="w-full min-w-[130px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
                              >
                                <option>User</option>
                                <option>Our issue</option>
                              </select>
                            </td>
                            <td className="px-2 py-2">
                              <input
                                aria-label={`Production API ${index + 1} createdAt`}
                                value={row.createdAt}
                                onChange={(e) => updateProductionFailedApi(index, 'createdAt', e.target.value)}
                                placeholder="2026-08-17 05:03:19"
                                className="w-full min-w-[190px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
                              />
                              <div className="mt-1 text-[11px] text-slate-500">{formatCreatedAtDisplay(row.createdAt)}</div>
                            </td>
                            <td className="px-2 py-2">
                              <input
                                aria-label={`Production API ${index + 1} backup date`}
                                type="date"
                                value={createdAtParts.date}
                                onChange={(e) => updateProductionFailedApi(index, 'createdAt', composeCreatedAt(e.target.value, createdAtParts.time))}
                                className="w-full min-w-[140px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                aria-label={`Production API ${index + 1} backup time`}
                                type="time"
                                step="1"
                                value={createdAtParts.time}
                                onChange={(e) => updateProductionFailedApi(index, 'createdAt', composeCreatedAt(createdAtParts.date, e.target.value))}
                                className="w-full min-w-[110px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
                              />
                            </td>
                            <td className="w-10 px-2 py-2">
                              <button
                                aria-label={`Delete production API row ${index + 1}`}
                                onClick={() => setData((old) => ({ ...old, productionFailedApis: old.productionFailedApis.filter((_, i) => i !== index) }))}
                                className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                onClick={() => setData((old) => ({ ...old, productionFailedApis: [...old.productionFailedApis, emptyProductionFailedApi()] }))}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
              >
                <Plus size={16} /> Add API row
              </button>
            </div>
          </section>

          <Section
            number="6"
            title="User UTM Tracking (Top 100)"
            subtitle="Edit, add, or remove rows as the UTM list changes"
            headerRight={<span className="rounded-full bg-[#E8FAF1] px-3 py-1.5 text-xs font-bold text-emerald-700">Total UTM: {display(utmTotal)} | Account Created: {display(utmCreatedTotal)}</span>}
          >
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                    {['Source', 'Medium', 'Campaign', 'Total', 'In Drafts', 'Acc Created', ''].map((h, i) => (
                      <th key={h} className="px-2 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.utm.map((row, index) => {
                    const prevRow = prev?.utm?.[index]
                    return (
                      <tr key={`${row.source}-${index}`} className="border-b border-slate-100 align-top">
                        <td className="px-2 py-2">
                          <input
                            aria-label={`UTM ${index + 1} source`}
                            value={row.source}
                            onChange={(e) => updateUtm(index, 'source', e.target.value)}
                            className="w-full min-w-[140px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-800"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            aria-label={`UTM ${index + 1} medium`}
                            value={row.medium}
                            onChange={(e) => updateUtm(index, 'medium', e.target.value)}
                            className="w-full min-w-[120px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            aria-label={`UTM ${index + 1} campaign`}
                            value={row.campaign}
                            onChange={(e) => updateUtm(index, 'campaign', e.target.value)}
                            className="w-full min-w-[170px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
                          />
                        </td>
                        {['total', 'draft', 'created'].map((key) => (
                          <td key={key} className="w-28 px-2 py-2">
                            <NumberInput ariaLabel={`${row.source} ${key}`} value={row[key]} onChange={(v) => updateUtm(index, key, v)} />
                            <DeltaHint current={row[key]} previous={prevRow?.[key]} />
                          </td>
                        ))}
                        <td className="w-10 px-2 py-2">
                          <button
                            aria-label={`Delete UTM row ${index + 1}`}
                            disabled={data.utm.length === 1}
                            onClick={() => setData((old) => ({ ...old, utm: old.utm.filter((_, i) => i !== index) }))}
                            className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <button
              onClick={() => setData((old) => ({ ...old, utm: [...old.utm, emptyUtmRow()] }))}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
            >
              <Plus size={16} /> Add UTM row
            </button>
          </Section>
        </div>

        {layoutMode === 'split' && (
          <aside className="flex min-h-0 flex-col xl:overflow-hidden">
            {previewPanel}
          </aside>
        )}
      </main>

      {layoutMode === 'modal' && (
        <button
          type="button"
          onClick={() => setShowPreviewModal(true)}
          className="no-print fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700"
        >
          <Eye size={18} /> Preview
        </button>
      )}

      {showPreviewModal && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-modal-title"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="flex h-[min(92vh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <h2 id="preview-modal-title" className="text-lg font-bold text-slate-900">Email Preview</h2>
                <p className="text-sm text-slate-500">Review, copy, or save before sending</p>
              </div>
              <button aria-label="Close preview" onClick={() => setShowPreviewModal(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
              {previewPanel}
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="no-print fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="save-modal-title">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="save-modal-title" className="text-lg font-bold text-slate-900">Save this report?</h3>
                <p className="mt-2 text-sm text-slate-600">Would you like to save/download the file for this cycle?</p>
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">{reportFileName(date, time)}</p>
              </div>
              <button aria-label="Close" onClick={() => setShowSaveModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button onClick={() => setShowSaveModal(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Skip
              </button>
              <button onClick={saveData} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
                <Save size={15} /> Save / Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
