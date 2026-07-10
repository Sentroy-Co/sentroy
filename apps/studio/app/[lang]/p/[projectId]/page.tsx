import { notFound } from "next/navigation"
import {
  studioProjectModel,
  studioProjectDataModel,
  companyModel,
} from "@workspace/db/models"
import { DjEditor } from "@/components/editor/dj-editor"
import { MusicianEditor } from "@/components/musician/musician-editor"

/**
 * Editor page — project.mode'a göre DjEditor (4-deck Pioneer-style) veya
 * MusicianEditor (FL Studio-style multitrack timeline) render eder.
 */
export default async function EditorPage({
  params,
}: {
  params: Promise<{ lang: string; projectId: string }>
}) {
  const { lang, projectId } = await params

  const projectMaybe = await studioProjectModel.findById(projectId)
  if (!projectMaybe) notFound()
  const project = projectMaybe!
  const companyMaybe = await companyModel.findById(project.companyId)
  if (!companyMaybe) notFound()
  const company = companyMaybe!
  const data = await studioProjectDataModel.findByProject(projectId)

  if (project.mode === "musician") {
    return (
      <MusicianEditor
        project={project}
        data={data}
        companySlug={company.slug}
        lang={lang}
      />
    )
  }

  return (
    <DjEditor
      project={project}
      data={data}
      companySlug={company.slug}
      lang={lang}
    />
  )
}
