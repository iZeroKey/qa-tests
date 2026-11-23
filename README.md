# Suite QA: ABC Inversiones

Conjunto independiente de **248 pruebas automatizadas** en cuatro niveles (**unitarias**, **integración**, **sistema E2E** y **aceptación UAT**) para evaluar la calidad funcional, seguridad, consistencia financiera e interfaz web del sistema **ABC Inversiones**, sin modificar el código fuente de la API ni del *frontend* y operando únicamente con operaciones DML controladas sobre PostgreSQL/Supabase.

---

## 1. Estructura de carpetas requerida

Este repositorio debe ubicarse **al mismo nivel** que los proyectos `abc_inversiones_api` y `abc_inversiones_app` dentro del directorio de trabajo:

```text
workspace/
├── abc_inversiones_api/     # Backend Express/TypeScript + Drizzle ORM + Supabase
├── abc_inversiones_app/     # Frontend React/Vite + TypeScript + TanStack Query
└── qa-tests/                # Este repositorio (suite QA independiente)
```

### ¿Por qué deben estar al mismo nivel?

Las rutas relativas entre carpetas hermanas son utilizadas en distintos puntos de configuración e importación:

- **`vitest.config.ts`**: resuelve el alias `@` hacia `../abc_inversiones_app/src` para importar directamente módulos del *frontend* en las pruebas unitarias.
- **`unit/backend/*.test.ts`**: importa funciones de dominio, utilidades y esquemas Zod mediante rutas relativas `../../../abc_inversiones_api/src/...`.
- **`helpers/load-env.ts` y `helpers/db-dml.ts`**: cargan variables de conexión desde `../abc_inversiones_api/.env` y resuelven `postgres` y `@supabase/supabase-js` desde el árbol de dependencias de la API.
- **`integration/websocket.test.ts`**: resuelve la librería `ws` desde `../../abc_inversiones_api/package.json`.
- **`playwright.config.ts`**: configura `webServer.cwd = "../abc_inversiones_app"` en caso de que el servidor *frontend* no esté iniciado previamente.
- **`helpers/api-supervisor.mjs`**: inicia y supervisa el proceso de `../../abc_inversiones_api` cuando se ejecuta contra el entorno en vivo.

---

## 2. Organización interna de `qa-tests`

```text
qa-tests/
├── unit/
│   ├── backend/                     # 70 casos (CP-U01..CP-U70): cálculos, cronograma, OCR, Zod, middlewares
│   └── frontend/                    # 48 casos (CP-U71..CP-U118): cliente HTTP, permisos, formateadores, navegación
├── integration/                     # 65 casos (CP-I01..CP-I65): endpoints REST, WebSocket /ws y jobs programados
├── system/                          # 47 casos (CP-S01..CP-S47): flujos E2E en navegador Chromium (Playwright)
│   ├── auth-and-navigation.spec.ts
│   ├── users-and-requests.spec.ts
│   ├── loans-lifecycle.spec.ts
│   ├── payments-and-vouchers.spec.ts
│   ├── notifications-audit-profile.spec.ts
│   └── dashboards-and-responsive.spec.ts
├── acceptance/                      # 18 casos (CP-A01..CP-A18 / HU-01..HU-18): historias de usuario E2E
│   ├── loans-and-portfolio.spec.ts
│   ├── payments-and-vouchers.spec.ts
│   ├── users-requests-and-security.spec.ts
│   └── notifications-profile-and-ux.spec.ts
├── helpers/                         # Orquestación, supervisor API, configuración de entorno y limpieza DML
│   ├── api-supervisor.mjs
│   ├── db-dml.ts
│   ├── ensure-api-hook.ts
│   ├── global-setup.ts
│   ├── integration.ts
│   ├── load-env.ts
│   ├── run-all-qa.mjs
│   └── run-setup.mjs
├── support/                         # Flujos reutilizables de UI y cliente de salud hacia el supervisor
│   ├── api-health.ts
│   └── ui-flows.ts
├── fixtures/                        # Archivos de prueba (imágenes válidas/excedidas y texto no soportado)
├── reports/                         # Salidas JSON generadas localmente (ignorado por Git)
├── package.json
├── playwright.config.ts
└── vitest.config.ts
```

---

## 3. Requisitos previos y entorno

1. **Node.js >= 20** y **pnpm**.
2. Dependencias instaladas en los tres proyectos hermanos (`abc_inversiones_api`, `abc_inversiones_app` y `qa-tests`).
3. Archivo `.env` válido en `../abc_inversiones_api/.env` (con `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y demás variables de la API) y `../abc_inversiones_app/.env` configurado hacia `http://localhost:3000`.
4. Usuarios base activos en la base de datos: `admin@abc.com`, `client@abc.com` e `investor@abc.com` (clave de pruebas `password123`).
5. **Política de datos (solo DML):** la suite no altera tablas ni esquemas DDL. `TestCleanupTracker` (`helpers/db-dml.ts`) elimina únicamente usuarios, préstamos, cuotas, pagos, vouchers, notificaciones, solicitudes y registros en Supabase Auth/Storage creados temporalmente por cada suite.

### Instalación en `qa-tests`

```bash
cd qa-tests
pnpm install
pnpm playwright:install
```

### Variables de entorno opcionales

| Variable | Valor por defecto | Propósito |
| :--- | :--- | :--- |
| `QA_API_URL` | Sin definir (en memoria si se omite en integración) | Apunta integración y E2E a la API viva (`http://127.0.0.1:3000`). |
| `QA_SUPERVISOR_URL` | `http://127.0.0.1:3099` | URL del servidor de control de `api-supervisor.mjs`. |
| `PW_HEADLESS` | `true` | Con `false` abre Chromium visible durante Playwright. |
| `PW_SLOWMO` | `0` | Retardo en milisegundos por acción de navegador. |

---

## 4. Guía de ejecución

```bash
# Verificar conexión y usuarios base en PostgreSQL (solo SELECT)
pnpm setup

# Ejecutar la suite completa (unit + integration + system + acceptance) con reporte JSON consolidado
pnpm test
# o bien:
pnpm test:all
```

### Ejecución por nivel

```bash
# 1. Pruebas unitarias (118 casos)
pnpm test:unit

# 2. Iniciar supervisor de API (en otra terminal si se ejecutan niveles sueltos)
pnpm supervisor

# 3. Ejecutar integración, sistema y aceptación contra API viva (PowerShell)
$env:QA_API_URL = "http://127.0.0.1:3000"
pnpm test:integration
pnpm test:system
pnpm test:acceptance
pnpm test:e2e:headed

# Alternativa en Bash / Git Bash / Linux / macOS:
# QA_API_URL=http://127.0.0.1:3000 pnpm test:integration
# QA_API_URL=http://127.0.0.1:3000 pnpm test:system
# QA_API_URL=http://127.0.0.1:3000 pnpm test:acceptance
```

> **Nota sobre estabilidad ante caídas de la API:** `helpers/api-supervisor.mjs` supervisa la API en el puerto `3000` (con control en `:3099`) y la reinicia automáticamente si una petición provoca terminación abrupta del proceso (como ocurre con el defecto abierto en `/api/v1/payment-vouchers/analyze`), evitando que los casos posteriores queden omitidos.

---

## 5. Resumen de resultados

| Nivel | Total | Aprobados | Fallidos | Omitidos | Tasa de éxito |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Unitarias (`Vitest`) | 118 | 109 | 9 | 0 | 92.37 % |
| Integración (`Vitest + Supertest/WS`) | 65 | 54 | 11 | 0 | 83.08 % |
| Sistema (`Playwright E2E`) | 47 | 35 | 12 | 0 | 74.47 % |
| Aceptación (`Playwright UAT`) | 18 | 17 | 1 | 0 | 94.44 % |
| **Total consolidado** | **248** | **215** | **33** | **0** | **86.69 %** |

> Los **33 casos fallidos** corresponden a defectos reales del sistema evaluado y se conservan como fallos intencionales para visibilizar su comportamiento hasta su corrección.

---

## 6. Índice completo de pruebas

### 6.1 Pruebas Unitarias (`CP-U01` a `CP-U118`)

| ID | Archivo | Descripción | Resultado |
| :---: | :--- | :--- | :--- |
| CP-U01 | `unit/backend/loans.finance.test.ts` | roundMoney redondea a 2 decimales | Aprobado |
| CP-U02 | `unit/backend/loans.finance.test.ts` | roundMoney evita -0 | Aprobado |
| CP-U03 | `unit/backend/loans.finance.test.ts` | roundMoney redondea montos grandes y negativos correctamente | Aprobado |
| CP-U04 | `unit/backend/loans.finance.test.ts` | calculateFixedInstallment calcula cuota fija para capital 10000, tasa 5%, 12 cuotas | Aprobado |
| CP-U05 | `unit/backend/loans.finance.test.ts` | calculateFixedInstallment rechaza principal <= 0 | Aprobado |
| CP-U06 | `unit/backend/loans.finance.test.ts` | calculateFixedInstallment rechaza tasa <= 0 | Aprobado |
| CP-U07 | `unit/backend/loans.finance.test.ts` | calculateFixedInstallment rechaza cuotas no enteras o <= 0 | Aprobado |
| CP-U08 | `unit/backend/loans.finance.test.ts` | calculateFixedInstallment rechaza valores no finitos | Aprobado |
| CP-U09 | `unit/backend/loans.finance.test.ts` | calculateFixedInstallment calcula correctamente para 1 cuota y 120 cuotas | Aprobado |
| CP-U10 | `unit/backend/loans.finance.test.ts` | calculateLoanFinancials calcula deuda total e interes para 10000, 5%, 12 | Aprobado |
| CP-U11 | `unit/backend/loans.finance.test.ts` | calculateLoanFinancials rechaza cuota redondeada < 0.01 | Aprobado |
| CP-U12 | `unit/backend/loans.finance.test.ts` | calculateLoanFinancials la deuda total siempre es >= principal para prestamos con interes | Aprobado |
| CP-U13 | `unit/backend/loans.finance.test.ts` | calculateLoanFinancials la suma de cuotas (centavos) coincide con la deuda total | Aprobado |
| CP-U14 | `unit/backend/loans.finance.test.ts` | buildInstallmentDrafts genera N cuotas con montos y fechas | Aprobado |
| CP-U15 | `unit/backend/loans.finance.test.ts` | buildInstallmentDrafts rechaza parametros invalidos | Aprobado |
| CP-U16 | `unit/backend/loans.finance.test.ts` | buildInstallmentDrafts genera cuotas numeradas y fechas secuenciales para weekly, biweekly y daily | Aprobado |
| CP-U17 | `unit/backend/loans.schedule.test.ts` | calculateDueDate mensual: 31/01 -> 28/02 y luego 31/03 | Aprobado |
| CP-U18 | `unit/backend/loans.schedule.test.ts` | calculateDueDate bisiesto 2028: 31/01 -> 29/02 | Aprobado |
| CP-U19 | `unit/backend/loans.schedule.test.ts` | calculateDueDate frecuencias weekly/biweekly/daily | Aprobado |
| CP-U20 | `unit/backend/loans.schedule.test.ts` | calculateDueDate normaliza fecha con hora a 00:00 | Aprobado |
| CP-U21 | `unit/backend/loans.schedule.test.ts` | calculateDueDate rechaza frecuencia no soportada | Aprobado |
| CP-U22 | `unit/backend/loans.schedule.test.ts` | calculateDueDate mensual mantiene ajuste de fin de mes para 30 y 31 en meses de 30 dias | Aprobado |
| CP-U23 | `unit/backend/loans.schedule.test.ts` | calculateDueDate biweekly y daily avanzan correctamente para multiples cuotas | Aprobado |
| CP-U24 | `unit/backend/loans.schedule.test.ts` | normalizeScheduleStartDate normaliza a inicio de dia en zona negocio | Aprobado |
| CP-U25 | `unit/backend/loans.schedule.test.ts` | normalizeScheduleStartDate rechaza fecha invalida | Aprobado |
| CP-U26 | `unit/backend/loans.schedule.test.ts` | calculateMonthlyDueDate mantiene dia original cuando cabe | Aprobado |
| CP-U27 | `unit/backend/middleware.test.ts` | Middlewares de autorizacion y errores authorize rechaza usuario no autenticado (401) y rol no permitido (403) | Aprobado |
| CP-U28 | `unit/backend/middleware.test.ts` | Middlewares de autorizacion y errores authorize respeta allowOwner=true vs allowOwner=false | Aprobado |
| CP-U29 | `unit/backend/middleware.test.ts` | Middlewares de autorizacion y errores notFoundHandler y errorHandler devuelven estructura JSON controlada | Aprobado |
| CP-U30 | `unit/backend/payment-vouchers.ocr.test.ts` | extractVoucherDataFromText extrae banco, operacion, monto y fecha | Aprobado |
| CP-U31 | `unit/backend/payment-vouchers.ocr.test.ts` | extractVoucherDataFromText reconoce fecha textual en espanol | Aprobado |
| CP-U32 | `unit/backend/payment-vouchers.ocr.test.ts` | extractVoucherDataFromText normaliza importe con espacios y coma decimal | Aprobado |
| CP-U33 | `unit/backend/payment-vouchers.ocr.test.ts` | extractVoucherDataFromText devuelve null para texto sin datos reconocibles | Aprobado |
| CP-U34 | `unit/backend/payment-vouchers.ocr.test.ts` | extractVoucherDataFromText reconoce YAPE/PLIN | Aprobado |
| CP-U35 | `unit/backend/payment-vouchers.ocr.test.ts` | extractVoucherDataFromText extrae datos de voucher real: fecha 07/11/2026, monto 150.00, operacion 0098432107 | Fallido: No extrae NRO. DE REFERENCIA 0098432107 tras ese rótulo |
| CP-U36 | `unit/backend/payment-vouchers.ocr.test.ts` | extractVoucherDataFromText reconoce SCOTIABANK, fecha con anio de 2 digitos y mes setiembre/septiembre | Aprobado |
| CP-U37 | `unit/backend/payment-vouchers.ocr.test.ts` | extractVoucherDataFromText reconoce banco BANBIF declarado en el dominio | Fallido: BANBIF declarado en SupportedBank sin patrón regex de detección |
| CP-U38 | `unit/backend/payment-vouchers.ocr.test.ts` | extractVoucherDataFromText reconoce 'BANCO DE CRÉDITO' con tilde como BCP | Fallido: Patrón de BCP (CR[EE]DITO) no reconoce tilde en BANCO DE CRÉDITO |
| CP-U39 | `unit/backend/payment-vouchers.ocr.test.ts` | extractVoucherDataFromText interpreta correctamente montos con separador de miles sin decimales ('S/ 1,000') | Fallido: Convierte "S/ 1,000" en "1.00" al interpretar coma sin decimales |
| CP-U40 | `unit/backend/payment-vouchers.ocr.test.ts` | extractVoucherDataFromText rechaza fechas de calendario inexistentes como 31/02/2026 | Fallido: Acepta fecha de calendario inexistente (31/02/2026) |
| CP-U41 | `unit/backend/public-code.util.test.ts` | formatPublicCode formatea codigo con prefijo y padding | Aprobado |
| CP-U42 | `unit/backend/public-code.util.test.ts` | formatPublicCode rechaza valores fuera de rango o no enteros | Aprobado |
| CP-U43 | `unit/backend/public-code.util.test.ts` | parsePublicCodeNumber extrae numero del codigo | Aprobado |
| CP-U44 | `unit/backend/public-code.util.test.ts` | parsePublicCodeNumber devuelve 0 si no coincide | Aprobado |
| CP-U45 | `unit/backend/public-code.util.test.ts` | publicCodeKindForRole mapea rol a kind | Aprobado |
| CP-U46 | `unit/backend/response.util.test.ts` | response.util formatZodError formatea issues con path y message | Aprobado |
| CP-U47 | `unit/backend/response.util.test.ts` | response.util sendSuccess construye contrato estandar con meta y timestamp | Aprobado |
| CP-U48 | `unit/backend/response.util.test.ts` | response.util sendError oculta detalles 5xx en produccion y conserva 4xx | Aprobado |
| CP-U49 | `unit/backend/schemas.test.ts` | Esquemas Zod del backend auth schemas validan login, refresh, register estricto y changePassword | Aprobado |
| CP-U50 | `unit/backend/schemas.test.ts` | Esquemas Zod del backend users schemas aplican superRefine en createAuthAccount y strictObject | Aprobado |
| CP-U51 | `unit/backend/schemas.test.ts` | Esquemas Zod del backend access-requests schemas validan solicitud publica y union discriminada de estado | Aprobado |
| CP-U52 | `unit/backend/schemas.test.ts` | Esquemas Zod del backend loans schemas validan rangos, strictObject y fechas ISO con offset | Aprobado |
| CP-U53 | `unit/backend/schemas.test.ts` | Esquemas Zod del backend payments schemas rechazan montos no finitos como 'Infinity' | Fallido: Esquema Zod de pagos acepta cadenas no finitas ("Infinity") |
| CP-U54 | `unit/backend/schemas.test.ts` | Esquemas Zod del backend payments schemas aceptan paymentDate ISO con offset de zona horaria (-05:00) | Fallido: Esquema Zod de pagos rechaza fecha ISO con offset -05:00 |
| CP-U55 | `unit/backend/schemas.test.ts` | Esquemas Zod del backend payment-vouchers schemas normalizan operationId y rechazan fecha futura | Aprobado |
| CP-U56 | `unit/backend/schemas.test.ts` | Esquemas Zod del backend payment-vouchers schemas rechazan montos no finitos como 'Infinity' | Fallido: Esquema Zod de vouchers acepta cadenas no finitas ("Infinity") |
| CP-U57 | `unit/backend/storage.util.test.ts` | storage.util parseStorageReference extrae bucket y path de referencias storage:// validas | Aprobado |
| CP-U58 | `unit/backend/storage.util.test.ts` | storage.util parseStorageReference devuelve null para URLs externas o referencias malformadas | Aprobado |
| CP-U59 | `unit/backend/validation.util.test.ts` | PaginationParams defaults page=1 limit=20 | Aprobado |
| CP-U60 | `unit/backend/validation.util.test.ts` | PaginationParams rechaza page < 1 | Aprobado |
| CP-U61 | `unit/backend/validation.util.test.ts` | PaginationParams PaginationParamsMax limita el maximo permitido | Aprobado |
| CP-U62 | `unit/backend/validation.util.test.ts` | UUIDParam acepta UUID valido | Aprobado |
| CP-U63 | `unit/backend/validation.util.test.ts` | UUIDParam rechaza UUID invalido | Aprobado |
| CP-U64 | `unit/backend/validation.util.test.ts` | UUIDParam UUIDRouteParam valida campos parametrizados | Aprobado |
| CP-U65 | `unit/backend/validation.util.test.ts` | parsePositiveInt parsea string numerico | Aprobado |
| CP-U66 | `unit/backend/validation.util.test.ts` | parsePositiveInt usa fallback si invalido | Aprobado |
| CP-U67 | `unit/backend/validation.util.test.ts` | parsePositiveInt respeta max | Aprobado |
| CP-U68 | `unit/backend/validation.util.test.ts` | parsePositiveInt rechaza <= 0 | Aprobado |
| CP-U69 | `unit/backend/validation.util.test.ts` | DateRangeFromTo y SearchParams acepta from/to opcionales | Aprobado |
| CP-U70 | `unit/backend/validation.util.test.ts` | DateRangeFromTo y SearchParams DateRangeParams valida ISO con offset y SearchParams respeta max 100 | Aprobado |
| CP-U71 | `unit/frontend/api-client.test.ts` | api-client construye URLs y omite parámetros vacíos | Aprobado |
| CP-U72 | `unit/frontend/api-client.test.ts` | api-client lee payloads exitosos | Aprobado |
| CP-U73 | `unit/frontend/api-client.test.ts` | api-client propaga el mensaje de error de la API y usa fallback si no hay JSON | Aprobado |
| CP-U74 | `unit/frontend/api-client.test.ts` | api-client lee una ruta usando el fetch autenticado y el helper de errores | Aprobado |
| CP-U75 | `unit/frontend/api-client.test.ts` | api-client readApiUrl consume URLs completas y rechaza respuestas HTTP 200 con success=false | Aprobado |
| CP-U76 | `unit/frontend/avatar-image.test.ts` | avatar-image valida tipos MIME permitidos para avatares | Aprobado |
| CP-U77 | `unit/frontend/avatar-image.test.ts` | avatar-image validateAvatarFile devuelve null si es valido y mensaje en formato no permitido | Aprobado |
| CP-U78 | `unit/frontend/avatar-image.test.ts` | avatar-image resolveAvatarUrl filtra storage:// y resuelve rutas relativas y absolutas | Aprobado |
| CP-U79 | `unit/frontend/formatters.test.ts` | formatters formatea soles y valores nulos | Aprobado |
| CP-U80 | `unit/frontend/formatters.test.ts` | formatters formatea precisión y porcentaje | Aprobado |
| CP-U81 | `unit/frontend/formatters.test.ts` | formatters incluye simbolo S/ en moneda y maneja strings numericos y null en porcentaje | Aprobado |
| CP-U82 | `unit/frontend/loan-constants.test.ts` | loan-constants define filtros y etiquetas completas de estado y frecuencia | Aprobado |
| CP-U83 | `unit/frontend/loan-constants.test.ts` | loan-constants define etiquetas para estados de cuotas, metodos de pago y vouchers | Aprobado |
| CP-U84 | `unit/frontend/loan-permissions.test.ts` | loan-permissions identifica roles y textos por perspectiva | Aprobado |
| CP-U85 | `unit/frontend/loan-permissions.test.ts` | loan-permissions canCreateLoan, canRegisterPayment y canUploadVoucher respetan rol y estado | Aprobado |
| CP-U86 | `unit/frontend/loan-permissions.test.ts` | loan-permissions canReviewLoan valida estados revisables y asignacion del inversionista | Aprobado |
| CP-U87 | `unit/frontend/loan-permissions.test.ts` | loan-permissions canEditVoucher y canDeleteVoucher controlan edicion y eliminacion por rol y estado | Aprobado |
| CP-U88 | `unit/frontend/loan-permissions.test.ts` | loan-permissions canProcessVoucher aplica flujo de aprobacion inversionista -> admin | Aprobado |
| CP-U89 | `unit/frontend/loan-permissions.test.ts` | loan-permissions canReviewLoan no permite a inversionista aprobar prestamo en pending_admin_review | Fallido: canReviewLoan permite aprobar al inversionista en pending_admin_review |
| CP-U90 | `unit/frontend/loan-utils.test.ts` | loan-utils normaliza números y porcentajes | Aprobado |
| CP-U91 | `unit/frontend/loan-utils.test.ts` | loan-utils calcula pagos, progreso y saldo sin valores negativos | Aprobado |
| CP-U92 | `unit/frontend/loan-utils.test.ts` | loan-utils detecta estados de cuotas y préstamo | Aprobado |
| CP-U93 | `unit/frontend/loan-utils.test.ts` | loan-utils elige cuotas visibles y la próxima cuota | Aprobado |
| CP-U94 | `unit/frontend/loan-utils.test.ts` | loan-utils crea texto de búsqueda con códigos, nombres y montos | Aprobado |
| CP-U95 | `unit/frontend/loan-utils.test.ts` | loan-utils calcula pagos desde cuotas cuando totalPaid no viene informado | Aprobado |
| CP-U96 | `unit/frontend/loan-utils.test.ts` | loan-utils resuelve nombres, codigos y fechas de respaldo | Aprobado |
| CP-U97 | `unit/frontend/loan-utils.test.ts` | loan-utils ventana visible maneja lista vacia, <=3 cuotas y todas pagadas | Aprobado |
| CP-U98 | `unit/frontend/loan-utils.test.ts` | loan-utils clasifica colores, etiquetas y textos de tarjetas por estado | Aprobado |
| CP-U99 | `unit/frontend/navigation.test.ts` | navigation helpers calcula profundidad y clave de ruta | Aprobado |
| CP-U100 | `unit/frontend/navigation.test.ts` | navigation helpers valida el estado de navegación sin confiar en datos inválidos | Aprobado |
| CP-U101 | `unit/frontend/navigation.test.ts` | navigation helpers resuelve destinos de regreso por ruta, estado y home | Aprobado |
| CP-U102 | `unit/frontend/navigation.test.ts` | navigation helpers decide cuándo reemplazar navegación móvil | Aprobado |
| CP-U103 | `unit/frontend/navigation.test.ts` | navigation helpers construye el estado de navegación móvil | Aprobado |
| CP-U104 | `unit/frontend/navigation.test.ts` | navigation helpers normaliza rutas vacias y estados indefinidos | Aprobado |
| CP-U105 | `unit/frontend/query-keys.test.ts` | query-keys usa scope guest/anonymous cuando no hay usuario autenticado | Aprobado |
| CP-U106 | `unit/frontend/query-keys.test.ts` | query-keys compacta parametros omitiendo vacios, null y undefined | Aprobado |
| CP-U107 | `unit/frontend/query-keys.test.ts` | query-keys genera llaves diferenciadas para pagos, vouchers, transacciones, notificaciones y usuarios | Aprobado |
| CP-U108 | `unit/frontend/realtime-loan-form.test.ts` | realtime y formulario de préstamos convierte URLs HTTP a WebSocket y elimina rutas sobrantes | Aprobado |
| CP-U109 | `unit/frontend/realtime-loan-form.test.ts` | realtime y formulario de préstamos crea un formulario con valores iniciales válidos | Aprobado |
| CP-U110 | `unit/frontend/realtime-loan-form.test.ts` | realtime y formulario de préstamos soporta URLs ws/wss ya normalizadas y puertos personalizados | Aprobado |
| CP-U111 | `unit/frontend/users-utils.test.ts` | users utils normaliza formularios de usuario respetando permisos | Aprobado |
| CP-U112 | `unit/frontend/users-utils.test.ts` | users utils formatea y normaliza teléfono, rol y búsqueda | Aprobado |
| CP-U113 | `unit/frontend/users-utils.test.ts` | users utils aplica permisos de administración sin permitir editar al dueño | Aprobado |
| CP-U114 | `unit/frontend/users-utils.test.ts` | users utils envía la revisión de una solicitud con el payload correcto | Aprobado |
| CP-U115 | `unit/frontend/users-utils.test.ts` | users utils generateTemporaryPassword genera contraseña segura de 14 caracteres con simbolo y digito | Aprobado |
| CP-U116 | `unit/frontend/users-utils.test.ts` | users utils etiquetas de estado, rol, estado civil e iniciales manejan faltantes | Aprobado |
| CP-U117 | `unit/frontend/users-utils.test.ts` | users utils owner puede gestionar admin no-owner pero admin no puede vincular auth a otro admin | Aprobado |
| CP-U118 | `unit/frontend/users-utils.test.ts` | users utils createUser, updateUser y linkAuthAccount envian los endpoints y cuerpos esperados | Aprobado |

### 6.2 Pruebas de Integración (`CP-I01` a `CP-I65`)

| ID | Archivo | Descripción | Resultado |
| :---: | :--- | :--- | :--- |
| CP-I01 | `integration/access-requests-management.test.ts` | solicitudes de acceso crea, lista, consulta y rechaza una solicitud | Aprobado |
| CP-I02 | `integration/access-requests-management.test.ts` | solicitudes de acceso aprueba solicitud con contraseña inicial, crea usuario operativo y permite login (RF-10) | Aprobado |
| CP-I03 | `integration/access-requests-management.test.ts` | solicitudes de acceso valida permisos, entradas inválidas y 404 en solicitudes | Aprobado |
| CP-I04 | `integration/audit.test.ts` | auditoría lista auditoría general y por usuario administrador con el préstamo creado | Aprobado |
| CP-I05 | `integration/audit.test.ts` | auditoría restringe auditoría a roles autorizados y valida filtros por usuario/rango | Aprobado |
| CP-I06 | `integration/auth.test.ts` | autenticación inicia sesión con credenciales válidas para owner, cliente e inversionista | Aprobado |
| CP-I07 | `integration/auth.test.ts` | autenticación rechaza credenciales inválidas y valida payload de login/refresh/register | Aprobado |
| CP-I08 | `integration/auth.test.ts` | autenticación rechaza rutas protegidas sin token y cierra una sesión temporal independiente | Aprobado |
| CP-I09 | `integration/auth.test.ts` | autenticación POST /auth/refresh renueva sesión válida y rechaza usuario desactivado | Aprobado |
| CP-I10 | `integration/auth.test.ts` | autenticación POST /auth/register respeta permisos owner vs admin no-propietario | Aprobado |
| CP-I11 | `integration/auth.test.ts` | autenticación POST /auth/register rechaza correo duplicado con conflicto 409 | Fallido: Devuelve HTTP 400 en vez de 409 Conflict ante correo duplicado |
| CP-I12 | `integration/auth.test.ts` | autenticación POST /auth/change-password valida contraseña actual, actualiza y permite ingresar con la nueva | Aprobado |
| CP-I13 | `integration/health.test.ts` | salud de la API GET /api/v1/health devuelve la estructura estándar y cabeceras de seguridad | Aprobado |
| CP-I14 | `integration/health.test.ts` | salud de la API GET /health y rutas inexistentes responden correctamente | Aprobado |
| CP-I15 | `integration/health.test.ts` | salud de la API JSON malformado en el cuerpo responde 400 controlado sin exponer stack | Aprobado |
| CP-I16 | `integration/jobs.test.ts` | jobs programados (check-overdue y send-reminders) check-overdue marca cuotas vencidas como overdue y envía notificación INSTALLMENT_OVERDUE | Aprobado |
| CP-I17 | `integration/jobs.test.ts` | jobs programados (check-overdue y send-reminders) send-reminders envía notificación INSTALLMENT_REMINDER para cuotas próximas a vencer | Aprobado |
| CP-I18 | `integration/loans-management.test.ts` | gestión de préstamos admin consulta el préstamo creado y aprobado | Aprobado |
| CP-I19 | `integration/loans-management.test.ts` | gestión de préstamos lista préstamos, resumen, cuotas, bundle y transacciones | Aprobado |
| CP-I20 | `integration/loans-management.test.ts` | gestión de préstamos actualiza un préstamo y consulta el resumen administrativo | Aprobado |
| CP-I21 | `integration/loans-management.test.ts` | gestión de préstamos rechaza y elimina préstamos independientes | Aprobado |
| CP-I22 | `integration/loans-management.test.ts` | gestión de préstamos ejecuta flujo de aprobación en 2 pasos (inversionista -> admin) y bloquea terceros (RF-13) | Aprobado |
| CP-I23 | `integration/loans-management.test.ts` | gestión de préstamos rechaza con 403 si un cliente intenta aprobar un préstamo | Fallido: Devuelve HTTP 400 en vez de 403 Forbidden cuando cliente intenta aprobar préstamo |
| CP-I24 | `integration/loans-management.test.ts` | gestión de préstamos aísla préstamos entre clientes e inversionistas distintos (RNF-14) | Aprobado |
| CP-I25 | `integration/loans-management.test.ts` | gestión de préstamos impide rechazar un préstamo ya activo | Fallido: Permite rechazar (HTTP 200) un préstamo activo en vez de responder 400 |
| CP-I26 | `integration/loans-management.test.ts` | gestión de préstamos oculta préstamos eliminados en GET /loans/:id/transactions | Fallido: GET /loans/:id/transactions devuelve HTTP 200 en vez de 404 tras eliminar préstamo |
| CP-I27 | `integration/loans-management.test.ts` | gestión de préstamos GET /loans/summary para cliente excluye préstamos rechazados | Fallido: GET /loans/summary de cliente acumula capital de préstamos rechazados (6000 en vez de 1000) |
| CP-I28 | `integration/loans-management.test.ts` | gestión de préstamos GET /loans/summary para inversionista incluye cobros registrados en préstamos activos | Fallido: GET /loans/summary de inversionista devuelve totalPaid=0 en préstamos activos |
| CP-I29 | `integration/notifications.test.ts` | notificaciones genera notificaciones de ciclo de préstamo (LOAN_SUBMITTED, LOAN_INVESTOR_APPROVED, LOAN_ACTIVE) | Aprobado |
| CP-I30 | `integration/notifications.test.ts` | notificaciones lista notificaciones, marca una individualmente y luego marca todas como leídas | Aprobado |
| CP-I31 | `integration/notifications.test.ts` | notificaciones genera notificaciones para flujo de vouchers (VOUCHER_PENDING_REVIEW y VOUCHER_APPROVED) | Aprobado |
| CP-I32 | `integration/payments-management.test.ts` | gestión de pagos registra y lista pagos del préstamo | Aprobado |
| CP-I33 | `integration/payments-management.test.ts` | gestión de pagos actualiza y elimina un pago recalculando cuotas y estado | Aprobado |
| CP-I34 | `integration/payments-management.test.ts` | gestión de pagos rechaza pago incompleto con 400 exacto y rechaza sobrepago excesivo | Aprobado |
| CP-I35 | `integration/payments-management.test.ts` | gestión de pagos completa el pago total hasta estado paid y revierte a active al editar/eliminar (RF-16, RF-18) | Aprobado |
| CP-I36 | `integration/payments-management.test.ts` | gestión de pagos acepta evidencia multipart válida y rechaza MIME inválido (400) y >5MB (413) | Aprobado |
| CP-I37 | `integration/payments-management.test.ts` | gestión de pagos restringe registro, edición y eliminación de pagos al admin y aísla consulta ajena | Aprobado |
| CP-I38 | `integration/performance-and-security.test.ts` | rendimiento (RNF-07), privacidad (RNF-03) y rate limit endpoints críticos responden por debajo de 2000 ms (RNF-07) | Aprobado |
| CP-I39 | `integration/performance-and-security.test.ts` | rendimiento (RNF-07), privacidad (RNF-03) y rate limit respuestas HTTP no exponen secretos, tokens de servicio ni cadenas de BD (RNF-03) | Aprobado |
| CP-I40 | `integration/performance-and-security.test.ts` | rendimiento (RNF-07), privacidad (RNF-03) y rate limit authRateLimit aplica límite de tasa (429) tras exceder 12 intentos consecutivos | Fallido: authRateLimit deshabilitado en middleware (RATE_LIMIT_DISABLED = true); no retorna HTTP 429 |
| CP-I41 | `integration/profile.test.ts` | perfil admin consulta su perfil y el cliente no accede a auditoría | Aprobado |
| CP-I42 | `integration/profile.test.ts` | perfil sube y elimina el avatar del usuario autenticado | Aprobado |
| CP-I43 | `integration/profile.test.ts` | perfil valida archivo, MIME y límite de 2 MB al subir avatar | Aprobado |
| CP-I44 | `integration/profile.test.ts` | perfil usuario actualiza sus propios datos permitidos (RF-29) y es rechazado si intenta cambiar rol/active | Aprobado |
| CP-I45 | `integration/reports.test.ts` | reportes actualiza el estado de cuenta después de registrar un pago | Aprobado |
| CP-I46 | `integration/reports.test.ts` | reportes consulta estado de cuenta, portafolio y dashboard con estructura y métricas consistentes | Aprobado |
| CP-I47 | `integration/reports.test.ts` | reportes protege reportes entre roles y usuarios distintos (RNF-02, RNF-14) | Aprobado |
| CP-I48 | `integration/users-management.test.ts` | gestión de usuarios lista usuarios paginados con filtros por rol, estado y búsqueda | Aprobado |
| CP-I49 | `integration/users-management.test.ts` | gestión de usuarios crea sin acceso Auth, consulta, actualiza y elimina un usuario temporal | Aprobado |
| CP-I50 | `integration/users-management.test.ts` | gestión de usuarios crea usuario con Auth, valida publicCode y vincula Auth a usuario existente (RF-08) | Aprobado |
| CP-I51 | `integration/users-management.test.ts` | gestión de usuarios aplica restricciones owner vs admin no-propietario y devuelve 404 para usuario inexistente | Aprobado |
| CP-I52 | `integration/users-management.test.ts` | gestión de usuarios valida formato de UUID en GET /users/:id devolviendo 400 ante ID malformado | Fallido: UUID malformado en GET /users/:id propaga HTTP 500 en vez de 400 |
| CP-I53 | `integration/users-management.test.ts` | gestión de usuarios reactivar un usuario eliminado/desactivado restaura su visibilidad en GET /users | Fallido: Reactivar usuario no limpia deletedAt y lo mantiene oculto en GET /users |
| CP-I54 | `integration/users-management.test.ts` | gestión de usuarios bloquea la autoeliminación del administrador en DELETE /users/:id | Fallido: Permite la autoeliminación administrativa (HTTP 200 en vez de 403) |
| CP-I55 | `integration/vouchers-management.test.ts` | gestión de vouchers envía un voucher con evidencia y lo lista | Aprobado |
| CP-I56 | `integration/vouchers-management.test.ts` | gestión de vouchers verifica duplicados normalizados, procesa, actualiza y elimina vouchers | Aprobado |
| CP-I57 | `integration/vouchers-management.test.ts` | gestión de vouchers flujo completo de voucher con inversionista (inversionista -> admin) genera pago y actualiza deuda (RF-23, RF-24) | Aprobado |
| CP-I58 | `integration/vouchers-management.test.ts` | gestión de vouchers rechaza voucher por inversionista/admin, valida límites de archivo/fecha futura y protege préstamo ajeno | Aprobado |
| CP-I59 | `integration/vouchers-ocr.test.ts` | OCR de vouchers analizar voucher sin evidencia responde 400 | Aprobado |
| CP-I60 | `integration/vouchers-ocr.test.ts` | OCR de vouchers rechaza archivo no imagen (400) y rol no autorizado (403) en OCR | Aprobado |
| CP-I61 | `integration/vouchers-ocr.test.ts` | OCR de vouchers rechaza con 413 una imagen que supera el límite de 1.5 MB del endpoint OCR | Aprobado |
| CP-I62 | `integration/vouchers-ocr.test.ts` | OCR de vouchers OCR con imagen: analizar voucher con imagen válida menor a 1.5 MB | Fallido: POST /payment-vouchers/analyze responde HTTP 500 y cae por falta de credenciales ADC (NO_ADC_FOUND) |
| CP-I63 | `integration/websocket.test.ts` | WebSocket en tiempo real (/ws) envía connected inicial, rechaza mensajes sin autenticar y JSON inválido | Aprobado |
| CP-I64 | `integration/websocket.test.ts` | WebSocket en tiempo real (/ws) cierra con código 4003 ante token inválido | Aprobado |
| CP-I65 | `integration/websocket.test.ts` | WebSocket en tiempo real (/ws) autentica usuario, responde ping->pong y entrega eventos en tiempo real solo al destinatario | Aprobado |

### 6.3 Pruebas de Sistema (`CP-S01` a `CP-S47`)

| ID | Archivo | Descripción | Resultado |
| :---: | :--- | :--- | :--- |
| CP-S01 | `system/auth-and-navigation.spec.ts` | inicio de sesión válido por rol redirige a /#/home y actualiza título | Aprobado |
| CP-S02 | `system/auth-and-navigation.spec.ts` | credenciales inválidas muestran mensaje exacto y mantienen /#/login | Aprobado |
| CP-S03 | `system/auth-and-navigation.spec.ts` | validación Zod en formulario de login vacío y correo malformado | Aprobado |
| CP-S04 | `system/auth-and-navigation.spec.ts` | usuario desactivado recibe mensaje claro de cuenta inactiva al intentar iniciar sesión | Fallido: Usuario desactivado recibe toast genérico "Error del servidor" en lugar de cuenta inactiva |
| CP-S05 | `system/auth-and-navigation.spec.ts` | Recordarme persiste sesión en localStorage y Cerrar sesión la limpia por completo (RF-03) | Aprobado |
| CP-S06 | `system/auth-and-navigation.spec.ts` | solicitud de acceso pública desde LoginPage valida datos y registra envío (RF-09) | Aprobado |
| CP-S07 | `system/auth-and-navigation.spec.ts` | navegación completa por módulos permitidos para administrador, cliente e inversionista | Aprobado |
| CP-S08 | `system/auth-and-navigation.spec.ts` | ruta inexistente renderiza NotFoundPage y permite volver al inicio | Aprobado |
| CP-S09 | `system/auth-and-navigation.spec.ts` | usuario autenticado que navega a /#/login debe redirigirse a /#/home | Fallido: Sesión activa que navega a /#/login no es redirigida a /#/home |
| CP-S10 | `system/auth-and-navigation.spec.ts` | rutas administrativas por URL muestran Acceso restringido sin disparar consultas 403 en segundo plano | Fallido: Rol cliente dispara 3 consultas HTTP 403 en segundo plano al visitar rutas administrativas |
| CP-S11 | `system/users-and-requests.spec.ts` | administrador lista, busca, filtra por rol/estado y abre detalle de usuario | Aprobado |
| CP-S12 | `system/users-and-requests.spec.ts` | crea usuario operativo sin Auth, vincula cuenta Auth y valida inicio de sesión (RF-05, RF-08) | Aprobado |
| CP-S13 | `system/users-and-requests.spec.ts` | crea usuario con Auth, edita datos en UI y verifica persistencia tras recarga | Aprobado |
| CP-S14 | `system/users-and-requests.spec.ts` | desactiva y reactiva usuario desde UI bloqueando y restaurando su acceso (RF-07) | Aprobado |
| CP-S15 | `system/users-and-requests.spec.ts` | administrador no-propietario no puede crear rol Admin ni editar al Owner en UI | Aprobado |
| CP-S16 | `system/users-and-requests.spec.ts` | navegar directamente a /#/requests debe abrir la pestaña Solicitudes aunque Usuarios fuera la última activa | Fallido: Navegar a /#/requests abre pestaña Usuarios si quedó guardada en localStorage |
| CP-S17 | `system/users-and-requests.spec.ts` | administrador aprueba solicitud de acceso con contraseña temporal y el nuevo usuario ingresa (RF-10) | Aprobado |
| CP-S18 | `system/users-and-requests.spec.ts` | administrador rechaza solicitud de acceso con observación y verifica estado actualizado (RF-10) | Aprobado |
| CP-S19 | `system/loans-lifecycle.spec.ts` | crea préstamo financiado por empresa con vista previa de cronograma y aprueba en 1 paso (RF-11, RF-12, RF-13) | Aprobado |
| CP-S20 | `system/loans-lifecycle.spec.ts` | aprobación en 2 pasos por UI para préstamo con inversionista (RF-13, RF-14) | Aprobado |
| CP-S21 | `system/loans-lifecycle.spec.ts` | inversionista NO debe ver botones Aprobar/Rechazar cuando el préstamo ya pasó a pending_admin_review | Fallido: Inversionista ve botones Aprobar/Rechazar cuando el préstamo está en pending_admin_review |
| CP-S22 | `system/loans-lifecycle.spec.ts` | alterna vista Tarjetas/Tabla con persistencia y aplica filtros por estado en /#/loans | Aprobado |
| CP-S23 | `system/loans-lifecycle.spec.ts` | buscador en /#/loans reinicia la paginación a página 1 cuando cambia el término de búsqueda | Fallido: Buscador de /#/loans no reinicia paginación a página 1 al filtrar |
| CP-S24 | `system/loans-lifecycle.spec.ts` | abre ScheduleDrawer y muestra todas las cuotas del cronograma completo (RF-15) | Aprobado |
| CP-S25 | `system/loans-lifecycle.spec.ts` | detalle del préstamo permite abrir ficha de Cliente e Inversionista asignado (UserDetailDrawer) | Aprobado |
| CP-S26 | `system/loans-lifecycle.spec.ts` | administrador rechaza un préstamo en revisión con observación y pasa a estado Rechazado (RF-13) | Aprobado |
| CP-S27 | `system/payments-and-vouchers.spec.ts` | administrador registra pago manual y reduce numéricamente el saldo pendiente (RF-17, RF-18) | Aprobado |
| CP-S28 | `system/payments-and-vouchers.spec.ts` | administrador edita y elimina un pago recalculando saldo y revirtiendo movimiento (RF-16, RF-18) | Aprobado |
| CP-S29 | `system/payments-and-vouchers.spec.ts` | cliente envía voucher sin imagen y lo visualiza en la galería de pagos (RF-19, RF-20) | Aprobado |
| CP-S30 | `system/payments-and-vouchers.spec.ts` | envío de voucher con operationId duplicado muestra alerta Operación duplicada (RF-22, RNF-06) | Aprobado |
| CP-S31 | `system/payments-and-vouchers.spec.ts` | cliente dispone de botones Editar y Eliminar al abrir su voucher pendiente en PaymentDetailDrawer | Fallido: Omite clientId camelCase y oculta Editar/Eliminar al cliente en voucher pendiente |
| CP-S32 | `system/payments-and-vouchers.spec.ts` | subida de imagen válida en voucher ejecuta OCR sin error 500 ni crash del servidor (RF-21) | Fallido: Subida de imagen en voucher dispara OCR con HTTP 500 y caída de API (NO_ADC_FOUND) |
| CP-S33 | `system/payments-and-vouchers.spec.ts` | aprobación en 2 pasos de voucher (Inversionista -> Admin) genera pago aplicado y reduce saldo (RF-23, RF-24) | Aprobado |
| CP-S34 | `system/payments-and-vouchers.spec.ts` | rechazo de voucher por inversionista y por administrador conserva intacto el saldo pendiente (RF-23) | Aprobado |
| CP-S35 | `system/notifications-audit-profile.spec.ts` | notificaciones de evento real se consultan por pestañas, se marcan individualmente y en lote (RF-25, RF-26) | Aprobado |
| CP-S36 | `system/notifications-audit-profile.spec.ts` | auditoría filtra por módulo, abre AuditDetailsSheet y abre detalle de usuario actor (RF-28, RNF-12, RNF-19) | Aprobado |
| CP-S37 | `system/notifications-audit-profile.spec.ts` | usuario edita datos personales y bancarios en perfil y persisten tras recargar (RF-06, RF-29) | Aprobado |
| CP-S38 | `system/notifications-audit-profile.spec.ts` | carga y recorte de avatar en ProfileEditDrawer debe persistir tras recarga sin URL blob efímera (RF-29) | Fallido: ProfileEditDrawer almacena temporalmente URL blob: efímera en estado/storage |
| CP-S39 | `system/notifications-audit-profile.spec.ts` | ChangePasswordDialog valida coincidencia y realiza cambio real de contraseña con reingreso (RF-04) | Aprobado |
| CP-S40 | `system/notifications-audit-profile.spec.ts` | panel del préstamo muestra banner funcional de vouchers pendientes para el inversionista | Fallido: Panel de préstamo del inversionista omite banner funcional de vouchers por revisar |
| CP-S41 | `system/dashboards-and-responsive.spec.ts` | AdminDashboard muestra KPIs/gráfico y AdminVouchersDrawer solo debe listar vouchers pendientes (RF-27) | Fallido: AdminVouchersDrawer mezcla vouchers ya aprobados junto a pendientes |
| CP-S42 | `system/dashboards-and-responsive.spec.ts` | ClientDashboard muestra Tu Préstamo Principal, métricas reales y navega al préstamo (RF-27) | Aprobado |
| CP-S43 | `system/dashboards-and-responsive.spec.ts` | InvestorDashboard muestra portafolio real y debe reflejar préstamos con cuotas vencidas en mora (RF-27) | Fallido: InvestorDashboard mantiene indicador "En mora" fijo en 0 |
| CP-S44 | `system/dashboards-and-responsive.spec.ts` | todas las vistas principales mantienen adaptabilidad móvil 390x844 tras carga de datos reales (RNF-09, RNF-10) | Aprobado |
| CP-S45 | `system/dashboards-and-responsive.spec.ts` | drawers de creación (Nuevo préstamo y Nuevo usuario) no deben desbordar en desktop angosto 820x900 (RNF-10) | Aprobado |
| CP-S46 | `system/notifications-audit-profile.spec.ts` | eliminación de foto de perfil desde ProfileEditDrawer ejecuta DELETE /users/me/avatar y persiste tras recarga (RF-29) | Aprobado |
| CP-S47 | `system/payments-and-vouchers.spec.ts` | pago total liquida préstamo a Pagado y su eliminación lo revierte a Activo en UI (RF-16, RF-17, RF-18, RNF-13) | Aprobado |

### 6.4 Pruebas de Aceptación (`CP-A01` a `CP-A18`)

| ID | Historia | Archivo | Descripción | Resultado |
| :---: | :---: | :--- | :--- | :--- |
| CP-A01 | HU-01 | `acceptance/loans-and-portfolio.spec.ts` | administrador crea y aprueba un préstamo y el cliente lo visualiza activo con cuotas | Aprobado |
| CP-A02 | HU-02 | `acceptance/loans-and-portfolio.spec.ts` | cliente consulta su préstamo principal en el dashboard y su cronograma completo | Aprobado |
| CP-A03 | HU-03 | `acceptance/loans-and-portfolio.spec.ts` | inversionista consulta su portafolio y el detalle de sus préstamos financiados | Aprobado |
| CP-A04 | HU-04 | `acceptance/payments-and-vouchers.spec.ts` | administrador registra y ajusta pagos manteniendo consistencia contable de saldo | Aprobado |
| CP-A05 | HU-05 | `acceptance/payments-and-vouchers.spec.ts` | cliente, inversionista y administrador completan el ciclo de aprobación de voucher | Aprobado |
| CP-A06 | HU-06 | `acceptance/users-requests-and-security.spec.ts` | administrador crea usuario operativo, vincula acceso Auth y controla activación | Aprobado |
| CP-A07 | HU-07 | `acceptance/users-requests-and-security.spec.ts` | visitante solicita acceso desde login y administrador aprueba habilitando ingreso real | Aprobado |
| CP-A08 | HU-08 | `acceptance/notifications-profile-and-ux.spec.ts` | usuario recibe notificaciones por evento real de préstamo y gestiona su lectura | Aprobado |
| CP-A09 | HU-09 | `acceptance/notifications-profile-and-ux.spec.ts` | usuario actualiza su perfil, cambia contraseña y reingresa con la nueva credencial | Aprobado |
| CP-A10 | HU-10 | `acceptance/users-requests-and-security.spec.ts` | permisos protegen módulos administrativos y aíslan préstamos entre clientes distintos | Aprobado |
| CP-A11 | HU-11 | `acceptance/notifications-profile-and-ux.spec.ts` | bitácora de auditoría registra y detalla operaciones críticas consultables por admin | Aprobado |
| CP-A12 | HU-12 | `acceptance/payments-and-vouchers.spec.ts` | escaneo OCR con imagen en envío de voucher opera sin error 500 ni caída del servidor | Fallido: Subida de imagen dispara OCR con HTTP 500 y caída del servidor por NO_ADC_FOUND |
| CP-A13 | HU-13 | `acceptance/loans-and-portfolio.spec.ts` | préstamo con inversionista se aprueba en 2 pasos y préstamo pendiente puede rechazarse con observación | Aprobado |
| CP-A14 | HU-14 | `acceptance/payments-and-vouchers.spec.ts` | liquidación total de préstamo pasa a Pagado y eliminación del pago lo revierte a Activo | Aprobado |
| CP-A15 | HU-15 | `acceptance/payments-and-vouchers.spec.ts` | sistema impide voucher duplicado y el rechazo de un voucher conserva intacto el saldo | Aprobado |
| CP-A16 | HU-16 | `acceptance/users-requests-and-security.spec.ts` | administrador rechaza solicitud de acceso con observación y no-propietario respeta restricciones RBAC | Aprobado |
| CP-A17 | HU-17 | `acceptance/notifications-profile-and-ux.spec.ts` | sesión con Recordarme persiste tras recarga, ruta 404 recupera al inicio y Cerrar sesión limpia almacenamiento | Aprobado |
| CP-A18 | HU-18 | `acceptance/notifications-profile-and-ux.spec.ts` | dashboard administrativo y vistas operativas mantienen legibilidad y sin desbordamiento móvil | Aprobado |
