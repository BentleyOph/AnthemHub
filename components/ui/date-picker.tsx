"use client"

import * as React from "react"
import { format } from "date-fns"
import type { DateRange, Matcher } from "react-day-picker"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"

type BasePickerProps = {
  id?: string
  placeholder?: string
  className?: string
  buttonClassName?: string
  popoverClassName?: string
  align?: "start" | "center" | "end"
  disabled?: boolean
  allowClear?: boolean
}

type CalendarDisabled = Matcher | Matcher[]

type CalendarOverrides = {
  minDate?: Date
  maxDate?: Date
  disabledDates?: CalendarDisabled
}

type SingleDatePickerProps = BasePickerProps &
  CalendarOverrides & {
    value: Date | null
    onChange: (value: Date | null) => void
    formatDate?: (value: Date) => string
  }

type DateRangePickerProps = BasePickerProps &
  CalendarOverrides & {
    value: DateRange | undefined
    onChange: (value: DateRange | undefined) => void
    numberOfMonths?: number
    formatRange?: (value: DateRange | undefined) => string
  }

export function SingleDatePicker({
  id,
  value,
  onChange,
  placeholder = "Select date",
  className,
  buttonClassName,
  popoverClassName,
  align = "start",
  disabled,
  allowClear = true,
  minDate,
  maxDate,
  disabledDates,
  formatDate = (date) => format(date, "PP"),
}: SingleDatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  useDismissOnInteraction(open, () => setOpen(false), containerRef)

  const disabledMatchers = React.useMemo(
    () => buildDisabledMatchers(disabledDates, minDate, maxDate),
    [disabledDates, minDate, maxDate]
  )

  const handleSelect = (nextDate?: Date) => {
    if (nextDate) {
      onChange(nextDate)
      setOpen(false)
      return
    }
    onChange(null)
  }

  const handleClear = () => {
    onChange(null)
    setOpen(false)
  }

  const displayValue = value ? formatDate(value) : placeholder

  return (
    <div ref={containerRef} className={cn("relative inline-block w-full", className)}>
      <Button
        id={id}
        type="button"
        variant="outline"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-empty={!value}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={cn(
          "w-full justify-between text-left font-normal",
          !value && "text-muted-foreground",
          buttonClassName
        )}
      >
        <span>{displayValue}</span>
        <CalendarIcon className="size-4 text-muted-foreground" />
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-modal="false"
          className={cn(
            "absolute z-50 mt-2 rounded-md border bg-popover p-3 shadow-lg",
            align === "center"
              ? "left-1/2 -translate-x-1/2"
              : align === "end"
                ? "right-0"
                : "left-0",
            popoverClassName
          )}
        >
          <Calendar
            mode="single"
            selected={value ?? undefined}
            onSelect={handleSelect}
            initialFocus
            disabled={disabledMatchers}
          />
          {allowClear && value ? (
            <div className="mt-2 flex justify-end">
              <Button type="button" size="sm" variant="ghost" onClick={handleClear}>
                Clear
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function DateRangePicker({
  id,
  value,
  onChange,
  placeholder = "Select date range",
  className,
  buttonClassName,
  popoverClassName,
  align = "start",
  disabled,
  allowClear = true,
  minDate,
  maxDate,
  disabledDates,
  numberOfMonths = 2,
  formatRange = defaultFormatRange,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  useDismissOnInteraction(open, () => setOpen(false), containerRef)

  const disabledMatchers = React.useMemo(
    () => buildDisabledMatchers(disabledDates, minDate, maxDate),
    [disabledDates, minDate, maxDate]
  )

  const handleSelect = React.useCallback(
    (nextValue?: DateRange, selectedDay?: Date) => {
      if (value?.from && value?.to && selectedDay) {
        const updated = adjustExistingRange(value, selectedDay)
        onChange(updated)
        if (updated?.from && updated?.to) {
          setOpen(false)
        }
        return
      }

      onChange(nextValue)
      if (nextValue?.from && nextValue?.to) {
        setOpen(false)
      }
    },
    [onChange, value]
  )

  const handleClear = () => {
    onChange(undefined)
    setOpen(false)
  }

  const displayValue = formatRange(value)
  const hasValue = Boolean(value?.from || value?.to)

  return (
    <div ref={containerRef} className={cn("relative inline-block w-full", className)}>
      <Button
        id={id}
        type="button"
        variant="outline"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-empty={!hasValue}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={cn(
          "w-full justify-between text-left font-normal",
          !hasValue && "text-muted-foreground",
          buttonClassName
        )}
      >
        <span>{displayValue || placeholder}</span>
        <CalendarIcon className="size-4 text-muted-foreground" />
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-modal="false"
          className={cn(
            "absolute z-50 mt-2 rounded-md border bg-popover p-3 shadow-lg",
            align === "center"
              ? "left-1/2 -translate-x-1/2"
              : align === "end"
                ? "right-0"
                : "left-0",
            popoverClassName
          )}
        >
          <Calendar
            mode="range"
            numberOfMonths={numberOfMonths}
            selected={value}
            onSelect={handleSelect}
            initialFocus
            disabled={disabledMatchers}
          />
          {allowClear && hasValue ? (
            <div className="mt-2 flex justify-end">
              <Button type="button" size="sm" variant="ghost" onClick={handleClear}>
                Clear
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function buildDisabledMatchers(
  disabled?: CalendarDisabled,
  minDate?: Date,
  maxDate?: Date
): CalendarDisabled | undefined {
  const matchers: Matcher[] = []
  if (minDate) {
    matchers.push({ before: minDate })
  }
  if (maxDate) {
    matchers.push({ after: maxDate })
  }
  if (Array.isArray(disabled)) {
    matchers.push(...disabled)
  } else if (disabled) {
    matchers.push(disabled)
  }
  if (matchers.length === 0) {
    return undefined
  }
  return matchers
}

function useDismissOnInteraction<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  containerRef: React.RefObject<T | null>
) {
  React.useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onClose, containerRef])
}

function defaultFormatRange(value: DateRange | undefined): string {
  if (!value?.from && !value?.to) {
    return ""
  }
  if (value?.from && !value?.to) {
    return `${format(value.from, "PP")} –`
  }
  if (!value?.from && value?.to) {
    return `– ${format(value.to, "PP")}`
  }
  if (!value?.from || !value?.to) {
    return ""
  }
  return `${format(value.from, "PP")} – ${format(value.to, "PP")}`
}

function adjustExistingRange(current: DateRange, selectedDay: Date): DateRange {
  if (!current.from || !current.to) {
    return current
  }

  const selectedTime = selectedDay.getTime()
  const startTime = current.from.getTime()
  const endTime = current.to.getTime()

  if (selectedTime < startTime) {
    return { from: selectedDay, to: current.to }
  }

  if (selectedTime > endTime) {
    return { from: current.from, to: selectedDay }
  }

  const distanceFromStart = Math.abs(selectedTime - startTime)
  const distanceFromEnd = Math.abs(selectedTime - endTime)

  if (distanceFromStart <= distanceFromEnd) {
    return { from: selectedDay, to: current.to }
  }

  return { from: current.from, to: selectedDay }
}
