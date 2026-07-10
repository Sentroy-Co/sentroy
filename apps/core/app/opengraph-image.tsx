import { ImageResponse } from "next/og"

/**
 * Next.js 16 Metadata File convention.
 * Served at `/opengraph-image` (1200x630, edge runtime).
 * Acts as the platform-wide default OG image — per-page routes can still
 * declare their own `opengraph-image.tsx` to override.
 *
 * Kurumsal palet: Black #0A0A0A zemin + Sentroy Red #FF1744 / Coral #FF6A5C
 * aksan radial glow'lar + Light Gray #F2F2F4 metin. Kahverengi/lacivert yok.
 *
 * ⚠ Logo: <Logo> bileşeni burada KULLANILAMAZ (satori client-component/Tailwind/
 * relative <img> render etmez) ve inline <svg> de olmaz (gerçek logo <style>
 * CSS class'ları + linearGradient içerir — satori JSX parser desteklemez).
 * ÇÖZÜM: gerçek public/svg/logo-dark.svg'yi base64 data-URI olarak göm → satori
 * bunu resvg'ye rasterize ettirir (resvg CSS class + gradyan destekler, doğrulandı).
 * Logo güncellenince YENİDEN GÖM: node ile logo-dark.svg'yi base64'le, aşağıdaki
 * LOGO_DATA_URI'yi güncelle (bkz. scripts yok — tek seferlik generator ile üretildi).
 */

export const runtime = "edge"

export const alt =
  "Sentroy — Transactional email, object storage, auth & secrets in one SDK"

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = "image/png"

// public/svg/logo-dark.svg (koyu-zemin lockup: beyaz "Sentroy" + kırmızı gradyan amblem)
const LOGO_DATA_URI =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbDpzcGFjZT0icHJlc2VydmUiIHdpZHRoPSI4NTVweCIgaGVpZ2h0PSIyMzNweCIgdmVyc2lvbj0iMS4xIiBzdHlsZT0ic2hhcGUtcmVuZGVyaW5nOmdlb21ldHJpY1ByZWNpc2lvbjsgdGV4dC1yZW5kZXJpbmc6Z2VvbWV0cmljUHJlY2lzaW9uOyBpbWFnZS1yZW5kZXJpbmc6b3B0aW1pemVRdWFsaXR5OyBmaWxsLXJ1bGU6ZXZlbm9kZDsgY2xpcC1ydWxlOmV2ZW5vZGQiDQp2aWV3Qm94PSIwIDAgOTAuMjQgMjQuNTQiDQogeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiDQogeG1sbnM6eG9kbT0iaHR0cDovL3d3dy5jb3JlbC5jb20vY29yZWxkcmF3L29kbS8yMDAzIj4NCiA8ZGVmcz4NCiAgPHN0eWxlIHR5cGU9InRleHQvY3NzIj4NCiAgIDwhW0NEQVRBWw0KICAgIC5maWwwIHtmaWxsOndoaXRlO2ZpbGwtcnVsZTpub256ZXJvfQ0KICAgIC5maWwyIHtmaWxsOnVybCgjaWQwKTtmaWxsLXJ1bGU6bm9uemVyb30NCiAgICAuZmlsMSB7ZmlsbDp1cmwoI2lkMSk7ZmlsbC1ydWxlOm5vbnplcm99DQogICBdXT4NCiAgPC9zdHlsZT4NCiAgPGxpbmVhckdyYWRpZW50IGlkPSJpZDAiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIiB4MT0iNy44MSIgeTE9IjExLjcxIiB4Mj0iMTQuNSIgeTI9IjExLjcxIj4NCiAgIDxzdG9wIG9mZnNldD0iMCIgc3R5bGU9InN0b3Atb3BhY2l0eToxOyBzdG9wLWNvbG9yOiNGRjA3NDMiLz4NCiAgIDxzdG9wIG9mZnNldD0iMC41MDE5NjEiIHN0eWxlPSJzdG9wLW9wYWNpdHk6MTsgc3RvcC1jb2xvcjojRkUwNTNCIi8+DQogICA8c3RvcCBvZmZzZXQ9IjAuNzYwNzg0IiBzdHlsZT0ic3RvcC1vcGFjaXR5OjE7IHN0b3AtY29sb3I6I0ZENjA0QyIvPg0KICAgPHN0b3Agb2Zmc2V0PSIxIiBzdHlsZT0ic3RvcC1vcGFjaXR5OjE7IHN0b3AtY29sb3I6I0ZGM0I0OSIvPg0KICA8L2xpbmVhckdyYWRpZW50Pg0KICA8bGluZWFyR3JhZGllbnQgaWQ9ImlkMSIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiIHhsaW5rOmhyZWY9IiNpZDAiIHgxPSIwIiB5MT0iMTIuMjciIHgyPSIyMi4zMSIgeTI9IjEyLjI3Ij4NCiAgPC9saW5lYXJHcmFkaWVudD4NCiA8L2RlZnM+DQogPGcgaWQ9IkthdG1hbl94MDAyMF8xIj4NCiAgPGcgaWQ9Il8xMDU1NTMzMTIzNTQ4ODAiPg0KICAgPGc+DQogICAgPHBhdGggY2xhc3M9ImZpbDAiIGQ9Ik0zMy40OCAxOC4yNmMtMC45OSwwIC0xLjg0LC0wLjE3IC0yLjU0LC0wLjUxIC0wLjcsLTAuMzQgLTEuMzQsLTAuODUgLTEuOTEsLTEuNTJsMS41NyAtMS41N2MwLjM3LDAuNDggMC43OSwwLjg0IDEuMjYsMS4xIDAuNDgsMC4yNyAxLjA2LDAuNCAxLjc0LDAuNCAwLjYzLDAgMS4xMiwtMC4xMiAxLjQ4LC0wLjM3IDAuMzcsLTAuMjUgMC41NSwtMC41OCAwLjU1LC0xLjAyIDAsLTAuMzYgLTAuMTEsLTAuNjcgLTAuMzIsLTAuOSAtMC4yMSwtMC4yNCAtMC40OCwtMC40MyAtMC44MywtMC41OSAtMC4zNCwtMC4xNiAtMC43MiwtMC4zMSAtMS4xMywtMC40NSAtMC40MiwtMC4xMyAtMC44MywtMC4yOSAtMS4yNCwtMC40NiAtMC40MSwtMC4xOCAtMC43OSwtMC40IC0xLjEzLC0wLjY2IC0wLjM1LC0wLjI3IC0wLjYyLC0wLjYgLTAuODMsLTEuMDIgLTAuMjEsLTAuNDEgLTAuMzIsLTAuOTMgLTAuMzIsLTEuNTUgMCwtMC43NSAwLjE4LC0xLjM4IDAuNTQsLTEuOSAwLjM3LC0wLjUzIDAuODYsLTAuOTMgMS40OSwtMS4yMSAwLjYzLC0wLjI4IDEuMzQsLTAuNDIgMi4xNCwtMC40MiAwLjgzLDAgMS41OSwwLjE2IDIuMjYsMC40NyAwLjY4LDAuMzEgMS4yMywwLjcyIDEuNjYsMS4yMmwtMS41NyAxLjU3Yy0wLjM2LC0wLjM5IC0wLjczLC0wLjY4IC0xLjExLC0wLjg3IC0wLjM4LC0wLjE5IC0wLjgxLC0wLjI5IC0xLjI5LC0wLjI5IC0wLjU0LDAgLTAuOTcsMC4xMSAtMS4yOCwwLjMyIC0wLjMyLDAuMjIgLTAuNDcsMC41MiAtMC40NywwLjkxIDAsMC4zNCAwLjEsMC42MSAwLjMxLDAuODIgMC4yMSwwLjIxIDAuNDksMC4zOSAwLjgzLDAuNTQgMC4zNSwwLjE1IDAuNzMsMC4zIDEuMTQsMC40MyAwLjQxLDAuMTQgMC44MiwwLjMgMS4yNCwwLjQ4IDAuNDEsMC4xOCAwLjc5LDAuNDEgMS4xMywwLjY5IDAuMzQsMC4yOCAwLjYyLDAuNjQgMC44MywxLjA3IDAuMjEsMC40MyAwLjMxLDAuOTggMC4zMSwxLjYyIDAsMS4xNCAtMC40LDIuMDQgLTEuMjEsMi42OSAtMC44LDAuNjUgLTEuOTEsMC45OCAtMy4zLDAuOTh6bTQ0LjkxIC04LjQybDAgMC4wMWMwLjEzLDAuMDUgMC4yNiwwLjEyIDAuMzgsMC4xOSAwLjY4LDAuMzggMS4yMiwwLjkgMS42MiwxLjU3IDAuNCwwLjY2IDAuNiwxLjQgMC42LDIuMjMgMCwwLjgzIC0wLjIsMS41OCAtMC42LDIuMjQgLTAuNCwwLjY3IC0wLjk0LDEuMiAtMS42MiwxLjU5IC0wLjY4LDAuMzkgLTEuNDUsMC41OSAtMi4zLDAuNTkgLTAuODUsMCAtMS42MiwtMC4yIC0yLjMsLTAuNTkgLTAuNjgsLTAuMzkgLTEuMjIsLTAuOTIgLTEuNjIsLTEuNTkgLTAuNCwtMC42NiAtMC42LC0xLjQxIC0wLjYsLTIuMjQgMCwtMC44MyAwLjIsLTEuNTcgMC42LC0yLjIzIDAuMzksLTAuNjUgMC45NCwtMS4xOCAxLjYyLC0xLjU3IDAuNjgsLTAuMzkgMS40NSwtMC41OCAyLjI5LC0wLjU4IDAuMTYsMCAwLjMxLDAgMC40NywwLjAybDAuMDEgLTAuMDNjMC41MiwwLjA1IDEsMC4xOSAxLjQ1LDAuMzl6bS0xLjA3IDEuOTFjLTAuMzgsMC43MiAtMC41NywxLjI2IC0wLjU3LDEuNzcgMCwwLjYxIDAuMjcsMS4yNiAwLjgsMi4ybDAuMDYgMC4xYzAuMzMsLTAuMTkgMC41OCwtMC40NSAwLjc2LC0wLjc5IDAuMTgsLTAuMzUgMC4yNywtMC43NCAwLjI3LC0xLjE5IDAsLTAuNDQgLTAuMDksLTAuODMgLTAuMjgsLTEuMTYgLTAuMTksLTAuMzQgLTAuNDQsLTAuNiAtMC43NywtMC44IC0wLjA4LC0wLjA1IC0wLjE3LC0wLjA5IC0wLjI3LC0wLjEzem0tMS4yMyA0LjM0Yy0wLjUzLC0wLjk5IC0wLjgsLTEuNzYgLTAuOCwtMi41NyAwLC0wLjU5IDAuMTQsLTEuMTUgMC40MywtMS44MSAtMC4xMywwLjA1IC0wLjI2LDAuMTEgLTAuMzgsMC4xOCAtMC4zMywwLjE5IC0wLjU4LDAuNDUgLTAuNzcsMC43OSAtMC4xOCwwLjM0IC0wLjI3LDAuNzMgLTAuMjcsMS4xNyAwLDAuNDQgMC4wOSwwLjgzIDAuMjcsMS4xOCAwLjE5LDAuMzQgMC40NCwwLjYxIDAuNzcsMC44IDAuMjMsMC4xNCAwLjQ4LDAuMjIgMC43NSwwLjI2em0tMzIuNTEgMi4xN2MtMC44OCwwIC0xLjY3LC0wLjE5IC0yLjM2LC0wLjU3IC0wLjY5LC0wLjM4IC0xLjI0LC0wLjkgLTEuNjQsLTEuNTcgLTAuMzksLTAuNjcgLTAuNiwtMS40MiAtMC42LC0yLjI2IDAsLTAuODQgMC4yLC0xLjU5IDAuNTksLTIuMjUgMC4zOSwtMC42NyAwLjkzLC0xLjE5IDEuNiwtMS41NyAwLjY3LC0wLjM5IDEuNDMsLTAuNTggMi4yNiwtMC41OCAwLjgxLDAgMS41MiwwLjE4IDIuMTQsMC41NCAwLjYyLDAuMzYgMS4xMSwwLjg2IDEuNDcsMS40OSAwLjM1LDAuNjQgMC41MywxLjM2IDAuNTMsMi4xOCAwLDAuMTQgLTAuMDEsMC4zIC0wLjAzLDAuNDUgLTAuMDEsMC4xNiAtMC4wNCwwLjM0IC0wLjA4LDAuNTNsLTcuMSAwLjAxIDAgLTEuNyA2LjAzIC0wLjAxIC0wLjkzIDAuN2MtMC4wMiwtMC41IC0wLjExLC0wLjkyIC0wLjI3LC0xLjI1IC0wLjE2LC0wLjM0IC0wLjM4LC0wLjYgLTAuNjgsLTAuNzcgLTAuMjksLTAuMTggLTAuNjYsLTAuMjcgLTEuMDksLTAuMjcgLTAuNDYsMCAtMC44NSwwLjEgLTEuMTksMC4zIC0wLjMzLDAuMiAtMC41OSwwLjQ5IC0wLjc3LDAuODUgLTAuMTgsMC4zNyAtMC4yNywwLjggLTAuMjcsMS4zMSAwLDAuNTIgMC4wOSwwLjk2IDAuMjksMS4zNCAwLjE5LDAuMzcgMC40NywwLjY2IDAuODIsMC44NyAwLjM2LDAuMiAwLjc4LDAuMyAxLjI2LDAuMyAwLjQzLDAgMC44MiwtMC4wNyAxLjE3LC0wLjIyIDAuMzUsLTAuMTUgMC42NSwtMC4zNyAwLjkxLC0wLjY2bDEuMzQgMS4zNWMtMC40MSwwLjQ4IC0wLjkxLDAuODUgLTEuNSwxLjA5IC0wLjU5LDAuMjUgLTEuMjIsMC4zNyAtMS45LDAuMzd6bTExLjA4IC0wLjE4bDAgLTQuODRjMCwtMC41IC0wLjE2LC0wLjkxIC0wLjQ4LC0xLjIzIC0wLjMxLC0wLjMxIC0wLjcxLC0wLjQ3IC0xLjIsLTAuNDcgLTAuMzMsMCAtMC42MywwLjA3IC0wLjg4LDAuMjEgLTAuMjYsMC4xNSAtMC40NiwwLjM1IC0wLjYxLDAuNiAtMC4xNCwwLjI2IC0wLjIxLDAuNTYgLTAuMjEsMC44OWwtMC45IC0wLjQ2YzAsLTAuNjYgMC4xNSwtMS4yMyAwLjQzLC0xLjczIDAuMjksLTAuNDkgMC42OSwtMC44OCAxLjE5LC0xLjE2IDAuNTEsLTAuMjggMS4wOCwtMC40MiAxLjcyLC0wLjQyIDAuNjIsMCAxLjE3LDAuMTUgMS42NiwwLjQ2IDAuNDksMC4zMSAwLjg3LDAuNzEgMS4xNSwxLjIxIDAuMjgsMC40OSAwLjQyLDEuMDMgMC40MiwxLjU5bDAgNS4zNSAtMi4yOSAwem0tNS42OCAwbDAgLTguNDQgMi4zIDAgMCA4LjQ0IC0yLjMgMHptMTAuOTQgMGwwIC0xMS45NCAyLjMgMCAwIDExLjk0IC0yLjMgMHptLTEuOTYgLTYuNDNsMCAtMi4wMSA2LjIyIDAgMCAyLjAxIC02LjIyIDB6bTcuNTEgNi40M2wwIC04LjQ0IDIuMjkgMCAwIDguNDQgLTIuMjkgMHptMi4yOSAtNC42NmwtMC44OSAtMC42MWMwLjExLC0xLjAyIDAuNDIsLTEuODQgMC45MiwtMi40NCAwLjUsLTAuNiAxLjIyLC0wLjkgMi4xNSwtMC45IDAuNDIsMCAwLjc4LDAuMDYgMS4xMSwwLjIgMC4zMiwwLjE0IDAuNjIsMC4zNSAwLjg4LDAuNjVsLTEuNDIgMS42NWMtMC4xNCwtMC4xNCAtMC4zLC0wLjI1IC0wLjQ3LC0wLjMyIC0wLjE4LC0wLjA3IC0wLjM5LC0wLjEgLTAuNjMsLTAuMSAtMC40OSwwIC0wLjg4LDAuMTUgLTEuMTksMC40NiAtMC4zLDAuMyAtMC40NiwwLjc3IC0wLjQ2LDEuNDF6bTE3LjA5IDQuNzJsLTMuNTMgLTguNSAyLjQ5IDAgMi4zMyA2LjQ5IC0wLjgzIDAgMi40MyAtNi40OSAyLjUgMCAtMy43NiA4LjUgLTEuNjMgMHptLTIuMzQgMy40N2wyLjU4IC01LjQzIDEuMzkgMS45NiAtMS41MyAzLjQ3IC0yLjQ0IDB6Ii8+DQogICA8L2c+DQogICA8Zz4NCiAgICA8cGF0aCBjbGFzcz0iZmlsMSIgZD0iTTE4LjEzIDMuNzhjLTEsLTAuNSAtMi4xMSwtMC44OSAtMy4yOSwtMS4xNSAtMS4xNSwtMC4yNiAtMi4zOSwtMC40IC0zLjY5LC0wLjQgLTEuMywwIC0yLjU0LDAuMTQgLTMuNjksMC40IC0xLjE2LDAuMjYgLTIuMjYsMC42NCAtMy4yNSwxLjEzbC0wLjA5IDAuMDRjLTAuODIsMC40MSAtMS4yMywwLjYzIC0xLjU2LDEuMTUgLTAuMTYsMC4yNiAtMC4yNCwwLjUyIC0wLjI4LDAuODUgLTAuMDUsMC4zOSAtMC4wNSwwLjk2IC0wLjA1LDEuNzNsMCAzLjg5YzAsMi44NSAxLjE1LDUuMDggMi42Miw2Ljc2IDEuNTIsMS43MyAzLjQsMi45MSA0Ljc4LDMuNjIgMC4zNiwwLjE5IDAuNjMsMC4zMyAwLjg3LDAuNDEgMC4xOSwwLjA2IDAuMzgsMC4xIDAuNjUsMC4xIDAuNTUsMCAwLjg4LC0wLjE3IDEuNTMsLTAuNTEgMS4zOCwtMC43MSAzLjI2LC0xLjg5IDQuNzgsLTMuNjIgMS40NywtMS42OCAyLjYyLC0zLjkxIDIuNjIsLTYuNzZsMCAtMy44OWMwLC0xLjM2IDAsLTIuMDUgLTAuMzMsLTIuNTggLTAuMzQsLTAuNTMgLTAuNzYsLTAuNzUgLTEuNjEsLTEuMTdsLTAuMDEgMHptLTIuODEgLTMuMzJjMS4zNywwLjMgMi42MywwLjc0IDMuNzcsMS4zbDAuMDkgMC4wNWMxLjE5LDAuNTkgMS43OSwwLjkgMi40NiwxLjk3IDAuNjcsMS4wOSAwLjY3LDEuOTcgMC42NywzLjc1bDAgMy44OWMwLDMuNDggLTEuMzksNi4xOSAtMy4xOCw4LjIzIC0xLjc1LDEuOTkgLTMuODcsMy4zMyAtNS40Myw0LjEzIC0wLjk4LDAuNTEgLTEuNDcsMC43NiAtMi41NSwwLjc2IC0wLjUzLDAgLTAuOTUsLTAuMDggLTEuMzcsLTAuMjIgLTAuMzcsLTAuMTMgLTAuNzIsLTAuMyAtMS4xNywtMC41NCAtMS41NiwtMC44IC0zLjY4LC0yLjE0IC01LjQzLC00LjEzIC0xLjc5LC0yLjA0IC0zLjE4LC00Ljc1IC0zLjE4LC04LjIzbDAgLTMuODljMCwtMC44MSAwLC0xLjQxIDAuMDgsLTIuMDEgMC4wOCwtMC42NSAwLjI1LC0xLjE5IDAuNTksLTEuNzQgMC42NywtMS4wOCAxLjI4LC0xLjM5IDIuNDksLTEuOTlsMC4wMSAwYzEuMTUsLTAuNTcgMi40MywtMS4wMyAzLjgxLC0xLjMzIDEuMzMsLTAuMyAyLjczLC0wLjQ2IDQuMTcsLTAuNDYgMS40NCwwIDIuODUsMC4xNiA0LjE3LDAuNDZ6Ii8+DQogICAgPHBhdGggY2xhc3M9ImZpbDIiIGQ9Ik0xMS4xNSAxMC4wNGMwLjMxLDAgMC41OSwtMC4xMyAwLjc5LC0wLjMzIDAuMiwtMC4yIDAuMzMsLTAuNDggMC4zMywtMC43OSAwLC0wLjMxIC0wLjEyLC0wLjU5IC0wLjMyLC0wLjc5bC0wLjAxIDBjLTAuMiwtMC4yIC0wLjQ4LC0wLjMyIC0wLjc5LC0wLjMyIC0wLjMsMCAtMC41OCwwLjEyIC0wLjc4LDAuMzJsLTAuMDUgMC4wNWMtMC4xNywwLjE5IC0wLjI4LDAuNDUgLTAuMjgsMC43NCAwLDAuMzEgMC4xMiwwLjU5IDAuMzIsMC43OWwwLjAxIDAuMDFjMC4xOSwwLjE5IDAuNDcsMC4zMiAwLjc4LDAuMzJ6bTIuMzcgMS4yNWMtMC4zNSwwLjM1IC0wLjc4LDAuNjIgLTEuMjUsMC43OWwwIDAuNzUgMC41NiAwYzAuNjEsMCAxLjExLDAuNSAxLjExLDEuMTEgMCwwLjYyIC0wLjUsMS4xMiAtMS4xMSwxLjEybC0wLjU2IDAgMCAwLjU1IDEuMTEgMGMwLjYyLDAgMS4xMiwwLjUgMS4xMiwxLjEyIDAsMC42MiAtMC41LDEuMTIgLTEuMTIsMS4xMmwtMS4xMSAwYy0wLjYxLDAgLTEuMTcsLTAuMjUgLTEuNTcsLTAuNjZsLTAuMDEgMGMtMC40LC0wLjQxIC0wLjY1LC0wLjk3IC0wLjY1LC0xLjU3bDAgLTMuNTRjLTAuNDcsLTAuMTcgLTAuOSwtMC40NCAtMS4yNCwtMC43OWwtMC4wMSAwYy0wLjYxLC0wLjYxIC0wLjk4LC0xLjQ1IC0wLjk4LC0yLjM3IDAsLTAuODggMC4zNCwtMS42OCAwLjkxLC0yLjI4bDAuMDcgLTAuMDhjMC42LC0wLjYxIDEuNDQsLTAuOTggMi4zNiwtMC45OCAwLjkyLDAgMS43NiwwLjM3IDIuMzYsMC45N2wwLjAxIDAuMDFjMC42MSwwLjYxIDAuOTgsMS40NCAwLjk4LDIuMzYgMCwwLjkzIC0wLjM3LDEuNzYgLTAuOTgsMi4zN3oiLz4NCiAgIDwvZz4NCiAgPC9nPg0KIDwvZz4NCjwvc3ZnPg=="

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          backgroundColor: "#0A0A0A",
          // Sağ-üst Sentroy Red, sol-alt Coral glow — siyah zemin üzerinde.
          backgroundImage:
            "radial-gradient(1100px 620px at 82% -12%, rgba(255,23,68,0.30), transparent 60%), radial-gradient(900px 520px at -6% 118%, rgba(255,106,92,0.20), transparent 58%)",
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Gerçek kurumsal logo (public/svg/logo-dark.svg, resvg-rasterize) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_DATA_URI} width={246} height={67} alt="Sentroy" />

          <div
            style={{
              fontSize: "86px",
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              color: "#ffffff",
              display: "flex",
              flexWrap: "wrap",
              maxWidth: "1040px",
            }}
          >
            Mail · Storage · Vault · Meet and more
          </div>

          <div
            style={{
              fontSize: "32px",
              fontWeight: 400,
              lineHeight: 1.35,
              color: "rgba(242,242,244,0.72)",
              maxWidth: "1000px",
              marginTop: "16px",
            }}
          >
            Sentroy is a transactional email, S3-compatible object storage,
            auth-as-a-service, and an env vault, all behind one SDK.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "24px",
            color: "rgba(242,242,244,0.5)",
            fontWeight: 500,
            letterSpacing: "0.02em",
          }}
        >
          <span>sentroy.com</span>
          <span
            style={{
              color: "rgba(242,242,244,0.38)",
              fontSize: "20px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Discover the power of Sentroy
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    },
  )
}
