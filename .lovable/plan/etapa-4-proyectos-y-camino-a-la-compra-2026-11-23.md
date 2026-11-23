# Etapa 4 · Proyectos y camino a la compra

Esta etapa se suma a la red existente sin reemplazarla. Se detiene antes de la investigación y la importación masiva.

## Qué va a poder hacer el equipo

1. **Proyectos** (nueva sección «Proyectos», con lista y ficha). Cada proyecto registra:
   - nombre, necesidad, ubicación, etapa del proyecto, evidencia o fundamento, bloqueos y siguiente hito;
   - **potencia (MW)**, **capacidad (MWh)** y **duración (h)**, en campos separados. Cada uno puede quedar vacío como «desconocido»: no se calculan ni se completan valores que nadie cargó;
   - varias organizaciones participantes, y una organización puede estar en varios proyectos.
2. **Roles por proyecto**: comprador contractual posible, usuario final, decisor económico, evaluador técnico, promotor interno y otros.
   - Cada rol puede tener varias personas u organizaciones.
   - Un rol también puede quedar «sin identificar», con una descripción como «evaluador técnico de la planta», sin crear personas de relleno.
   - Al lado de cada persona se ven sus **rutas de acceso** desde la red actual, por ejemplo cómo llegamos al decisor por varios caminos.
3. **Oportunidades**: solo se pueden crear desde un proyecto o caso de uso concreto, y piden una necesidad identificada y un fundamento.
   - Etapas: descubrimiento → validación → propuesta → negociación → ganada / perdida.
   - En cada etapa se registra qué significa avanzar y cuáles son los pendientes conocidos. Cada cambio de etapa queda en el historial.
   - Las relaciones institucionales y las hipótesis de investigación quedan marcadas como «fuera del pipeline» por defecto. Solo cuentan si alguien las incluye a mano.
   - El monto es opcional y lo carga una persona. No hay probabilidades de cierre ni valores estimados.
4. **Tareas con contexto correcto**: una tarea se puede vincular a un proyecto o a una oportunidad, y aparece en esa ficha y en la Agenda.
5. **Brain**:
   - Le podés preguntar sobre un proyecto o una oportunidad: participantes, roles sin identificar, bloqueos, pendientes y rutas.
   - Al pegar un texto, puede proponer proyectos, participantes con su rol, datos técnicos y tareas, con el mismo circuito de revisión de hoy.
   - Si el Brain sugiere una etapa, una clasificación o un monto, siempre queda pendiente de que alguien lo confirme.

## Prueba de aceptación (en «Demostración»)
- Un proyecto con comprador y usuario final distintos (organizaciones diferentes).
- Un decisor económico al que se llega por dos rutas distintas de la red.
- Un evaluador técnico sin contacto identificado.
- Comprobar que la red conserva su historia y que las tareas aparecen en el proyecto y la oportunidad que corresponden.
- Lo que se sume como ejemplo queda etiquetado como demo; el espacio «Carbo» no se toca.

## Detalles técnicos
- Tablas nuevas, todas con `workspace_id`, RLS por miembro, grants, auditoría y archivo:
  - `projects`: `need`, `location`, `project_stage` (texto), `evidence`, `blockers`, `next_milestone`, `power_mw`, `energy_mwh` y `duration_h` (numeric nullable, sin derivar uno de otro), más procedencia/verificación.
  - `project_organizations`: N:N entre proyectos y organizaciones.
  - `project_participants`: `project_id`, `role` (enum: buyer, end_user, economic_decider, technical_evaluator, internal_champion, other), `person_id` o `organization_id` o `unidentified_description` (exactamente uno), y `notes`.
  - `opportunities`: `project_id` obligatorio, `need` y `rationale` not null, `stage` (enum discovery/validation/proposal/negotiation/won/lost), `advance_criteria`, `known_pending`, `in_pipeline` (por defecto false si la procedencia es una hipótesis o la relación es institucional), `amount` (nullable) y `amount_confirmed`. No hay columna de probabilidad.
  - `opportunity_stage_events`: historial de cambios de etapa.
- `tasks`: se agregan `project_id` y `opportunity_id` (nullable), validados para que pertenezcan al mismo espacio.
- Rutas de acceso: se reutiliza `src/lib/network.ts` con la persona del participante como destino.
- Brain:
  - `gather` suma los focos `project` y `opportunity`.
  - `brain_proposals.kind` suma `project`, `participant` y `project_update`.
  - `confirm_extraction` crea o vincula proyectos y participantes. Los cambios de etapa o de monto propuestos se guardan como pendientes hasta la confirmación explícita y nunca se aplican solos.
- UI: rutas `/proyectos`, `/proyectos/$id`, `/oportunidades` (pipeline simple por etapa, solo con `in_pipeline`) y una sección «Proyectos» en las fichas de organizaciones y personas.
- Pruebas vitest para estas reglas:
  - una oportunidad sin proyecto, necesidad o fundamento es rechazada;
  - las hipótesis quedan fuera del pipeline;
  - un participante «sin identificar» es válido;
  - MW, MWh y h no se derivan entre sí;
  - las propuestas del Brain de etapa o monto quedan pendientes.
- Además, verificación en el navegador del caso de aceptación.
