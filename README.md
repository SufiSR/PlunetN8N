# n8n-nodes-plunet

> **n8n community node for the Plunet SOAP API**  
> Auth (login/validate/logout) with session caching, plus `DataCustomer30` operations with typed results and strict error handling.

---

## Features

- **Session caching**: Login once; UUID is stored per `baseHost + scheme` and reused automatically.
- **Validate** uses **UUID + Username + Password** (as required by Plunet).
- **Strict error handling**:
    - Any **SOAP Fault** (1.1/1.2) → node error.
    - Any Plunet result with **`statusCode !== 0`** → node error.
    - If present, any **`statusMessage !== "OK"`** → node error.
    - Login returns `<return>uuid</return>` (success) or `<return>refused</return>` (error).
- **Typed result parsing** (no need to parse raw XML in n8n):
    - `StringResult` → `{ data: string }` (empty string when `<data/>`).
    - `IntegerArrayResult` → `{ data: number[] }` (supports repeated `<data>`).
    - `IntegerResult` → `{ value: number }`.
    - `CustomerResult` → `{ customer: {...} }`, `CustomerListResult` → `{ customers: [...] }`.
    - `PaymentInfoResult`, `AccountResult`, `WorkflowListResult` mapped likewise.
- **Nicer UX**:
    - All **UUID plumbing is automatic** (hidden from the UI).
    - UI parameters for each operation are generated under the chosen resource.
- **Icon bundling**: ships a custom SVG icon (`plunet.svg`) for the node.

---

## Install

From your n8n host:

```bash
npm install n8n-nodes-plunet
# or add to your community node image / volume and restart n8n
```

> Make sure your n8n instance loads community nodes (default in standard deployments).

---

## Build (contributors)

Requirements:

- Node 18+ (tested with Node v18.20.x).
- `npm` and a working TypeScript toolchain.

```bash
# clone your fork
npm ci
npm run build
```

The build does:

- `tsc`
- copies `src/**/*.{png,ico,svg}` to `dist/…`
- verifies the icon exists at `dist/nodes/Plunet/plunet.svg`

If you see lockfile mismatches on CI, run a local `npm install` to refresh `package-lock.json`.

---

## Where things live

```
src/
  credentials/
    PlunetApi.credentials.ts
  nodes/Plunet/
    Plunet.node.ts             # Node entry (wires resources/services)
    description.ts             # UI: resources, operations, properties
    core/
      soap.ts                  # SOAP helpers + 1.1/1.2 fallback
      xml.ts                   # XML + SOAP Fault + result parsers
      session.ts               # login cache (global workflow static data)
      types.ts                 # shared types (Creds, Service, etc.)
      parsers.ts               # structured DTO parsers (Customer, Account, ...)
    services/
      plunetApi.ts             # login / validate / logout
      dataCustomer30.ts        # all customer-related calls
    plunet.svg                 # node icon (copied to dist)
```

Publishable files end up in `dist/…`. `package.json` is set to:

```json
"main": "dist/index.js",
"types": "dist/index.d.ts",
"n8n": {
  "n8nNodesApiVersion": 1,
  "credentials": ["dist/credentials/PlunetApi.credentials.js"],
  "nodes": ["dist/nodes/Plunet/Plunet.node.js"]
}
```

---

## Credentials

Add **Plunet API** credentials in n8n:

- **baseHost**: e.g. `my.plunet.host` (no protocol)
- **useHttps**: `true` for HTTPS
- **username** / **password**
- **timeout** (optional, ms; default `30000`)

> Credentials are stored by n8n; **never** returned in node outputs.

---

## Resources & Operations

### PlunetAPI (Auth / Misc)

- **Login** → returns `{ uuid }`.
    - Success response: `<return>fdf58d33-64f6-4bd7-832b-db2b2eaa9c55</return>`
    - Failure response: `<return>refused</return>` → node error “Login refused”
- **Validate** → sends `UUID + Username + Password`, returns `{ valid }`.
- **Logout** → uses stored UUID unless provided.

> The node automatically **caches the UUID** per host/scheme. Validate and other services pull it from storage (and auto-login if needed).

### DataCustomer30 (Customers)

A large set of `get…`, `set…`, `insert`, `update`, `search` operations.  
All calls **auto-include `UUID`** behind the scenes.

Examples:

- `getCustomerObject(customerID)` → `{ customer, statusMessage, statusCode }`
- `getAvailableAccountIDList()` → `{ data: number[] }`
- `getEmail(customerID)` → `{ data: string }`
- `setFax(customerID, Fax)` → `{ ok: true }` when statusCode is 0

> **Golden rule**: If `statusCode !== 0`, the node **errors** and shows the `statusMessage` prominently.

---

## Output Shapes (what you get in n8n)

| Result type              | Output key(s)                     | Notes                                                                 |
|--------------------------|-----------------------------------|-----------------------------------------------------------------------|
| **StringResult**         | `data: string`                    | Empty string when `<data/>`.                                          |
| **IntegerResult**        | `value: number`                   | Reads common numeric fields.                                          |
| **IntegerArrayResult**   | `data: number[]`                  | Handles repeated `<data>` items: `<data>1</data><data>2</data>…`.     |
| **CustomerResult**       | `customer: object`                | Structured DTO.                                                       |
| **CustomerListResult**   | `customers: object[]`             | Structured DTO list.                                                  |
| **PaymentInfoResult**    | `paymentInfo: object`             | Structured DTO.                                                       |
| **AccountResult**        | `account: object`                 | Structured DTO.                                                       |
| **WorkflowListResult**   | `workflows: object[]`             | Structured DTO list.                                                  |
| **VoidResult** (setters) | `ok: boolean`                     | `ok: true` when `statusCode` is 0; otherwise the node errors.         |
| **Login**                | `uuid: string`                    | Fails on `<return>refused</return>`.                                  |
| **Validate**             | `valid: boolean`                  | Uses UUID + credentials automatically.                                |
| **Logout**               | `uuid: string`                    | Clears cached session on success.                                     |

---

## Error Handling (important)

We fail fast and loudly to make debugging easy in n8n:

- **SOAP Fault (1.1 / 1.2)** → throws `NodeOperationError("SOAP Fault: …")`
- **Plunet result**:
    - If `statusMessage` is present and not `"OK"` → error with that message
    - Else if `statusCode` exists and isn’t `0` → error with `statusMessage` (or a generic message)
- **Login**:
    - `<return>refused</return>` → error “Login refused”
    - Any non-UUID string → error “Login failed: [string]”

---

## Example Workflows

### 1) Validate session then get customer email

1. **Plunet API → Login** (optional; will auto-login if needed)
2. **Plunet API → Validate** (no UUID needed in UI)
3. **Customers (DataCustomer30) → getEmail**
    - `customerID`: `12345`
    - Output: `{ data: "name@example.com", statusMessage: "OK", statusCode: 0 }`

### 2) Update customer fax (handles locking error)

- **Customers (DataCustomer30) → setFax**
    - `customerID`: `12345`
    - `Fax`: `+49 89 123456`
    - If another user locked the entry, you’ll see an error like:  
      **“setFax: The data entry is currently locked by another user and cannot be modified. [-45]”**

---

## Icon / Assets

- Source: `src/nodes/Plunet/plunet.svg`
- After build, it will be at: `dist/nodes/Plunet/plunet.svg`

Sanity check:

```bash
npm run build
# verify
node -e "require('fs').accessSync('dist/nodes/Plunet/plunet.svg'); console.log('✅ icon ok')"
```

If it fails, make sure the source file exists at `src/nodes/Plunet/plunet.svg`.  
We use `copyfiles` to move `src/**/*.{png,ico,svg}` into `dist`.

---

## Adding New Operations

1. **Choose the service file**, e.g. `src/nodes/Plunet/services/dataCustomer30.ts`.
2. Add operation name and parameter list to `PARAM_ORDER`.
3. Add the **return type** to `RETURN_TYPE` (e.g. `String`, `IntegerArray`, `Customer`, `Void`, …).
4. If the response is a custom DTO, implement a parser in `core/parsers.ts` and export it.
5. Rebuild.

The UI dropdown and parameter inputs are auto-generated from `PARAM_ORDER` + `RETURN_TYPE`.

---

## Troubleshooting

- **Login keeps failing**: Check credentials; if `<return>refused</return>`, the node will show “Login refused”.
- **Validate returns false**: The node sends `UUID + Username + Password`; ensure the stored UUID is from the same base host and still valid.
- **Icon not found**: Ensure `src/nodes/Plunet/plunet.svg` exists; run `npm run build` and verify the file in `dist/nodes/Plunet/`.
- **StringResult empty**: `<data/>` is treated as `""` by design. If the server actually omits `<data>`, you still get `""` for `StringResult`.

---

## License

[MIT](./LICENSE)

---

## Credits

- Node created by **Sufian Reiter**.
- Powered by `fast-xml-parser` and n8n’s community node framework.

If you hit an odd SOAP shape, paste a redacted response and we’ll extend the parser to cover it.
