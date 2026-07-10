declare module "react-file-icon" {
  import { ComponentType } from "react"

  export interface FileIconProps {
    extension?: string
    color?: string
    gradientColor?: string
    gradientOpacity?: number
    fold?: boolean
    foldColor?: string
    glyphColor?: string
    labelColor?: string
    labelTextColor?: string
    labelUppercase?: boolean
    radius?: number
    type?: "3d" | "acrobat" | "audio" | "binary" | "code" | "compressed" | "document" | "drive" | "font" | "image" | "presentation" | "settings" | "spreadsheet" | "vector" | "video"
    [key: string]: unknown
  }

  export const FileIcon: ComponentType<FileIconProps>
  export const defaultStyles: Record<string, Partial<FileIconProps>>
}
