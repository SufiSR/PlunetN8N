# n8n-nodes-plunet

> **n8n community node for the Plunet SOAP API**
> Auth (login/validate/logout) with session caching, plus `DataCustomer30` **and** `DataResource30` operations with typed results, enums, and strict error handling.

---

## Features

* **Session caching**: Login once; UUID is stored per `baseHost + scheme` and reused automatically.
* **Validate** uses **UUID + Username + Password** (as required by Plunet).
* **Strict error handling**:

  * Any **SOAP Fault** (1.1/1.2) → node error.
  * Any Plunet result with **`statusCode !== 0`** → node error.
  * If present, any **`statusMessage !== "OK"`** → node error.
  * Login returns `<return>uuid</return>` (success) or `<return>refused</return>` (error).
* **Typed result parsing** (no raw XML spelunking in n8n):

  * `StringResult` → `{ data: string }` (empty string when `<data/>`).
  * `IntegerArrayResult` → `{ data: number[] }` (repeated `<data>` supported).
  * `IntegerResult` → `{ value: number }` (or enum-expanded shapes; see below).
  * `CustomerResult` / `CustomerListResult`
  * `ResourceResult` / `ResourceListResult`
  * `PaymentInfoResult`, `AccountResult`, `WorkflowListResult`, `PricelistListResult`
* **Enums mapped to dropdowns + readable outputs**:

  * Customers: `Status` (ACTIVE, …)
  * Resources: `ResourceStatus`, `WorkingStatus`, `ResourceType`
  * Payment info: `TaxType` (exposed as dropdown for Customers; readable name added for both Customers & Resources)
* **Nicer UX**:

  * All **UUID plumbing is automatic** (hidden from the UI).
  * Operation labels are friendlier (e.g., **Create Customer**, **Update Customer**, **Search by External ID**).
  * Operation ordering is curated for the most-used actions first.

---

## Install

From your n8n host:

```bash
npm install n8n-nodes-plunet
# or add to your community node image / volume and restart n8n
```

> Ensure your n8n instance loads community nodes (default in standard deployments).

---

## Build (contributors)

Requirements:

* Node 18+ (tested with Node v18.20.x).
* `npm` and a working TypeScript toolchain.

```bash
npm ci
npm run build
```

The build does:

* `tsc`
* copies `src/**/*.{png,ico,svg}` to `dist/…`
* verifies the icon exists at `dist/nodes/Plunet/plunet.svg`

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
    plunet.svg                 # node icon (copied to dist)

    enums/
      tax-type.ts              # TaxType (used in payment info)
      resource-status.ts       # ResourceStatus
      working-status.ts        # WorkingStatus
      resource-type.ts         # ResourceType

    core/
      soap.ts                  # SOAP helpers + 1.1/1.2 fallback
      xml.ts                   # XML + SOAP Fault + result parsers
      session.ts               # login cache (global workflow static data)
      types.ts                 # shared types (Creds, Service, etc.)
      parsers.ts               # structured DTO parsers (Customer, Resource, ...)

    services/
      plunetApi.ts             # login / validate / logout
      dataCustomer30.ts        # customer-related calls (decluttered)
      dataResource30.ts        # resource-related calls (decluttered)
```

Publishable files end up in `dist/…`. `package.json` includes:

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

* **baseHost**: e.g. `my.plunet.host` (no protocol)
* **useHttps**: `true` for HTTPS
* **username** / **password**
* **timeout** (optional, ms; default `30000`)

> Credentials are stored by n8n; **never** returned in node outputs.

---

## Resources & Operations

### PlunetAPI (Auth / Misc)

* **Login** → returns `{ uuid }`.

  * Success: `<return>fdf58d33-64f6-4bd7-832b-db2b2eaa9c55</return>`
  * Failure: `<return>refused</return>` → node error “Login refused”
* **Validate** → sends `UUID + Username + Password`, returns `{ valid }`.
* **Logout** → uses stored UUID unless provided.

> The node automatically **caches the UUID** per host/scheme. Other services pull it from storage (and auto-login if needed).

---

### DataCustomer30 (Customers)

Decluttered to focus on full-object actions, search/lookups, and genuinely separate fields.

**Core actions**

* **Create Customer** (`insert2`)
* **Update Customer** (`update`) – includes `enableNullOrEmptyValues` boolean
* **Delete Customer** (`delete`)
* **Search** (`search`)
* **Search by External ID** (`seekByExternalID`)
* **Get Customer** (`getCustomerObject`)
* **Get All Customers by Status** (`getAllCustomerObjects`)

**Kept single-field ops (non-redundant)**

* `getAccountManagerID` / `setAccountManagerID`
* `getProjectManagerID` / `setProjectManagerID`
* `getDateOfInitialContact` / `setDateOfInitialContact`
* `getSourceOfContact` / `setSourceOfContact`
* `getDossier` / `setDossier`
* `getPaymentInformation` / `setPaymentInformation` *(exploded params incl. `preselectedTaxID` as **TaxType** dropdown)*
* `getAvailableAccountIDList`, `getAvailablePaymentMethodList`, `getPaymentMethodDescription`
* `getCreatedByResourceID`
* `getStatus` / `setStatus` *(enum dropdown)*

**Enums surfaced**

* **Status**: dropdown in UI; `getStatus` outputs both `{ statusId, status }`.

**Payment info**

* `setPaymentInformation` shows **TaxType** dropdown for `preselectedTaxID`.
* `getPaymentInformation` adds `preselectedTaxType` (human-readable) alongside the raw ID.

---

### DataResource30 (Resources)

Mirrors the customer patterns; trimmed to the useful surface.

**Core actions**

* **Create Resource** (`insertObject`)
* **Update Resource** (`update`) – includes `enableNullOrEmptyValues` boolean
* **Delete Resource** (`delete`)
* **Search** (`search`)
* **Search by External ID** (`seekByExternalID`)
* **Get Resource** (`getResourceObject`)
* **Get All Resources** (`getAllResourceObjects`) — filtered by `WorkingStatus` and `Status`

**Lookups / lists**

* `getAvailableAccountIDList`, `getAvailablePaymentMethodList`, `getPaymentMethodDescription`
* `getPricelists`, `getPricelists2` (language-pair aware)

**Status & types (enums)**

* `getStatus` / `setStatus` → **ResourceStatus** dropdown; outputs `{ statusId, status }`
* `getWorkingStatus` / `setWorkingStatus` → **WorkingStatus** dropdown; outputs `{ workingStatusId, workingStatus }`
* `getResourceType` / `setResourceType` → **ResourceType** dropdown; outputs `{ resourceTypeId, resourceType }`

**Payment info**

* `setPaymentInformation(resourceID, paymentInfo)` currently accepts the XML block as a string (pass-through).
* `getPaymentInformation` returns structured object.

> If you want a **builder UI** for `paymentInfo` (including **TaxType** dropdown), we can add it later.

---

## Output Shapes (what you get in n8n)

| Result type              | Output key(s)          | Notes                                                          |
| ------------------------ | ---------------------- | -------------------------------------------------------------- |
| **StringResult**         | `data: string`         | Empty string when `<data/>`.                                   |
| **IntegerResult**        | `value: number`        | For enum getters, expanded (see below).                        |
| **IntegerArrayResult**   | `data: number[]`       | Handles repeated `<data>` items.                               |
| **CustomerResult**       | `customer: object`     | Structured DTO.                                                |
| **CustomerListResult**   | `customers: object[]`  | Structured DTO list.                                           |
| **ResourceResult**       | `resource: object`     | Structured DTO.                                                |
| **ResourceListResult**   | `resources: object[]`  | Structured DTO list.                                           |
| **PaymentInfoResult**    | `paymentInfo: object`  | Adds `preselectedTaxType` (name) if `preselectedTaxID` exists. |
| **AccountResult**        | `account: object`      | Structured DTO.                                                |
| **WorkflowListResult**   | `workflows: object[]`  | Structured DTO list.                                           |
| **PricelistListResult**  | `pricelists: object[]` | Structured DTO list.                                           |
| **VoidResult** (setters) | `ok: boolean`          | `ok: true` when `statusCode` is 0; otherwise the node errors.  |

**Enum-expanded getters**

* Customers: `getStatus` → `{ statusId, status }`
* Resources: `getStatus` → `{ statusId, status }`, `getWorkingStatus` → `{ workingStatusId, workingStatus }`, `getResourceType` → `{ resourceTypeId, resourceType }`

---

## Example Workflows

### 1) Create then update a customer

1. **Plunet API → Login** (optional; auto-login works)
2. **Customers → Create Customer (`insert2`)** with your fields
3. **Customers → Update Customer (`update`)** with `enableNullOrEmptyValues = false`

### 2) Get a resource’s pricelists for a language pair

* **Resources → Get Pricelists (by language pair) (`getPricelists2`)**

  * `sourcelanguage`: `EN`
  * `targetlanguage`: `DE`
  * `resourceID`: `456`
  * Output: `{ pricelists: [...], statusMessage: "OK", statusCode: 0 }`

### 3) Readable enums from resource

* **Resources → getStatus / getWorkingStatus / getResourceType**

  * Outputs include both numeric IDs and friendly enum names.

---

## Enums

Provided in `nodes/Plunet/enums/` and used across UI + outputs:

* **TaxType** (`tax-type.ts`) — dropdown for `setPaymentInformation` (customers), readable field `preselectedTaxType` on `getPaymentInformation`.
* **ResourceStatus** (`resource-status.ts`) — dropdown + readable output.
* **WorkingStatus** (`working-status.ts`) — dropdown + readable output.
* **ResourceType** (`resource-type.ts`) — dropdown + readable output.

---

## Adding New Operations

1. **Choose the service file**, e.g. `src/nodes/Plunet/services/dataCustomer30.ts`.
2. Add the operation name and parameter list to `PARAM_ORDER`.
3. Add the **return type** to `RETURN_TYPE` (e.g. `String`, `IntegerArray`, `Customer`, `Resource`, `Void`, …).
4. If the response is a custom DTO, add a parser in `core/parsers.ts` and export it.
5. (Optional) Add a friendly label in `FRIENDLY_LABEL` and pin its position in `OP_ORDER`.
6. Rebuild.

The UI dropdown and parameter inputs are auto-generated from `PARAM_ORDER` + `RETURN_TYPE`.

---

## Troubleshooting

* **My operation order didn’t change**: Ensure you’re not sorting the keys. We keep insertion order and use an `OP_ORDER` array to pin the most important ones first.
* **Edits not showing in n8n**: Rebuild (`npm run build`) and **restart n8n**. If you installed from the marketplace, make sure your instance actually loads your local build.
* **Login keeps failing**: Check credentials; `<return>refused</return>` → node error “Login refused”.
* **Validate returns false**: We send `UUID + Username + Password`; ensure UUID is from the same base host and is still valid.
* **Icon not found**: Ensure `src/nodes/Plunet/plunet.svg` exists; run `npm run build` and verify `dist/nodes/Plunet/plunet.svg`.

---

## License

[MIT](./LICENSE)

---

## Credits

* Node created by **Sufian Reiter**.
* Powered by n8n’s community node framework.

If you hit an odd SOAP shape, paste a redacted response and we’ll extend the parser to cover it.
