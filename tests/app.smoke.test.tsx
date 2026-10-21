import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from '../src/App'

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
})
