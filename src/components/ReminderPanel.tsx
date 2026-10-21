import { useState } from 'react'
import { useStore } from '../app/AppState'
import { useToast } from '../app/Toast'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { InlineNotice } from './ui/States'
import { buildReminderMessage, buildShareLink, buildWaMeLink, copyToClipboard, openWhatsApp } from '../lib/whatsapp'
import { normalizeIndianPhone } from '../lib/phone'
import type { TenantStatement } from '../lib/ledger'
import type { Tenant } from '../data/types'

/**
 * WhatsApp actions for one tenant statement.
 * Nothing is sent automatically — the app only opens WhatsApp with the text
 * prefilled, or copies it, and records what the administrator did.
 */
export function ReminderPanel({
  tenant,
  statement,
  onLogged,
}: {
  tenant: Tenant
  statement: TenantStatement
  onLogged: () => void
}) {
  const store = useStore()
  const toast = useToast()
  const [preview, setPreview] = useState(false)

  const phone = tenant.phone ? normalizeIndianPhone(tenant.phone) : null
  const message = buildReminderMessage({
    tenantName: tenant.name,
    period: statement.period,
    rentPaise: statement.rentPaise,
    electricityPaise: statement.electricityPaise,
    previousDuesPaise: statement.previousOutstandingPaise,
    otherPaise: statement.otherPaise,
    creditPaise: statement.creditPaise,
    paymentsReceivedPaise: statement.paymentsReceivedPaise,
    outstandingPaise: statement.outstandingPaise,
  })

  const log = async (status: 'prepared' | 'sent') => {
    try {
      await store.logReminder({
        tenantId: tenant.id,
        period: statement.period,
        status,
        message,
        phoneDigits: phone?.ok ? phone.e164Digits : null,
      })
      onLogged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const share = async () => {
    await log('prepared')
    openWhatsApp(buildShareLink(message))
    toast.push(
      'WhatsApp opened with the message prefilled. Choose the recipient and press Send inside WhatsApp.',
      'info',
    )
  }

  const sendToSaved = async () => {
    if (!phone?.ok) return
    const link = buildWaMeLink(phone.e164Digits, message)
    if (!link) return
    await log('prepared')
    openWhatsApp(link)
    toast.push(
      `WhatsApp opened for ${phone.display}. Review the text and press Send inside WhatsApp.`,
      'info',
    )
  }

  const copy = async () => {
    const ok = await copyToClipboard(message)
    if (ok) {
      await log('prepared')
      toast.success('Message copied — paste it into WhatsApp yourself')
    } else {
      toast.error('Could not copy. Select the preview text and copy manually.')
      setPreview(true)
    }
  }

  const markSent = async () => {
    await log('sent')
    toast.success('Marked as sent by you — the app cannot verify delivery or reading')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={() => void share()}>
          Send via WhatsApp — Choose Contact
        </Button>
        {phone?.ok ? (
          <Button variant="secondary" size="sm" onClick={() => void sendToSaved()}>
            Send to saved number ({phone.display})
          </Button>
        ) : (
          <Badge tone="slate" title="Add a phone number on the Tenants page">
            No saved number
          </Badge>
        )}
        <Button variant="secondary" size="sm" onClick={() => void copy()}>
          Copy message
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
          {preview ? 'Hide preview' : 'Preview'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void markSent()}>
          Mark as sent
        </Button>
      </div>

      {phone && !phone.ok && (
        <InlineNotice tone="warning">
          Saved number “{tenant.phone}” is not a valid Indian mobile number, so click-to-chat is
          disabled. Fix it on the Tenants page.
        </InlineNotice>
      )}

      {preview && (
        <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 ring-1 ring-slate-200">
          {message}
        </pre>
      )}
    </div>
  )
}
