/**
 * Minimal ProseMirror JSON doc → markdown converter (triage portu, birebir).
 *
 * Linear'ın IssueTemplate `descriptionData` payload'u ProseMirror JSON
 * doc'u olarak gelir; bizim TipTap schema'mıza birebir uymadığı için
 * mount-time `content` olarak verince node'lar kısmen düşebiliyor.
 * Bunun yerine doc'u markdown'a çevirip editöre öyle veriyoruz —
 * RichTextEditor + tiptap-markdown extension markdown'ı tam parse eder.
 *
 * Desteklenen node/mark tipleri Linear'ın yaygın template payload'unu
 * kapsar; bilinmeyen node'lar `content`'leri varsa text-olarak düşer.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any

function renderText(node: Node): string {
  let text: string = node.text ?? ""
  const marks = Array.isArray(node.marks) ? node.marks : []
  for (const m of marks) {
    switch (m.type) {
      case "bold":
      case "strong":
        text = `**${text}**`
        break
      case "italic":
      case "em":
        text = `*${text}*`
        break
      case "strike":
      case "strikethrough":
        text = `~~${text}~~`
        break
      case "code":
        text = `\`${text}\``
        break
      case "link": {
        const href = m.attrs?.href ?? ""
        text = `[${text}](${href})`
        break
      }
      default:
        break
    }
  }
  return text
}

function renderInline(content: Node[] | undefined): string {
  if (!Array.isArray(content)) return ""
  return content.map((c) => renderNode(c)).join("")
}

function renderListItem(node: Node, prefix: string): string {
  const inner = (node.content ?? [])
    .map((c: Node) => renderNode(c))
    .join("\n")
    .trim()
  // Indent continuation lines so they stay inside the bullet.
  const indent = " ".repeat(prefix.length)
  const [first, ...rest] = inner.split("\n")
  const body = [first, ...rest.map((l: string) => indent + l)].join("\n")
  return prefix + body
}

export function proseMirrorJsonToMarkdown(doc: unknown): string {
  if (!doc || typeof doc !== "object") return ""
  return renderNode(doc as Node).trim()
}

function renderNode(node: Node): string {
  if (!node || typeof node !== "object") return ""

  switch (node.type) {
    case "doc":
      return (node.content ?? [])
        .map((c: Node) => renderNode(c))
        .join("\n\n")

    case "paragraph":
      return renderInline(node.content)

    case "text":
      return renderText(node)

    case "heading": {
      const level = Math.min(6, Math.max(1, node.attrs?.level ?? 1))
      return "#".repeat(level) + " " + renderInline(node.content)
    }

    case "bulletList":
    case "bullet_list":
      return (node.content ?? [])
        .map((li: Node) => renderListItem(li, "- "))
        .join("\n")

    case "orderedList":
    case "ordered_list":
      return (node.content ?? [])
        .map((li: Node, i: number) => renderListItem(li, `${i + 1}. `))
        .join("\n")

    case "listItem":
    case "list_item":
      return (node.content ?? [])
        .map((c: Node) => renderNode(c))
        .join("\n")
        .trim()

    case "taskList":
      return (node.content ?? [])
        .map((li: Node) => {
          const done = li.attrs?.checked ? "x" : " "
          const inner = (li.content ?? [])
            .map((c: Node) => renderNode(c))
            .join("\n")
            .trim()
          return `- [${done}] ${inner}`
        })
        .join("\n")

    case "taskItem": {
      const done = node.attrs?.checked ? "x" : " "
      return `- [${done}] ${renderInline(node.content)}`
    }

    case "blockquote": {
      const inner = (node.content ?? [])
        .map((c: Node) => renderNode(c))
        .join("\n\n")
        .trim()
      return inner
        .split("\n")
        .map((l: string) => "> " + l)
        .join("\n")
    }

    case "codeBlock":
    case "code_block": {
      const lang = node.attrs?.language ?? node.attrs?.lang ?? ""
      const inner = (node.content ?? [])
        .map((c: Node) => c.text ?? "")
        .join("")
      return "```" + lang + "\n" + inner + "\n```"
    }

    case "hardBreak":
    case "hard_break":
      return "  \n"

    case "horizontalRule":
    case "horizontal_rule":
      return "---"

    case "image": {
      const src = node.attrs?.src ?? ""
      const alt = node.attrs?.alt ?? ""
      return `![${alt}](${src})`
    }

    case "mention": {
      const label = node.attrs?.label ?? node.attrs?.name ?? node.attrs?.id ?? ""
      return label ? `@${label}` : ""
    }

    default:
      // Unknown node: try to surface its children as inline text.
      if (Array.isArray(node.content)) return renderInline(node.content)
      return ""
  }
}
