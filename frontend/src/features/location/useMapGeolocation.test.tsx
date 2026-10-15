import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { useMapGeolocation } from './useMapGeolocation'

const gps = vi.fn<Geolocation['getCurrentPosition']>()
const located = vi.fn()
beforeEach(() => {
  gps.mockReset(); located.mockReset()
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: gps } })
})
test('exploration only requests GPS explicitly, returns a valid zero-axis position and prevents reentry', () => {
  const { result } = renderHook(() => useMapGeolocation(located))
  expect(gps).not.toHaveBeenCalled()
  act(() => { result.current.locate(); result.current.locate() })
  expect(gps).toHaveBeenCalledTimes(1)
  expect(result.current.locating).toBe(true)
  act(() => gps.mock.calls[0][0]({ coords: { latitude: 0, longitude: 12 } } as GeolocationPosition))
  expect(located).toHaveBeenCalledWith({ latitude: 0, longitude: 12 })
  expect(result.current.locating).toBe(false)
  expect(result.current.message).toContain('pode ser aproximada')
})
test.each([[1, 'Permissão'], [2, 'Não encontramos'], [3, 'demorou']])('GPS error %s changes no viewport and permits retry', (code, message) => {
  const { result } = renderHook(() => useMapGeolocation(located))
  act(() => result.current.locate())
  act(() => gps.mock.calls[0][1]?.({ code } as GeolocationPositionError))
  expect(located).not.toHaveBeenCalled()
  expect(result.current.message).toContain(message)
  act(() => result.current.locate())
  expect(gps).toHaveBeenCalledTimes(2)
})
test.each([NaN, Infinity, 91])('invalid GPS coordinate %s is not used for exploration', latitude => {
  const { result } = renderHook(() => useMapGeolocation(located))
  act(() => result.current.locate())
  act(() => gps.mock.calls[0][0]({ coords: { latitude, longitude: 0 } } as GeolocationPosition))
  expect(located).not.toHaveBeenCalled()
  expect(result.current.message).toContain('Não encontramos')
})
test('unsupported/insecure geolocation does not request permissions', () => {
  vi.stubGlobal('isSecureContext', false)
  const { result } = renderHook(() => useMapGeolocation(located))
  act(() => result.current.locate())
  expect(gps).not.toHaveBeenCalled()
  expect(result.current.message).toContain('não está disponível')
})
test('late GPS response after leaving the map cannot move a later map', () => {
  const view = renderHook(() => useMapGeolocation(located))
  act(() => view.result.current.locate())
  view.unmount()
  act(() => gps.mock.calls[0][0]({ coords: { latitude: 12, longitude: 34 } } as GeolocationPosition))
  expect(located).not.toHaveBeenCalled()
})
