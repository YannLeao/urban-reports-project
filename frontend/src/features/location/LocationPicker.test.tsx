import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import { LocationPicker } from './LocationPicker'
import type { GeographicPoint } from './point'

vi.mock('./LocationMap', () => ({ LocationMap: ({ onSelect, disabled }: { onSelect: (point: GeographicPoint) => void; disabled: boolean }) =>
  <button type="button" disabled={disabled} onClick={() => onSelect({ latitude: -23.55052, longitude: -46.633308 })}>Escolher no mapa</button> }))
const changed = vi.fn()
function Harness({ initial = null }: { initial?: GeographicPoint | null }) {
  const [point, setPoint] = useState(initial)
  return <LocationPicker value={point} onChange={value => { changed(value); setPoint(value) }} />
}
const gps = vi.fn<Geolocation['getCurrentPosition']>()
beforeEach(() => {
  changed.mockReset(); gps.mockReset()
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: gps } })
})
test('manual map selection explicitly confirms and allows another adjustment', () => {
  render(<Harness />)
  expect(screen.getByText('Nenhum local confirmado.')).toBeVisible()
  fireEvent.click(screen.getByText('Escolher no mapa'))
  expect(changed).toHaveBeenLastCalledWith({ latitude: -23.55052, longitude: -46.633308 })
  expect(screen.getByText(/Local confirmado:/)).toBeVisible()
  fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '0' } })
  expect(changed).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByText('Confirmar coordenadas'))
  expect(changed).toHaveBeenLastCalledWith({ latitude: 0, longitude: 0 })
})
test('loads a persisted point and leaves legacy without a default marker', () => {
  const view = render(<Harness initial={{ latitude: 0, longitude: 12.123456789 }} />)
  expect(screen.getByLabelText('Latitude')).toHaveValue('0')
  expect(screen.getByLabelText('Longitude')).toHaveValue('12.123456789')
  view.unmount()
  render(<Harness />)
  expect(screen.getByLabelText('Latitude')).toHaveValue('')
  expect(changed).not.toHaveBeenCalled()
})
test.each([['', ''], ['91', '0'], ['0', '-181'], ['NaN', '0'], ['Infinity', '0'], ['0', ''], ['1,5', '2']])('rejects textual pair %s / %s without replacing confirmed point', (latitude, longitude) => {
  render(<Harness initial={{ latitude: 1, longitude: 2 }} />)
  fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: latitude } })
  fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: longitude } })
  fireEvent.click(screen.getByText('Confirmar coordenadas'))
  expect(changed).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Latitude')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('Latitude')).toHaveFocus()
  expect(screen.getByText(/Local confirmado: latitude 1.000000/)).toBeVisible()
})
test('GPS is opt-in, reports estimated accuracy and requires explicit confirmation', () => {
  render(<Harness />)
  expect(gps).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Usar minha localização'))
  expect(gps).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  act(() => gps.mock.calls[0][0]({ coords: { latitude: 0, longitude: 0, accuracy: 21.3 } } as GeolocationPosition))
  expect(screen.getByText(/precisão estimada de 22 m/)).toBeVisible()
  expect(screen.getByText('Nenhum local confirmado.')).toBeVisible()
  expect(changed).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Confirmar coordenadas'))
  expect(changed).toHaveBeenCalledWith({ latitude: 0, longitude: 0 })
})
test.each([[1, 'Permissão de localização negada'], [2, 'Posição indisponível'], [3, 'Tempo de localização esgotado']])('GPS failure %s preserves prior confirmed point and manual selection', (code, message) => {
  render(<Harness initial={{ latitude: 3, longitude: 4 }} />)
  fireEvent.click(screen.getByText('Usar minha localização'))
  act(() => gps.mock.calls[0][1]?.({ code } as GeolocationPositionError))
  expect(screen.getByText(new RegExp(message))).toBeVisible()
  expect(screen.getByText(/Local confirmado: latitude 3.000000/)).toBeVisible()
  fireEvent.click(screen.getByText('Escolher no mapa'))
  expect(changed).toHaveBeenCalledTimes(1)
})
test('unsupported or insecure GPS leaves manual confirmation available', () => {
  vi.stubGlobal('isSecureContext', false)
  render(<Harness />)
  fireEvent.click(screen.getByText('Usar minha localização'))
  expect(screen.getByText(/Localização indisponível neste navegador/)).toBeVisible()
  expect(gps).not.toHaveBeenCalled()
  expect(screen.getByText('Confirmar coordenadas')).toBeEnabled()
})
test('late GPS response after disabling is ignored and controls unlock for retry', () => {
  const view = render(<LocationPicker value={null} onChange={changed} />)
  fireEvent.click(screen.getByText('Usar minha localização'))
  view.rerender(<LocationPicker value={null} onChange={changed} disabled />)
  act(() => gps.mock.calls[0][0]({ coords: { latitude: 10, longitude: 20, accuracy: 30 } } as GeolocationPosition))
  expect(screen.getByLabelText('Latitude')).toHaveValue('')
  view.rerender(<LocationPicker value={null} onChange={changed} />)
  expect(screen.getByText('Usar minha localização')).toBeEnabled()
})

test('manual confirmation supersedes an outstanding GPS suggestion', () => {
  render(<Harness />)
  fireEvent.click(screen.getByText('Usar minha localização'))
  fireEvent.click(screen.getByText('Escolher no mapa'))
  act(() => gps.mock.calls[0][0]({ coords: { latitude: 10, longitude: 20, accuracy: 30 } } as GeolocationPosition))
  expect(screen.getByLabelText('Latitude')).toHaveValue('-23.55052')
  expect(screen.getByText('Usar minha localização')).toBeEnabled()
  expect(changed).toHaveBeenCalledTimes(1)
})
