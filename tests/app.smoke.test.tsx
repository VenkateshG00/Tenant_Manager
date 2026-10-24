import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DemoStore } from '../src/data/demo/demoStore'
import { currentMonthKey } from '../src/lib/dates'

vi.mock('../src/app/env', () => ({
  isSupabaseConfigured: false,
  isDemoMode: true,
  SUPABASE_ANON_KEY: '',
  SUPABASE_URL: '',
}))

import App from '../src/App'

afterEach(() => vi.restoreAllMocks())

/**
 * End-to-end-ish smoke test in demo mode: the router, providers, workspace
 * loading and the dashboard all have to work together for this to pass.
 */
describe('application shell', () => {
  it('renders the dashboard with demo data', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument()
    })

    // Demo banner must be visible so sample data is never mistaken for real data.
    expect(screen.getByText(/demo mode/i)).toBeInTheDocument()

    // Sample tenants from the demo store appear in the outstanding list.
    await waitFor(() => {
      expect(screen.getAllByText(/sample tenant/i).length).toBeGreaterThan(0)
    })
  })

  it('renders navigation to every main page', async () => {
    render(<App />)
    for (const label of [
      'Tenants',
      'Electricity Meters',
      'Electricity Bills',
      'Monthly Statements',
      'Payments',
      'Reminder History',
      'Settings',
    ]) {
      const links = await screen.findAllByRole('link', { name: label })
      expect(links.length).toBeGreaterThan(0)
    }
  })

  it('refreshes workspace records when the app becomes visible again', async () => {
    const listBills = vi.spyOn(DemoStore.prototype, 'listBills')
    render(<App />)
    await screen.findByRole('heading', { name: /dashboard/i })
    await waitFor(() => expect(listBills).toHaveBeenCalled())
    const callsBeforeResume = listBills.mock.calls.length

    fireEvent(document, new Event('visibilitychange'))

    await waitFor(() => expect(listBills.mock.calls.length).toBeGreaterThan(callsBeforeResume))
  })

  it('ensures rent charges when the app opens, without visiting statements', async () => {
    window.localStorage.removeItem('tenant-app:billing-month')
    const currentMonth = currentMonthKey()
    const listCharges = DemoStore.prototype.listCharges
    let hideRentOnce = true
    vi.spyOn(DemoStore.prototype, 'listCharges').mockImplementation(async function (this: DemoStore) {
      const charges = await listCharges.call(this)
      if (!hideRentOnce) return charges
      hideRentOnce = false
      return charges.filter(
        (charge) => !(charge.chargeType === 'rent' && charge.period === currentMonth),
      )
    })
    const ensureRentCharges = vi.spyOn(DemoStore.prototype, 'ensureRentCharges')

    render(<App />)
    await screen.findByRole('heading', { name: /dashboard/i })

    await waitFor(() => expect(ensureRentCharges).toHaveBeenCalledWith(currentMonth))
  })

  it('shows a printable/shareable receipt after recording a payment', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('link', { name: 'Payments' }))
    fireEvent.click(await screen.findByRole('button', { name: '+ Record payment' }))
    fireEvent.change(screen.getByLabelText(/Amount \(₹\)/), { target: { value: '10.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save payment' }))

    expect(await screen.findByRole('dialog', { name: 'Payment receipt' })).toBeInTheDocument()
    expect(screen.getByText('Amount received:')).toBeInTheDocument()
    expect(screen.getByText('Print / Save PDF')).toBeInTheDocument()
    expect(screen.getByText('Share receipt')).toBeInTheDocument()
  })

  it('opens the official bill page for the selected meter and preselects it in the bill form', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: 'Electricity Bills' }))
    expect(document.querySelector('.responsive-table tbody td')).toHaveAttribute('data-label', 'Meter')
    fireEvent.click((await screen.findAllByRole('button', { name: '+ Add bill' }))[0]!)

    fireEvent.change(screen.getByLabelText(/Meter/), { target: { value: 'm-demo-2' } })
    expect(screen.getByLabelText('Selected meter USC')).toHaveValue('DEMO-USC-000002')
    fireEvent.click(screen.getByRole('button', { name: 'Copy USC' }))
    expect(
      await screen.findByText(/USC copied|clipboard access|could not access/i, { selector: 'p' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open official bill page' }))

    expect(openSpy).toHaveBeenCalledWith(
      'https://tgnpdcl.com/Menu/KnowYourBillLT#tenant-manager-usc=DEMO-USC-000002',
      '_blank',
      'noopener,noreferrer',
    )
    expect(await screen.findByRole('heading', { name: 'Record electricity bill' })).toBeInTheDocument()
    expect(screen.getByText('DEMO-USC-000002')).toBeInTheDocument()
    expect(screen.getByLabelText(/Meter/)).toHaveValue('m-demo-2')
  })
})
