# CRM - CARBO · Etapa 2: Red de relaciones y próximas acciones

Se extiende la etapa 1 sin tocar datos ni permisos existentes: todo sigue limitado al espacio de trabajo y verificado en la base de datos. El Brain queda fuera.

## 1. Equipo dentro de la red
- Cada miembro (Matías, David) puede vincularse a su propia ficha de persona, así "Matías conoce a X" es una relación real de la red.
- Ese vínculo se configura una vez en **Equipo**, con "Esta persona soy yo".

## 2. Relaciones entre personas
- Vínculo persona ↔ persona con tipo (conoce, colega, deriva internamente, deriva a otra empresa, otro), contexto, fuente y verificación.
- Puede haber varios vínculos entre las mismas dos personas. Las afiliaciones a empresas siguen siendo algo distinto y no cuentan como introducción.

## 3. Introducciones dirigidas
Cada una es un evento propio y se conserva aunque se repitan los participantes:
- **Quién presenta**, **a quién** (la persona a la que se presenta) y **destino buscado**. El destino puede ser una persona, una organización o un texto libre "todavía no identificado"; nunca se crea una persona ficticia para ese lugar.
- **Para qué**, contexto, fuente y fecha.
- **Tipo:** pedido pendiente, presentación realizada o conexión hipotética, siempre separados.
- **Estado:** solicitada, en curso, realizada, rechazada o sin respuesta. También responsable (miembro), siguiente acción, fecha de seguimiento y fecha de realización.
- Si el destino se identifica después, se elige una persona existente con aviso de duplicados. La ruta original se mantiene.
- Ninguna presentación se convierte sola en conversación ni en oportunidad.

## 4. Mapa de la red
- Arranca desde un contacto, una organización o desde **IVLP**, que reúne a los miembros del equipo y los contactos con procedencia IVLP.
- Las ramas se expanden con un clic. Distingue personas de organizaciones y cada tipo de vínculo por forma, texto y trazo, no solo por color.
- Los nodos ya visitados no se vuelven a expandir, así que los ciclos no se repiten. Si dos caminos llegan a la misma persona, aparece una sola vez con las dos rutas.
- Incluye búsqueda, filtros por estado y responsable, migas de recorrido y "Volver al origen".
- Hay una vista de lista equivalente con las mismas rutas, y cada ficha muestra sus vínculos. El mapa no es la única forma de trabajar.

## 5. Conversaciones y notas
- Una conversación tiene fecha, resumen y texto. Se vincula con varias personas participantes, organizaciones e introducciones sin duplicarse: aparece en cada ficha vinculada.

## 6. Tareas y pendientes
- Responsable (Matías o David), vencimiento opcional, estado (abierta, en espera, hecha, cancelada) y contexto.
- Se vinculan a persona, organización, introducción o conversación.
- Registran quién la terminó y cuándo.
- **Esperando respuesta de terceros:** de quién, desde cuándo y fecha para revisar el pendiente.
- **Agenda:** vencidas, próximas, sin fecha y en espera, con filtro por responsable.

## 7. Interés comercial de conectores
- En la ficha de persona se marca el interés en referir o vender por comisión: sin hablar, interesada, en conversación, acordado o descartado.
- Se guardan conversación vinculada, notas y condiciones acordadas opcionales.
- Nada calcula pagos ni da por aceptado un acuerdo.

## 8. Fichas con historial
- Persona y organización suman pestañas o secciones: vínculos y rutas de llegada, introducciones, conversaciones, tareas abiertas e historial cronológico.
- Archivar un contacto no borra nada. Su historia sigue visible y marcada "archivado", y las tareas de otros no cambian. En las rutas aparece como nodo archivado.

## 9. Datos de prueba (solo en "Demostración")
- Escenario ficticio: Matías (demo) conoce a una referente institucional, que presenta tres empresas.
- Una interlocutora deriva a ingeniería, y dos caminos distintos llegan al mismo ingeniero.
- Incluye notas, tareas y un pendiente de respuesta. Todo lleva la etiqueta [DEMO]; el espacio Carbo no se toca.

## Verificación
- El ingeniero aparece una sola vez con las dos rutas, sus notas y próximas acciones.
- Ciclo sin expansión infinita y destino sin identificar sin persona ficticia.
- Archivo sin pérdida de historia ni tareas ajenas.
- Admin y colaborador leen y editan; un usuario ajeno no ve nada en las tablas nuevas.
- Persistencia después de recargar.

## Detalles técnicos
- Tablas nuevas, todas con `workspace_id`, auditoría y `archived_at`:
  - `person_links` (from, to, kind, no dirigida/dirigida).
  - `introductions` (introducer_person_id, introduced_person_id, target_person_id?, target_org_id?, target_description?, purpose, kind, status, owner_user_id, next_action, follow_up_at, occurred_at, source).
  - `conversations` más `conversation_links` (polimórfico con FK nullable a persona, organización e introducción).
  - `tasks` (owner_user_id, due_at?, status, waiting_on_person_id?, waiting_since, review_at, completed_by/at, FK nullable de contexto).
  - `commission_interest`.
- `workspace_members.person_id` es opcional, editable solo por el propio usuario mediante una función.
- RLS con `is_workspace_member`, grants explícitos y validación de que todas las FK pertenezcan al mismo espacio.
- Mapa con React Flow (`@xyflow/react`), cargado solo en cliente. La expansión usa un recorrido en anchura con un conjunto de visitados; las aristas se consultan por nodo bajo demanda.
- Seeds de demo en la migración con UUIDs fijos.
