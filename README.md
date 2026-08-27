# NEXA — Sistema de Gestión de Préstamos

NEXA administra el ciclo completo de una empresa de préstamos: clientes,
préstamos, cuotas, pagos, capital, cobros y reportes — con una arquitectura
preparada para incorporar WhatsApp y un chatbot de atención al cliente en una
fase posterior.

Esta es la primera versión (MVP) funcional: todos los datos se leen y
escriben en una base de datos PostgreSQL real vía Supabase, no hay datos
inventados en la interfaz.

## Tecnologías

- [Next.js 16](https://nextjs.org/) (App Router) + React 19 + TypeScript estricto
- [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [Supabase](https://supabase.com/) (PostgreSQL, Auth, Row Level Security)
- [Zod](https://zod.dev/) + [React Hook Form](https://react-hook-form.com/)
- [Recharts](https://recharts.org/) para los gráficos del Dashboard
- [Lucide](https://lucide.dev/) para iconos

## Estructura del proyecto

```
/app                # Rutas (App Router): (app)=zona autenticada, login, auth
/components          # Componentes de UI, organizados por módulo
/lib
  /finance            # Lógica financiera pura (cálculo de préstamos, reparto de pagos)
  /supabase           # Clientes de Supabase (browser, server, middleware)
  /validations        # Esquemas Zod
  /reports            # Exportación CSV/PDF
  /utils              # Formateo, WhatsApp, etc.
/services            # Acceso a datos (una función por operación de negocio)
/types               # Tipos de la base de datos y de dominio
/database
  /migrations         # SQL a ejecutar en Supabase, en orden
  /seed               # Script de datos de prueba
```

La lógica financiera (`lib/finance/loan-calculator.ts`,
`lib/finance/payment-allocator.ts`) está completamente separada de los
componentes visuales: ningún componente calcula intereses o reparte pagos por
su cuenta, todos llaman a estas funciones.

## Requisitos

- Node.js 20 o superior
- Una cuenta gratuita en [supabase.com](https://supabase.com)

## 1. Instalación

```bash
npm install
```

## 2. Crear y configurar el proyecto de Supabase

1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. Elige nombre, contraseña de base de datos y región. Espera a que se aprovisione.
3. Ve a **Project Settings → API** y copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (solo para el seed, nunca la expongas al navegador)
4. Ve a **SQL Editor** y ejecuta, **en orden**, cada archivo de
   `database/migrations/` (0001 → 0008). Puedes pegar el contenido de cada
   archivo y darle "Run" uno por uno. Ver `database/migrations/README.md`
   para el detalle de qué hace cada uno.

## 3. Variables de entorno

```bash
cp .env.example .env.local
```

Completa `.env.local` con los valores del paso anterior:

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-publica
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 4. Datos de prueba (opcional pero recomendado)

Con las migraciones ya ejecutadas y `.env.local` completo:

```bash
npm run seed
```

Esto crea:

- Un usuario administrador (por defecto `admin@nexa.local` / `NexaAdmin2026!`
  — puedes sobrescribir con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` como
  variables de entorno antes de correr el comando).
- 5 clientes de ejemplo (Juan Pérez, María Rodríguez, Pedro Gómez, Ana
  Martínez, Carlos Fernández).
- 5 préstamos que cubren los estados: activo con pago parcial, pagado por
  completo, vencido, con interés sobre saldo insoluto, y recién otorgado.
- Un aporte de capital inicial de RD$50,000.
- Dos conversaciones de ejemplo en la bandeja de WhatsApp.

**Cambia la contraseña del usuario admin antes de usar esto en producción.**

## 5. Desarrollo local

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) — te redirige a
`/login`. Usa las credenciales del seed o crea un usuario nuevo desde
Supabase Auth (el primer usuario que se registre queda como `admin`
automáticamente; los siguientes entran como `cobrador` y un admin debe
ajustarles el rol desde **Configuración → Usuarios**).

## 6. Build de producción

```bash
npm run build
npm run start
```

## Comandos disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build de producción |
| `npm run lint` | ESLint |
| `npm run seed` | Carga datos de prueba en Supabase |

## Roles

| Rol | Acceso |
|---|---|
| **Admin** | Completo, incluye cambiar roles de usuario y cancelar préstamos |
| **Supervisor** | Operativo completo, no administra usuarios |
| **Cobrador** | Clientes, préstamos, pagos y cobros |

Los permisos se aplican en dos capas: Row Level Security en Postgres (qué
filas puede leer/escribir cada rol) y privilegios de tabla que obligan a que
las operaciones financieras (crear préstamo, registrar pago, mover capital)
pasen siempre por las funciones RPC de `0005_rpc_business_logic.sql`, nunca
por un INSERT directo desde el navegador.

## Módulos incluidos en este MVP

- Autenticación (login, recuperación de contraseña, sesión protegida)
- Dashboard con métricas y gráficos calculados en tiempo real
- Clientes (alta, edición, búsqueda, perfil con historial)
- Préstamos (cálculo en vivo, generación automática de cuotas)
- Pagos (reparto automático capital/interés, cascada entre cuotas)
- Cobros (pagos de hoy, próximos, vencidos, clientes morosos)
- Capital (aportes, retiros, ajustes, historial de movimientos)
- Reportes básicos con exportación a CSV/Excel
- Interfaz de WhatsApp/Chatbot (bandeja preparada, sin API real todavía)
- Configuración (usuarios y roles funcionando; el resto de secciones quedan
  como estructura preparada para una fase posterior)

## Qué queda para una fase posterior

- Integración real con la API de WhatsApp Business y respuestas automáticas del chatbot
- Exportación a PDF (la estructura ya está separada en `lib/reports/pdf.ts`)
- Mora, penalizaciones, pagos anticipados y refinanciamiento como reglas de negocio explícitas
- Pagos en línea, SMS, notificaciones automáticas
- Administración avanzada de permisos por pantalla

## Decisiones que deben tomarse antes de producción

1. **Reglas de mora/penalización**: no están definidas — hoy "vencido" solo
   se calcula por fecha, sin cargos adicionales.
2. **Política de reparto de pago dentro de una cuota**: el MVP reparte cada
   pago proporcionalmente entre capital e interés según la composición
   original de la cuota (`lib/finance/payment-allocator.ts`). Si el negocio
   requiere "interés primero", es un cambio acotado a ese archivo.
3. **Rotación de la contraseña del usuario admin de seed** y de la
   `service_role key` antes de ir a producción.
4. **Backups y retención** de la base de datos (configurables desde el panel de Supabase).
