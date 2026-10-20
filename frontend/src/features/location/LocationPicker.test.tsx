import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import { LocationPicker } from './LocationPicker'
import type { GeographicPoint } from './point'

vi.mock('./LocationMap', () => ({ LocationMap: ({ onSelect, disabled, point, suggestion }: { onSelect: (point: GeographicPoint) => void; disabled: boolean; point: GeographicPoint | null; suggestion: GeographicPoint | null }) =>
  <><output aria-label="Ponto confirmado no mapa">{JSON.stringify(point)}</output><output aria-label="Sugestão no mapa">{JSON.stringify(suggestion)}</output><button type="button" disabled={disabled} onClick={() => onSelect({ latitude: -23.55052, longitude: -46.633308 })}>Escolher no mapa</button></> }))
const changed = vi.fn()
function Harness({ initial = null, active = true, automatic = false }: { initial?: GeographicPoint | null; active?: boolean; automatic?: boolean }) {
  const [point, setPoint] = useState(initial)
  return <LocationPicker active={active} autoLocate={automatic} value={point} onChange={value => { changed(value); setPoint(value) }} />
}
const gps = vi.fn<Geolocation['getCurrentPosition']>()
const position = { coords: { latitude: 0, longitude: 0, accuracy: 21.3 } } as GeolocationPosition
beforeEach(() => {
  changed.mockReset(); gps.mockReset()
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: gps } })
})
test('map explicitly confirms a point; no coordinate entry or raw coordinates', () => {
  render(<Harness />)
  expect(screen.queryByLabelText('Latitude')).not.toBeInTheDocument()
  expect(screen.queryByText('Informar coordenadas')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Escolher no mapa'))
  expect(changed).toHaveBeenLastCalledWith({ latitude: -23.55052, longitude: -46.633308 })
  expect(screen.getByText('Local confirmado.')).toBeVisible()
})
test('strict automatic first entry suggests once; leaving and returning never requests again', async () => {
  const view = render(<StrictMode><Harness automatic /></StrictMode>)
  await waitFor(() => expect(gps).toHaveBeenCalledTimes(1))
  act(() => gps.mock.calls[0][0](position))
  expect(changed).not.toHaveBeenCalled()
  expect(screen.getByText(/precisão estimada de 22 m/)).toBeVisible()
  view.rerender(<StrictMode><Harness automatic active={false} /></StrictMode>)
  view.rerender(<StrictMode><Harness automatic /></StrictMode>)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  expect(gps).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar este local' }))
  expect(changed).toHaveBeenCalledWith({ latitude: 0, longitude: 0 })
})
test('inactive step and existing point never request automatic GPS', async () => {
  const view = render(<Harness automatic active={false} />)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  expect(gps).not.toHaveBeenCalled()
  view.unmount()
  render(<Harness automatic initial={{ latitude: 0, longitude: 0 }} />)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  expect(gps).not.toHaveBeenCalled()
})
test.each([[1, 'Permissão de localização negada'], [2, 'Posição indisponível'], [3, 'Tempo de localização esgotado']])('GPS error %s preserves point and permits manual retry', (code, message) => {
  render(<Harness initial={{ latitude: 3, longitude: 4 }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Usar minha localização' }))
  act(() => gps.mock.calls[0][1]?.({ code } as GeolocationPositionError))
  expect(screen.getByText(new RegExp(message))).toBeVisible()
  expect(screen.getByText('Local confirmado.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Usar minha localização' }))
  expect(gps).toHaveBeenCalledTimes(2)
})
test('insecure GPS offers map, without fabricated point or numerical fallback', () => {
  vi.stubGlobal('isSecureContext', false)
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Usar minha localização' }))
  expect(screen.getByText(/Localização indisponível neste navegador/)).toBeVisible()
  expect(gps).not.toHaveBeenCalled()
  expect(changed).not.toHaveBeenCalled()
  expect(screen.getByText('Escolher no mapa')).toBeEnabled()
})
test('manual point supersedes pending GPS without recentering', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Usar minha localização' }))
  fireEvent.click(screen.getByText('Escolher no mapa'))
  act(() => gps.mock.calls[0][0](position))
  expect(screen.getByLabelText('Sugestão no mapa')).toHaveTextContent('null')
  expect(changed).toHaveBeenCalledTimes(1)
})
test('late response after leaving or disabling is ignored, but voluntary retry works', () => {
  const view = render(<LocationPicker active value={null} onChange={changed} />)
  fireEvent.click(screen.getByRole('button', { name: 'Usar minha localização' }))
  view.rerender(<LocationPicker active={false} value={null} onChange={changed} />)
  act(() => gps.mock.calls[0][0](position))
  view.rerender(<LocationPicker active value={null} onChange={changed} />)
  expect(screen.getByLabelText('Sugestão no mapa')).toHaveTextContent('null')
  fireEvent.click(screen.getByRole('button', { name: 'Usar minha localização' }))
  expect(gps).toHaveBeenCalledTimes(2)
})
test('suggestion can be confirmed without tiles and discarded without losing prior point', () => {
  render(<Harness initial={{ latitude: 3, longitude: 4 }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Usar minha localização' }))
  act(() => gps.mock.calls[0][0](position))
  fireEvent.click(screen.getByRole('button', { name: 'Descartar sugestão' }))
  expect(screen.getByText('Local confirmado.')).toBeVisible()
  expect(changed).not.toHaveBeenCalled()
})

test('missing geolocation API reports unavailability and leaves map usable',async()=>{
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:undefined})
  render(<Harness automatic />)
  await screen.findByText(/Localização indisponível neste navegador/)
  expect(screen.getByText('Escolher no mapa')).toBeEnabled()
  expect(changed).not.toHaveBeenCalled()
})
