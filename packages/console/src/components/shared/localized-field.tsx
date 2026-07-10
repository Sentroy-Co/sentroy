"use client"

import { useState } from "react"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { routing } from "@workspace/auth/i18n/routing"

export type LocalizedValue = Record<string, string>

type LocalizedRenderProps = {
  lang: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}

type LocalizedFieldControl = {
  multiline?: boolean
  rows?: number
  placeholder?: string
  render?: (props: LocalizedRenderProps) => React.ReactNode
}

export type LocalizedFieldItem<TKey extends string = string> =
  LocalizedFieldControl & {
    name: TKey
    label: string
  }

type SingleLocalizedFieldProps = LocalizedFieldControl & {
  label?: string
  value: LocalizedValue
  onChange: (v: LocalizedValue) => void
  fields?: never
  disabled?: boolean
  locales?: readonly string[] | string[]
  defaultLocale?: string
  onActiveChange?: (lang: string) => void
}

type MultiLocalizedFieldProps<TKey extends string = string> = {
  label?: string
  value: Record<TKey, LocalizedValue>
  onChange: (v: Record<TKey, LocalizedValue>) => void
  fields: LocalizedFieldItem<TKey>[]
  disabled?: boolean
  locales?: readonly string[] | string[]
  defaultLocale?: string
  onActiveChange?: (lang: string) => void
}

function hasFields<TKey extends string>(
  props: SingleLocalizedFieldProps | MultiLocalizedFieldProps<TKey>
): props is MultiLocalizedFieldProps<TKey> {
  return Array.isArray((props as MultiLocalizedFieldProps<TKey>).fields)
}

/**
 * Tab-based multi-language input. Tabs are derived from `routing.locales` by
 * default. Each tab shows a green dot when the language has content.
 *
 * For simple text: pass `multiline` (Textarea) or omit (Input).
 * For custom editors (rich text, markdown, etc.), pass a `render` prop that
 * receives `{ lang, value, onChange, disabled }` and renders your control.
 * To edit several localized values under one language tab, pass `fields`.
 */
export function LocalizedField<TKey extends string = string>(
  props: SingleLocalizedFieldProps | MultiLocalizedFieldProps<TKey>
) {
  const {
    label,
    disabled,
    locales = routing.locales,
    defaultLocale,
    onActiveChange,
  } = props
  const list = [...locales]
  const [active, setActive] = useState<string>(
    defaultLocale && list.includes(defaultLocale) ? defaultLocale : list[0]
  )

  function handleTabChange(lang: string) {
    setActive(lang)
    onActiveChange?.(lang)
  }

  function setLang(lang: string, next: string) {
    if (hasFields(props)) return
    props.onChange({ ...props.value, [lang]: next })
  }

  function setFieldLang(name: TKey, lang: string, next: string) {
    if (!hasFields(props)) return
    const current = props.value[name] || {}
    const nextValue = {
      ...props.value,
      [name]: { ...current, [lang]: next },
    } as Record<TKey, LocalizedValue>
    props.onChange(nextValue)
  }

  function hasContent(lang: string) {
    if (!hasFields(props)) return !!props.value[lang]?.trim()
    return props.fields.some(
      (field) => !!props.value[field.name]?.[lang]?.trim()
    )
  }

  function renderControl(
    control: LocalizedFieldControl,
    lang: string,
    controlValue: string,
    handleChange: (next: string) => void
  ) {
    const rows = control.rows ?? 3
    if (control.render) {
      return control.render({
        lang,
        value: controlValue,
        onChange: handleChange,
        disabled,
      })
    }

    if (control.multiline) {
      return (
        <Textarea
          value={controlValue}
          onChange={(e) =>
            handleChange((e.target as HTMLTextAreaElement).value)
          }
          disabled={disabled}
          rows={rows}
          placeholder={control.placeholder}
        />
      )
    }

    return (
      <Input
        value={controlValue}
        onChange={(e) => handleChange((e.target as HTMLInputElement).value)}
        disabled={disabled}
        placeholder={control.placeholder}
      />
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label>{label}</Label>}
      <Tabs value={active} onValueChange={handleTabChange}>
        <TabsList className="w-fit">
          {list.map((lng) => {
            const filled = hasContent(lng)
            return (
              <TabsTrigger key={lng} value={lng} className="gap-1.5">
                <span className="uppercase">{lng}</span>
                <span
                  className={
                    filled
                      ? "size-1.5 rounded-full bg-emerald-500"
                      : "size-1.5 rounded-full bg-muted-foreground/40"
                  }
                />
              </TabsTrigger>
            )
          })}
        </TabsList>
        {list.map((lng) => (
          <TabsContent key={lng} value={lng} className="mt-2">
            {hasFields(props) ? (
              <div className="flex flex-col gap-3">
                {props.fields.map((field) => (
                  <div key={field.name} className="flex flex-col gap-1.5">
                    <Label>{field.label}</Label>
                    {renderControl(
                      field,
                      lng,
                      props.value[field.name]?.[lng] || "",
                      (next) => setFieldLang(field.name, lng, next)
                    )}
                  </div>
                ))}
              </div>
            ) : (
              renderControl(props, lng, props.value[lng] || "", (next) =>
                setLang(lng, next)
              )
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
