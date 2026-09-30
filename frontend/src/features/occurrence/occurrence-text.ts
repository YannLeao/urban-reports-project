// Same external ASCII whitespace as RegistrationValidation.trim in Java.
export function cleanOccurrenceText(value: string): string {
  // eslint-disable-next-line no-control-regex -- Shared ASCII trim includes tab and newline.
  return value.replace(/^[\x09-\x0D\x20]+|[\x09-\x0D\x20]+$/g, '')
}

export function validOccurrenceText(value: string, min: number, max: number): boolean {
  const points = Array.from(cleanOccurrenceText(value))
  return points.length >= min && points.length <= max && points.every(point => {
    const code = point.codePointAt(0)!
    return code !== 0 && !(code >= 0xD800 && code <= 0xDFFF)
  })
}
