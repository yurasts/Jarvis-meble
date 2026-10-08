import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppErrorBoundary from './AppErrorBoundary'

function BrokenView() {
  throw new Error('test failure')
}

describe('AppErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children while the application is healthy', () => {
    render(
      <AppErrorBoundary>
        <div>Healthy view</div>
      </AppErrorBoundary>,
    )

    expect(screen.getByText('Healthy view')).toBeInTheDocument()
  })

  it('shows a recovery screen after an uncaught render error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AppErrorBoundary>
        <BrokenView />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /co\u015b posz\u0142o nie tak/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /od\u015bwie\u017c stron\u0119/i })).toBeInTheDocument()
  })
})
