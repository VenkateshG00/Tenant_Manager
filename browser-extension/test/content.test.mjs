import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const contentScript = readFileSync(new URL('../content.js', import.meta.url), 'utf8')

function openShadowRoots(dom) {
  const attachShadow = dom.window.Element.prototype.attachShadow
  dom.window.Element.prototype.attachShadow = function (options) {
    return attachShadow.call(this, { ...options, mode: 'open' })
  }
}

function waitForInitialization(dom, delay = 300) {
  return new Promise((resolve) => {
    const wait = () => dom.window.setTimeout(resolve, delay)
    if (dom.window.document.readyState === 'loading') {
      dom.window.document.addEventListener('DOMContentLoaded', wait, { once: true })
    } else {
      wait()
    }
  })
}

test('fills the eight-digit USC and submits the official form', async (context) => {
  const dom = new JSDOM(
    '<form id="frm"><input id="uscno" name="uscno"><input id="getBill" type="submit" value="Get Bill"></form>',
    {
      url: 'https://tgnpdcl.com/Menu/KnowYourBillLT#tenant-manager-usc=15952909',
      runScripts: 'outside-only',
    },
  )
  context.after(() => dom.window.close())
  openShadowRoots(dom)
  let submitted = false
  dom.window.HTMLFormElement.prototype.requestSubmit = function () {
    submitted = true
  }

  const initialized = waitForInitialization(dom)
  dom.window.eval(contentScript)
  await initialized

  assert.equal(dom.window.document.querySelector('#uscno').value, '15952909')
  assert.equal(submitted, true)
  assert.equal(dom.window.location.hash, '')
  assert.match(
    dom.window.sessionStorage.getItem('tenant-manager-tgnpdcl-lookup'),
    /"state":"submitted"/,
  )
})

test('does not submit when the provider displays a CAPTCHA or the USC is invalid', async (context) => {
  for (const [hash, challenge] of [
    ['#tenant-manager-usc=15952909', '<div id="captcha">CAPTCHA</div>'],
    ['#tenant-manager-usc=123', ''],
  ]) {
    const dom = new JSDOM(
      `<form id="frm"><input id="uscno" name="uscno"><input id="getBill" type="submit" value="Get Bill"></form>${challenge}`,
      {
        url: `https://tgnpdcl.com/Menu/KnowYourBillLT${hash}`,
        runScripts: 'outside-only',
      },
    )
    context.after(() => dom.window.close())
    openShadowRoots(dom)
    let submitted = false
    dom.window.HTMLFormElement.prototype.requestSubmit = function () {
      submitted = true
    }
    const initialized = waitForInitialization(dom)
    dom.window.eval(contentScript)
    await initialized
    await new Promise((resolve) => globalThis.setTimeout(resolve, 350))

    assert.equal(submitted, false)
    const panelText =
      dom.window.document.querySelector('[data-tenant-manager-helper]')?.shadowRoot?.textContent ?? ''
    assert.match(panelText, /Provider verification required|USC not filled/)
  }
})

test('offers clearly labeled bill details for review in the app', async (context) => {
  const dom = new JSDOM(
    `<table>
      <tr><td>Bill Amount</td><td>₹ 1,234.50</td></tr>
      <tr><td>Due Date</td><td>19-10-2026</td></tr>
      <tr><td>Billing Month</td><td>October 2026</td></tr>
      <tr><td>Bill No.</td><td>REF-40</td></tr>
    </table>`,
    {
      url: 'https://tgnpdcl.com/Consumer/DuplicateBillValidate',
      runScripts: 'outside-only',
    },
  )
  context.after(() => dom.window.close())
  openShadowRoots(dom)
  dom.window.sessionStorage.setItem(
    'tenant-manager-tgnpdcl-lookup',
    JSON.stringify({ uscNumber: '15952909', state: 'submitted' }),
  )
  const originalSetTimeout = dom.window.setTimeout.bind(dom.window)
  dom.window.setTimeout = (handler, _timeout, ...args) => originalSetTimeout(handler, 0, ...args)

  const initialized = waitForInitialization(dom, 50)
  dom.window.eval(contentScript)
  await initialized
  await new Promise((resolve) => globalThis.setTimeout(resolve, 25))

  const shadow =
    dom.window.document.querySelector('[data-tenant-manager-helper]')?.shadowRoot
  assert.match(shadow?.textContent ?? '', /TGNPDCL bill details found/)
  const reviewLink = shadow?.querySelector('a')
  assert.ok(reviewLink)
  assert.equal(reviewLink.textContent, 'Review in Tenant Manager')
  const encodedDraft = new URLSearchParams(new URL(reviewLink.href).hash.slice(1)).get('tenant-manager-bill')
  assert.deepEqual(JSON.parse(encodedDraft), {
    version: 1,
    uscNumber: '15952909',
    amount: '1234.50',
    billingMonth: '2026-10',
    billGeneratedAt: null,
    dueDate: '2026-10-19',
    billReference: 'REF-40',
  })
})
