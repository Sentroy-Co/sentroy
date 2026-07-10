"use client"

import { useParams, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  UserMultipleIcon,
  Building06Icon,
  CreditCardIcon,
  Coupon03Icon,
  Settings05Icon,
  ArrowLeft01Icon,
  Mail01Icon,
  File01Icon,
  ImageAdd01Icon,
  ServerStack02Icon,
  MailSend02Icon,
  TextCreationIcon,
  DatabaseIcon,
  KeyIcon,
  Search01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"
import { NavUser } from "@workspace/console/components/sidebar/nav-user"
import { VersionTag } from "@workspace/console/components/sidebar/version-tag"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"

export function AdminSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations("admin")
  const params = useParams()
  const pathname = usePathname()
  const lang = params.lang as string

  const basePath = `/${lang}/admin`
  const statusUrl = `${process.env.NEXT_PUBLIC_STATUS_URL || "https://status.sentroy.com"}/${lang}`

  // Anlamlı gruplar — tek uzun liste yerine kategorize edilmiş gezinme.
  const navGroups: {
    label: string
    items: { title: string; url: string; icon: React.ReactNode; external?: boolean }[]
  }[] = [
    {
      label: t("groupManagement"),
      items: [
        {
          title: t("users"),
          url: `${basePath}/users`,
          icon: <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2} />,
        },
        {
          title: t("companies"),
          url: `${basePath}/companies`,
          icon: <HugeiconsIcon icon={Building06Icon} strokeWidth={2} />,
        },
        {
          title: t("contactMessages"),
          url: `${basePath}/contact-messages`,
          icon: <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} />,
        },
      ],
    },
    {
      label: t("groupFinance"),
      items: [
        {
          title: t("billing"),
          url: `${basePath}/billing`,
          icon: <HugeiconsIcon icon={Wallet01Icon} strokeWidth={2} />,
        },
        {
          title: t("plans"),
          url: `${basePath}/plans`,
          icon: <HugeiconsIcon icon={CreditCardIcon} strokeWidth={2} />,
        },
        {
          title: t("coupons"),
          url: `${basePath}/coupons`,
          icon: <HugeiconsIcon icon={Coupon03Icon} strokeWidth={2} />,
        },
      ],
    },
    {
      label: t("groupContent"),
      items: [
        {
          title: "Pages",
          url: `${basePath}/pages`,
          icon: <HugeiconsIcon icon={File01Icon} strokeWidth={2} />,
        },
        {
          title: t("landing"),
          url: `${basePath}/landing`,
          icon: <HugeiconsIcon icon={ImageAdd01Icon} strokeWidth={2} />,
        },
        {
          title: t("templateLibrary"),
          url: `${basePath}/template-library`,
          icon: <HugeiconsIcon icon={TextCreationIcon} strokeWidth={2} />,
        },
        {
          title: t("seo"),
          url: `${basePath}/seo`,
          icon: <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />,
        },
      ],
    },
    {
      label: t("groupSystem"),
      items: [
        {
          title: t("systemMail"),
          url: `${basePath}/system-mail`,
          icon: <HugeiconsIcon icon={MailSend02Icon} strokeWidth={2} />,
        },
        {
          title: t("systemStatus"),
          // Status admin apps/status'a taşındı (status.sentroy.com); cross-
          // subdomain cookie ile aynı oturum.
          url: statusUrl,
          icon: <HugeiconsIcon icon={ServerStack02Icon} strokeWidth={2} />,
          external: true,
        },
        {
          title: t("backups"),
          url: `${basePath}/backups`,
          icon: <HugeiconsIcon icon={DatabaseIcon} strokeWidth={2} />,
        },
        {
          title: t("envVault"),
          url: `${basePath}/env-vault`,
          icon: <HugeiconsIcon icon={KeyIcon} strokeWidth={2} />,
        },
        {
          title: t("settings"),
          url: `${basePath}/settings`,
          icon: <HugeiconsIcon icon={Settings05Icon} strokeWidth={2} />,
        },
      ],
    },
  ]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<a href={basePath} />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} className="size-4" />
              </div>
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-medium">{t("title")}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={
                      !item.external && pathname.startsWith(item.url)
                    }
                    render={<a href={item.url} />}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={t("backToDashboard")}
                render={<a href={`/${lang}/d`} />}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
                <span>{t("backToDashboard")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
        <VersionTag />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
