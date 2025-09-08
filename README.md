# n8n-nodes-plunet-login

> **n8n community node – Plunet API (Login only)**  
> A tiny, battle-tested node that calls the **PlunetAPI → `login`** SOAP method and returns a **session UUID**.

- **One node, one job:** authenticate with Plunet and output `{ success, uuid }`
- **Zero fluff:** no gulp/eslint required — just TypeScript + `fast-xml-parser`
- **Robust SOAP handling:** tries SOAP **1.1** first (with `SOAPAction`), then auto-fallback to **1.2**

---

## Contents

- [Install](#install)
- [Credentials](#credentials)
- [Usage](#usage)
- [Example workflow](#example-workflow)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Publish (optional)](#publish-optional)
- [FAQ](#faq)
- [Changelog](#changelog)
- [License](#license)

---

## Install

### A) From n8n UI (Community Nodes)
1. In n8n, go to **Settings → Community Nodes → Install**.
2. Enter: **`n8n-nodes-plunet-login`**
3. Confirm & restart if prompted.

### B) Manual local install (no npm required inside n8n)
1. Clone this repo and build:
   ```bash
   npm install
   npm run build
