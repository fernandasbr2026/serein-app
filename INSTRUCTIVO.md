# SEREIN · Panel 2026 — Instructivo de publicación

Este proyecto ya está **100% programado**. Tú solo necesitas crear 2 cuentas gratuitas
y hacer clics siguiendo estos pasos. Tiempo estimado: 30–40 minutos la primera vez.

Lo que obtendrás al final:
- Tu app en internet, en una dirección tipo **https://serein.vercel.app**
- Cada usuario entra con **su correo y contraseña** (encriptada y segura)
- Cada quien ve **solo su área** (Santa Rosa, Istria, Proyectos o todo si es gerencia)

---

## PASO 1 — Crear cuenta en GitHub y subir el proyecto (10 min)

GitHub es donde vive el código. Vercel lo lee desde ahí.

1. Entra a **github.com** → "Sign up" → crea tu cuenta (gratis).
2. Ya dentro, clic en el botón **"+"** (arriba a la derecha) → **"New repository"**.
3. Nombre: `serein-panel` → marca **Private** (privado) → clic **"Create repository"**.
4. En la página del repositorio vacío, clic en **"uploading an existing file"**.
5. Arrastra TODO el contenido de esta carpeta (los archivos y carpetas, no el .zip)
   → clic **"Commit changes"**.

> Importante: NO subas el archivo `.env` si lo llegas a crear localmente. El repositorio
> es privado, pero las claves van en Vercel (Paso 3), no en GitHub.

---

## PASO 2 — Crear el proyecto en Supabase (usuarios y contraseñas) (10 min)

1. Entra a **supabase.com** → "Start your project" → crea cuenta (puedes entrar con GitHub).
2. Clic **"New project"**:
   - Name: `serein`
   - Database Password: inventa una y **guárdala** (no la volverás a necesitar seguido)
   - Region: South America (São Paulo) — es la más cercana
   - Plan: **Free**
3. Espera 1–2 min a que se cree. Luego, en el menú lateral:

### 2a. Crear los usuarios
4. Ve a **Authentication → Users → "Add user" → "Create new user"**.
5. Crea un usuario por persona. Ejemplo:
   - Email: `gerencia@serein.cl` (o el correo real de cada quien)
   - Password: una contraseña fuerte para esa persona
   - ✅ Marca **"Auto Confirm User"** (muy importante)
6. Repite para: santarosa@..., istria@..., proyectos@... (los que necesites).

### 2b. Asignar qué ve cada usuario
7. Ve a **SQL Editor → "New query"**.
8. Abre el archivo **`supabase/setup.sql`** de esta carpeta, copia TODO su contenido,
   pégalo en el editor.
9. **Cambia los correos de ejemplo** por los correos reales que usaste en el paso 5.
10. Clic **"Run"**. Debe decir "Success".

### 2c. Copiar las 2 claves que necesita la app
11. Ve a **Project Settings (engranaje) → API**.
12. Copia y guarda en un bloc de notas:
    - **Project URL** (algo como `https://abcd1234.supabase.co`)
    - **anon public** key (un texto largo)

---

## PASO 3 — Publicar en Vercel (la app en internet) (10 min)

1. Entra a **vercel.com** → "Sign up" → **"Continue with GitHub"** (usa la cuenta del Paso 1).
2. Clic **"Add New… → Project"** → verás tu repositorio `serein-panel` → clic **"Import"**.
3. Antes de darle Deploy, abre la sección **"Environment Variables"** y agrega estas 2:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | (pega el Project URL del Paso 2c) |
   | `VITE_SUPABASE_ANON_KEY` | (pega la anon public key del Paso 2c) |

4. Clic **"Deploy"**. Espera 1–2 minutos.
5. ¡Listo! Vercel te da una dirección tipo **https://serein-panel.vercel.app**.
   Ábrela, entra con uno de los correos/contraseñas que creaste, y verás el panel.

---

## PASO 4 (Opcional) — Dominio propio tipo serein.cl

1. Compra el dominio (en Chile: **nic.cl**, ~$10.000 CLP/año; internacional: Namecheap/GoDaddy ~USD 12/año).
2. En Vercel: tu proyecto → **Settings → Domains → Add** → escribe tu dominio.
3. Vercel te mostrará 1 o 2 registros DNS para copiar en el panel de tu proveedor de dominio.
   (Si me pegas la pantalla, te digo exactamente qué poner.)
4. En 5 min – 24 hrs tu app queda en **https://serein.cl**.

---

## Preguntas frecuentes

**¿Cuánto cuesta mantener esto?**
$0/mes con los planes gratuitos de Vercel y Supabase (sobran para este uso).
El único costo opcional es el dominio propio (~USD 10–15/año).

**¿Cómo agrego o quito un usuario después?**
Supabase → Authentication → Users → Add user (o el ícono de basura para quitar).
Luego corre el bloque SQL correspondiente en SQL Editor para asignarle su área.

**¿Cómo cambio una contraseña?**
Supabase → Authentication → Users → clic en el usuario → "Reset password" o "Update password".

**¿Y si quiero actualizar los números del dashboard?**
En esta primera versión los datos están en `src/data.js` (extraídos de tu Excel).
La FASE 2 del proyecto es: subir tu Excel desde la propia app y que todo se actualice solo.
Cuando llegues ahí, vuelve al chat y lo construimos.

**Algo falló y no sé qué hacer.**
Toma captura de pantalla del error y pégala en el chat con Claude. Con eso se resuelve.

---

## PASO 5 (Fase 2) — Sincronización automática con el SII

Decidiste ir por la vía de API automática. El plan recomendado:

1. **Contrata un proveedor de API del SII.** Los más usados:
   - **ApiPyme** (apipyme.cl): prueba de 30 días gratis sin tarjeta; extrae el RCV
     automáticamente cada 2 horas. Plan Starter sirve para 1 empresa.
   - **SimpleAPI** (simpleapi.cl): API key gratuita para partir, planes anuales en UF.
   Ambos piden tu RUT y clave del SII (van cifrados en sus sistemas).

2. **Conecta la función de sincronización** que ya viene programada en
   `supabase/functions/sii-sync/index.ts`. Cuando tengas las credenciales del
   proveedor, vuelve al chat con Claude, pega la documentación que te entregaron,
   y se ajustan los 4-5 nombres de campos en 10 minutos.

3. **Clasificación por área**: la tabla `reglas_clasificacion` ya viene cargada con
   tus clientes actuales (Besalco→Istria, Viman→Santa Rosa, PROASES→Proyectos, etc.).
   Las facturas de clientes o proveedores nuevos quedan "pendientes de clasificar"
   y las asignas con un clic desde la app.

**Importante**: el SII no sabe a qué planta pertenece cada factura — esa inteligencia
vive en las reglas de clasificación de TU app. Mientras más reglas definas, menos
trabajo manual.


