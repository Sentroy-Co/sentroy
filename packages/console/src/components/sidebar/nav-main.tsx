"use client"

import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import Link from "next/link"

export function NavMain({
  items,
  label,
}: {
  items: {
    title: string
    url: string
    icon?: React.ReactNode
    /** Sayısal rozet — 0 ise gizlenir, 99'dan büyükse "99+" gösterilir. */
    badge?: number
  }[]
  label: string
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        <AnimatePresence mode="wait">
          <motion.div
            key={label}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            {items.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={pathname.startsWith(item.url)}
                  render={<Link href={item.url} />}
                >
                  {item.icon}
                  <span>{item.title}</span>
                  {item.badge && item.badge > 0 ? (
                    <span className="ms-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </motion.div>
        </AnimatePresence>
      </SidebarMenu>
    </SidebarGroup>
  )
}
