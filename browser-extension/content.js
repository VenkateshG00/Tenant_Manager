(() => {
  'use strict'

  const USC_PARAMETER = 'tenant-manager-usc'
  const SESSION_KEY = 'tenant-manager-tgnpdcl-lookup'
  const APP_URL = 'https://my-tenants-manager.pages.dev/bills'
  const INITIAL_PATH = '/Menu/KnowYourBillLT'
  const RESULT_PATH = '/Consumer/DuplicateBillValidate'
  const isInitialPage = location.pathname === INITIAL_PATH
  const isResultPage = location.pathname === RESULT_PATH
  if (!isInitialPage && !isResultPage) return

  let lookup = null
  if (isInitialPage) {
    const params = new URLSearchParams(location.hash.slice(1))
    const uscNumber = params.get(USC_PARAMETER)
    if (uscNumber) {
      history.replaceState(history.state, '', `${location.pathname}${location.search}`)
      lookup = { uscNumber, state: 'pending' }
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(lookup))
      } catch {
        lookup = { uscNumber, state: 'no-session-storage' }
      }
    }
  } else {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY)
      if (stored) lookup = JSON.parse(stored)
    } catch {
      lookup = null
    }
  }

  let panel = null
  let messageNode = null
  let actionNode = null

  function showPanel(title, message, action) {
    if (!document.documentElement) return
    if (!panel) {
      const host = document.createElement('div')
      host.dataset.tenantManagerHelper = 'true'
      host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:calc(100vw - 32px);'
      const shadow = host.attachShadow({ mode: 'closed' })
      const style = document.createElement('style')
      style.textContent = `
        :host { all: initial; }
        section { box-sizing:border-box;width:min(360px,calc(100vw - 32px));padding:16px;border:1px solid #dbe2ef;border-radius:16px;background:#fff;color:#172033;font:14px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 16px 48px #0f172a30; }
        h2 { margin:0 0 6px;font-size:15px;line-height:1.35;font-weight:700; }
        p { margin:0;color:#526078; }
        a,button { display:inline-flex;align-items:center;justify-content:center;min-height:40px;margin-top:12px;padding:0 14px;border:0;border-radius:10px;background:#3730a3;color:#fff;font:600 13px system-ui,-apple-system,sans-serif;text-decoration:none;cursor:pointer; }
        small { display:block;margin-top:10px;color:#64748b;font-size:11px; }
      `
      const section = document.createElement('section')
      const heading = document.createElement('h2')
      messageNode = document.createElement('p')
      actionNode = document.createElement('div')
      section.append(heading, messageNode, actionNode)
      shadow.append(style, section)
      document.documentElement.append(host)
      panel = { host, heading }
    }
    panel.heading.textContent = title
    messageNode.textContent = message
    actionNode.replaceChildren()
    if (action) actionNode.append(action)
  }

  function dateToIso(text) {
    const value = text.trim()
    let match = value.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/)
    if (match) {
      const [, year, month, day] = match
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
    match = value.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/)
    if (match) {
      const [, day, month, year] = match
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
    match = value.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})[,]?\s+(\d{4})\b/)
    if (!match) return null
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const month = months.findIndex((name) => match[2].toLowerCase().startsWith(name))
    if (month < 0) return null
    return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`
  }

  function monthToIso(text) {
    const match = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i)
    if (!match) return null
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    const month = months.indexOf(match[1].toLowerCase())
    return month < 0 ? null : `${match[2]}-${String(month + 1).padStart(2, '0')}`
  }

  function amountFromText(text) {
    const value = text.replace(/\s+/g, ' ').trim()
    const match =
      value.match(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i) ??
      value.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:₹|Rs\.?|INR)/i) ??
      value.match(/^\s*([\d,]+(?:\.\d{1,2})?)\s*$/)
    if (!match) return null
    const amount = match[1].replace(/,/g, '')
    return /^\d{1,7}(?:\.\d{1,2})?$/.test(amount) ? amount : null
  }

  function findRowValue(rows, pattern) {
    for (const row of rows) {
      const firstCell = row.cells[0]
      const label =
        firstCell?.innerText?.replace(/\s+/g, ' ').trim() ||
        firstCell?.textContent?.replace(/\s+/g, ' ').trim() ||
        ''
      if (!pattern.test(label)) continue
      const value = [...row.cells]
        .slice(1)
        .map((cell) => cell.innerText || cell.textContent || '')
        .join(' ')
      if (value.trim()) return value.trim()
    }
    return null
  }

  function extractBill() {
    const rows = [...document.querySelectorAll('table tr')].filter((row) => row.cells.length > 1)
    const amountLabels = [
      /\bnet amount payable\b/i,
      /\btotal amount payable\b/i,
      /\bamount payable\b/i,
      /\bnet amount\b/i,
      /\b(net )?bill amount\b/i,
      /\bbill amount\b/i,
      /\btotal due\b/i,
      /\bcurrent bill demand\b/i,
      /\bcurrent demand\b/i,
      /\btotal demand\b/i,
    ]
    let amount = null
    for (const label of amountLabels) {
      const value = findRowValue(rows, label)
      if (value) {
        amount = amountFromText(value)
        if (amount) break
      }
    }
    if (!amount) return null

    const dueText = findRowValue(rows, /\b(due date|last date|pay on or before)\b/i)
    const generatedText = findRowValue(rows, /\b(generated on|bill date|issue date)\b/i)
    const monthText = findRowValue(rows, /\b(billing month|bill month|billing period|bill period)\b/i)
    const referenceText = findRowValue(rows, /\b(bill|reference|transaction)\s*(no\.?|number|#)/i)
    const uscNumber = lookup && /^\d{8}$/.test(lookup.uscNumber) ? lookup.uscNumber : ''

    return {
      version: 1,
      uscNumber,
      amount,
      billingMonth: monthText ? monthToIso(monthText) : null,
      billGeneratedAt: generatedText ? dateToIso(generatedText) : null,
      dueDate: dueText ? dateToIso(dueText) : null,
      billReference: referenceText?.slice(0, 80) ?? null,
    }
  }

  function reviewLink(draft) {
    const url = new URL(APP_URL)
    url.hash = `tenant-manager-bill=${encodeURIComponent(JSON.stringify(draft))}`
    const link = document.createElement('a')
    link.href = url.href
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = 'Review in Tenant Manager'
    link.addEventListener('click', () => sessionStorage.removeItem(SESSION_KEY), { once: true })
    return link
  }

  function renderBillResult() {
    const bill = extractBill()
    if (!bill) {
      if (isResultPage && lookup?.state === 'submitted') {
        showPanel(
          'Lookup returned without readable bill details',
          'Check the provider response. CAPTCHA, errors, or a changed page layout may need manual attention. No bill was imported.',
          null,
        )
      }
      return
    }
    if (!bill.uscNumber) {
      showPanel('Bill amount detected', `₹${bill.amount} found, but no valid USC is available to match this bill to a meter.`, null)
      return
    }
    const details = [
      `Detected amount: ₹${bill.amount}.`,
      bill.dueDate ? `Due date: ${bill.dueDate}.` : '',
      bill.billingMonth ? `Billing month: ${bill.billingMonth}.` : '',
      'Review these details before saving; they are not saved automatically.',
    ].filter(Boolean).join(' ')
    showPanel('TGNPDCL bill details found', details, reviewLink(bill))
  }

  function hasVerificationChallenge() {
    return Boolean(
      document.querySelector(
        'iframe[src*="captcha"], iframe[src*="recaptcha"], .g-recaptcha, [name*="captcha" i], [id*="captcha" i]',
      ) ||
      /\b(captcha|security code|one[- ]time password|otp)\b/i.test(
        document.body?.innerText || document.body?.textContent || '',
      ),
    )
  }

  function startLookup() {
    if (!lookup || lookup.state !== 'pending') return false
    const field = document.querySelector('#uscno[name="uscno"]')
    const form = field?.form
    const submit = document.querySelector('#getBill')
    if (!(field instanceof HTMLInputElement) || !(form instanceof HTMLFormElement) || !submit) {
      return false
    }
    if (!/^\d{8}$/.test(lookup.uscNumber)) {
      lookup.state = 'invalid-usc'
      showPanel('USC not filled', 'The service number must be exactly 8 digits. Open the lookup manually and check the meter number.', null)
      return true
    }
    if (hasVerificationChallenge()) {
      lookup.state = 'manual'
      showPanel('Provider verification required', 'Complete any verification on the official site yourself. The extension does not bypass CAPTCHA or security checks.', null)
      return true
    }

    field.value = lookup.uscNumber
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
    lookup.state = 'submitted'
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(lookup))
    } catch {
      lookup.state = 'manual'
      showPanel('Could not prepare lookup', 'Browser session storage is unavailable. Submit the USC manually on TGNPDCL.', null)
      return true
    }

    showPanel(
      'Submitting USC to TGNPDCL',
      'The official lookup is being submitted. Any provider verification must be completed by you.',
      null,
    )
    try {
      if (typeof form.requestSubmit === 'function') form.requestSubmit(submit)
      else submit.click()
    } catch {
      lookup.state = 'manual'
      showPanel(
        'Could not submit the lookup',
        'The provider form rejected automatic submission. Check the USC and use TGNPDCL’s Get Bill button manually.',
        null,
      )
    }
    window.setTimeout(() => {
      if (isInitialPage && document.querySelector('#uscno') && !extractBill()) {
        showPanel(
          'Lookup did not continue',
          'The provider page did not advance automatically. Confirm the USC and use TGNPDCL’s Get Bill button manually.',
          null,
        )
      }
    }, 8000)
    return true
  }

  function initialize() {
    if (lookup?.state === 'pending') {
      let attempts = 0
      const timer = window.setInterval(() => {
        attempts += 1
        if (startLookup() || attempts >= 40) {
          window.clearInterval(timer)
          if (attempts >= 40 && lookup?.state === 'pending') {
            showPanel('TGNPDCL form not found', 'The lookup page structure changed. Open the official form and enter the USC manually.', null)
          }
        }
      }, 250)
    } else if (isResultPage && lookup?.state === 'submitted') {
      showPanel('Checking the TGNPDCL response', 'Looking for a clearly labeled bill amount. Nothing will be saved without your review.', null)
    }

    const observer = new MutationObserver((records) => {
      if (records.some((record) => !panel?.host.contains(record.target))) renderBillResult()
    })
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
    window.setTimeout(() => renderBillResult(), 1200)
    window.setTimeout(() => observer.disconnect(), 30000)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true })
  } else {
    initialize()
  }
})()
