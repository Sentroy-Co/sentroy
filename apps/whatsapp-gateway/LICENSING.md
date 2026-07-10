# Licensing — WhatsApp Gateway

**This directory (`apps/whatsapp-gateway`) is licensed under the GNU General
Public License, version 3 or later (GPL-3.0-or-later).** See the `LICENSE`
file in this directory.

## Why this directory differs from the rest of the repository

The rest of the Sentroy monorepo is licensed under the Functional Source
License (FSL-1.1-ALv2) — see the root `LICENSE`. This gateway is the one
exception.

The gateway depends on [Baileys](https://github.com/WhiskeySockets/Baileys)
(`@whiskeysockets/baileys`), which bundles a WhatsApp/Signal protocol
implementation derived from **libsignal**, licensed under **GPL-3.0**. GPL is
a strong copyleft license and is **not** compatible with the FSL, so this
component cannot be distributed under the FSL. It is therefore licensed under
GPL-3.0-or-later to remain compliant.

## Why this does not affect the rest of the repository

The gateway is a **standalone network service** — it runs in its own
process/container and communicates with the other Sentroy apps only over the
network (HTTP), not by shared linking. Under the GPL, this network boundary
means the copyleft obligations of GPL-3.0 apply to **this service only** and do
**not** extend to the FSL-licensed apps and packages elsewhere in this
repository.

## For self-hosters

You may run, modify, and redistribute this gateway under the terms of
GPL-3.0-or-later. If you distribute a modified version, you must make your
modifications available under the same license, per the GPL.

## For the CI license gate

`apps/whatsapp-gateway/**` is an explicit exception to the repository-wide FSL
license header/gate. GPL-3.0 runtime dependencies are permitted **only** inside
this directory.
