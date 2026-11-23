# CRM - CARBO · Etapa 1: Base compartida

Primera etapa del CRM privado de Carbo Energy: acceso por invitación, espacio de trabajo compartido, directorio de personas y organizaciones. Sin mapa, introducciones, tareas, proyectos, IA, facturación ni stock (etapas futuras).

## Estética (kit Carbo)
- Fondo papel mineral `#F3F0E8`, paneles blancos con borde fino, sin sombras ni gradientes.
- Sidebar deep teal `#023436`, acción primaria petroleum teal `#037971`, foco mint `#00E5A8`.
- Inter para interfaz; Space Mono para etiquetas, fechas, IDs y estados.
- Esquinas casi cuadradas (2–4px), controles de 44–48px, estados siempre con texto.
- Todo en español.

## Acceso y permisos
- Lovable Cloud con email y contraseña. Registro público deshabilitado: solo se entra con invitación.
- Matías es el primer administrador (se lo da de alta con su email al configurar; no hay alta abierta).
- El admin genera un enlace de invitación único, de un solo uso y con vencimiento, para David (rol colaborador). Sin servicio de correo configurado, la app muestra el enlace para copiarlo y enviarlo a mano; no simula un envío. Queda como pendiente real conectar un envío de correos.
- Colaborador: lee y edita todos los datos comerciales del espacio. Admin: además invita y gestiona miembros.
- Los permisos se aplican en la base de datos (reglas por espacio de trabajo), no solo ocultando botones. Quien no es miembro no ve ni modifica nada.

## Espacios de trabajo
- Espacio "Carbo" real, vacío al inicio.
- Espacio "Demostración" separado, con ejemplos claramente etiquetados como ficticios. Selector de espacio en la barra lateral.

## Personas
- Nombre (obligatorio), medios de contacto opcionales (varios emails/teléfonos/LinkedIn, ninguno obligatorio), ubicación, contexto del vínculo, notas.
- Roles de la persona: conector, referente técnico, posible colaborador comercial (múltiples). Nunca se infiere autoridad de compra desde el cargo.
- Afiliaciones a varias organizaciones: cargo/rol, fecha desde/hasta o "vigencia desconocida", actual o pasada.

## Organizaciones
- Nombre, país/ubicación, sitio web, descripción.
- Roles múltiples: institución, comprador potencial, socio, validador.
- Ficha muestra las personas afiliadas.

## Procedencia y verificación
- Cada persona, organización y afiliación lleva fuente: Personal / IVLP / Investigación pública / Hipótesis, más detalle de la fuente.
- Estado de verificación: sin verificar, verificado, en duda.

## Directorio y fichas
- Directorio con pestañas Personas / Organizaciones, búsqueda por nombre, organización, ubicación y filtros por rol, fuente, verificación y archivados.
- Fichas editables con historial básico: creado por / fecha, último cambio por / fecha.
- Archivar y restaurar (no se borra).
- Antes de crear, aviso de posibles duplicados (nombres similares, email o teléfono coincidente) con opción de abrir el existente o crear igual. Nunca se fusiona automáticamente.

## Verificación al terminar
- Matías crea persona sin email y organización; se detecta un duplicado al crear un homónimo.
- David, invitado, ve y edita los mismos registros.
- Un usuario no miembro no puede leer ni modificar (prueba contra la base, no solo la UI).
- Una persona con dos afiliaciones; edición y archivo persisten tras recargar.
- Resumen final con lo implementado, cómo se verificó y pendientes reales.

## Detalles técnicos
- Tablas: workspaces, workspace_members (rol admin/colaborador en tabla aparte), invitations (token hasheado, vence, un uso), people, person_contacts, organizations, affiliations (persona ↔ organización, N:N), con source_type, source_detail, verification_status, archived_at, created_by/updated_by/created_at/updated_at (triggers).
- RLS con función security definer `is_workspace_member` / `is_workspace_admin`; grants explícitos.
- Aceptación de invitación por server function: valida token y crea la cuenta y la membresía; signup público deshabilitado en la configuración de auth.
- Duplicados: extensión pg_trgm con similitud de nombre normalizado (sin acentos) + coincidencia exacta de contactos.
- Modelo preparado para futuras relaciones (introducciones, conversaciones, proyectos) referenciando people/organizations por id.
- Tests de permisos y reglas de duplicados junto a los existentes.
