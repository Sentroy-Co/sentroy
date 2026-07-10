"use client"

import { useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  Tick02Icon,
  SquareLockPasswordIcon,
  Mailbox01Icon,
} from "@hugeicons/core-free-icons"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/ui/components/sheet"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Badge } from "@workspace/ui/components/badge"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

interface MailboxCredentialsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Mailbox email — aynı zamanda hem IMAP hem SMTP username'idir. */
  email: string | null
  onChangePassword?: () => void
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={handleCopy}
        >
          <HugeiconsIcon
            icon={copied ? Tick02Icon : Copy01Icon}
            strokeWidth={2}
            className="size-3.5"
          />
        </Button>
      </div>
    </div>
  )
}

export function MailboxCredentialsSheet({
  open,
  onOpenChange,
  email,
  onChangePassword,
}: MailboxCredentialsSheetProps) {
  const t = useTranslations("credentials")

  // Host: NEXT_PUBLIC_SENTROY_API_URL'den çıkarılır, yoksa current hostname
  const host = useMemo(() => {
    if (typeof window === "undefined") return "mail.example.com"
    const base = process.env.NEXT_PUBLIC_SENTROY_API_URL || ""
    try {
      return base ? new URL(base).hostname : window.location.hostname
    } catch {
      return window.location.hostname
    }
  }, [])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!w-full !max-w-xl p-0">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b">
            <div className="flex items-center gap-2">
              <HugeiconsIcon
                icon={Mailbox01Icon}
                strokeWidth={2}
                className="size-4 text-muted-foreground"
              />
              <SheetTitle className="truncate">
                {email || t("title")}
              </SheetTitle>
            </div>
            <SheetDescription>{t("mailboxDescription")}</SheetDescription>
          </SheetHeader>

          <Tabs
            defaultValue="imap"
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="border-b px-6 py-3">
              <TabsList>
                <TabsTrigger value="imap">{t("imapTab")}</TabsTrigger>
                <TabsTrigger value="smtp">{t("smtpTab")}</TabsTrigger>
              </TabsList>
            </div>

            {/* IMAP */}
            <TabsContent value="imap" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-4 p-6">
                  <p className="text-sm text-muted-foreground">
                    {t("imapMailboxIntro")}
                  </p>

                  <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 sm:grid-cols-3">
                    <CopyRow label={t("host")} value={host} />
                    <CopyRow label={t("port")} value="993" />
                    <CopyRow label={t("encryption")} value="SSL/TLS" />
                  </div>

                  <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4">
                    <CopyRow label={t("username")} value={email || ""} />
                    <PasswordRow onChangePassword={onChangePassword} t={t} />
                  </div>

                  <div className="flex items-center gap-2 rounded-xl border border-dashed bg-muted/10 p-3">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      STARTTLS
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t("imapAltPort")} 143
                    </span>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* SMTP */}
            <TabsContent value="smtp" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-4 p-6">
                  <p className="text-sm text-muted-foreground">
                    {t("smtpMailboxIntro")}
                  </p>

                  <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 sm:grid-cols-3">
                    <CopyRow label={t("host")} value={host} />
                    <CopyRow label={t("port")} value="587" />
                    <CopyRow label={t("encryption")} value="STARTTLS" />
                  </div>

                  <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4">
                    <CopyRow label={t("username")} value={email || ""} />
                    <PasswordRow onChangePassword={onChangePassword} t={t} />
                  </div>

                  <div className="flex items-center gap-2 rounded-xl border border-dashed bg-muted/10 p-3">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      SSL/TLS
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t("smtpAltPort")} 465
                    </span>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function PasswordRow({
  onChangePassword,
  t,
}: {
  onChangePassword?: () => void
  t: (key: string) => string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{t("password")}</Label>
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {t("passwordHint")}
        </div>
        {onChangePassword && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onChangePassword}
          >
            <HugeiconsIcon
              icon={SquareLockPasswordIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("changePassword")}
          </Button>
        )}
      </div>
    </div>
  )
}
