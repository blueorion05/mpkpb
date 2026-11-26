import { useState, type ComponentPropsWithoutRef } from 'react'
import { isMoneyInputDraft, moneyPasteText } from '../domain/money'

interface MoneyInputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'inputMode' | 'value' | 'defaultValue' | 'onChange' | 'onPaste'> {
  type?: 'text' | 'password'
  value?: string
  defaultValue?: string
  allowNegative?: boolean
  onValueChange?: (value: string) => void
}

export default function MoneyInput({
  type = 'text', value, defaultValue = '', allowNegative = false, onValueChange, ...props
}: MoneyInputProps) {
  const [localValue, setLocalValue] = useState(defaultValue)
  const current = value ?? localValue

  function update(next: string) {
    if (!isMoneyInputDraft(next, allowNegative)) return
    if (value === undefined) setLocalValue(next)
    onValueChange?.(next)
  }

  return <input {...props} type={type} inputMode="decimal" value={current}
    onChange={(event) => update(event.target.value)}
    onPaste={(event) => {
      event.preventDefault()
      if (props.readOnly || props.disabled) return
      const field = event.currentTarget
      const text = moneyPasteText(event.clipboardData.getData('text/plain'))
      if (!text) return
      const start = field.selectionStart ?? current.length
      const end = field.selectionEnd ?? start
      const next = current.slice(0, start) + text + current.slice(end)
      if (!isMoneyInputDraft(next, allowNegative)) return
      update(next)
      requestAnimationFrame(() => {
        if (document.activeElement === field) field.setSelectionRange(start + text.length, start + text.length)
      })
    }}
  />
}
