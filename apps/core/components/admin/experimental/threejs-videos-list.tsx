"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlusSignIcon,
  PencilEdit01Icon,
  Delete02Icon,
  CodeIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"
import { PageTransition } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { confirm } from "@workspace/console/stores/confirm"

interface SceneRow {
  id: string
  name: string
  description?: string | null
  updatedAt: string
}

export function ThreejsVideosListContent() {
  const t = useTranslations("experimental")
  const router = useRouter()
  const params = useParams<{ lang: string }>()
  const [scenes, setScenes] = useState<SceneRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/experimental/threejs-videos")
      const json = await res.json()
      if (res.ok) setScenes(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  function open(id: string) {
    router.push(`/${params.lang}/admin/experimental/threejs-videos/${id}`)
  }

  async function remove(scene: SceneRow) {
    const ok = await confirm({
      title: t("deleteSceneTitle"),
      description: t("deleteSceneDesc", { name: scene.name }),
      confirmText: t("delete"),
    })
    if (!ok) return
    setActingId(scene.id)
    try {
      const res = await fetch(
        `/api/admin/experimental/threejs-videos/${scene.id}`,
        { method: "DELETE" },
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || "Failed")
      }
      toast.success(t("deleted"))
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setActingId(null)
    }
  }

  return (
    <PageTransition>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2">
                <HugeiconsIcon icon={CodeIcon} strokeWidth={2} />
                {t("threejsVideos")}
              </CardTitle>
              <CardDescription>{t("threejsVideosDesc")}</CardDescription>
            </div>
            <Button onClick={() => open("new")}>
              <HugeiconsIcon
                icon={PlusSignIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("newScene")}
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-lg" />
                ))}
              </div>
            ) : scenes.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                {t("emptyScenes")}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {scenes.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {s.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => open(s.id)}
                          title={t("edit")}
                        >
                          <HugeiconsIcon
                            icon={PencilEdit01Icon}
                            strokeWidth={2}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => remove(s)}
                          disabled={actingId === s.id}
                        >
                          <HugeiconsIcon
                            icon={
                              actingId === s.id ? Loading03Icon : Delete02Icon
                            }
                            strokeWidth={2}
                            className={
                              actingId === s.id ? "animate-spin" : ""
                            }
                          />
                        </Button>
                      </div>
                    </div>
                    {s.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {s.description}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(s.updatedAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  )
}
