# Brain comercial: investigar una puerta de entrada desde el chat

## Diagnóstico (estado actual)
- El chat (`chat-agent.ts` / `chat.functions.ts`) tiene 13 herramientas: buscar/leer registros, crear persona/organización/proyecto/tarea, afiliación, contacto, conversación, necesidad, participante y `ask_user`. **Ninguna accede a la web, al research previo ni a las capacidades de Carbo.** Por eso registra a Joaquín y pide una URL.
- `search_records` busca solo personas, organizaciones, proyectos y tareas por nombre: no busca en conversaciones, hallazgos de research ni capacidades.
- El research existe (`runResearch`): búsqueda Firecrawl, hallazgos con cita textual verificada (sin cita = «insuficiente»), propuestas revisables, encaje solo con capacidades aprobadas y borrador de pedido de introducción. Pero es una server function de la UI, exige una organización ya creada y no se puede invocar desde el chat.
- No hay forma de distinguir organizaciones homónimas antes de crearlas (p. ej. varias «AIM» en USA).

## Comportamiento objetivo para el caso de prueba
1. Registra lo aportado por el usuario (Joaquín Prueba, gerente, AIM, USA) como **dato aportado**, sin investigar a la persona.
2. Busca contexto interno: AIM en organizaciones, conversaciones, research anterior y capacidades aprobadas.
3. Si no hay research reciente, busca candidatos de «AIM USA» en la web. Si hay varios, pregunta cuál con opciones concretas (nombre, web, una línea). Nunca pide una URL que pudo encontrar.
4. Con la organización elegida, ejecuta el research existente y responde en 4 bloques: **Aportado por vos**, **Evidencia pública (con URL y fechas)**, **Hipótesis de encaje con Carbo** y **Conexiones sin confirmar**.
5. Entrega empresas o proyectos candidatos con fuente, motivo de encaje, dudas y un pedido de introducción concreto para Joaquín (para copiar, no se envía). Dice explícitamente que ser miembro de AIM no implica que Joaquín conozca a esa empresa.
6. Los cambios que salen del research (nuevas organizaciones, necesidades, vínculos) quedan como **propuestas para revisar** con su fuente, no como hechos. Lo que dijo el usuario se sigue guardando directo, con opción de deshacer.

## Incremento mínimo (sin módulos nuevos ni cambio de modelo)
1. **Separar el núcleo del research** en una función de servidor reutilizable, compartida por la pantalla actual y por el chat, con el mismo comportamiento y las mismas validaciones.
2. **Nuevas herramientas del chat:**
   - `get_context`: conversaciones, notas, research previos (hallazgos con su condición) y capacidades aprobadas relacionadas con un término u organización.
   - `find_organization_candidates`: búsqueda web liviana que devuelve candidatos (nombre, URL, descripción) **sin guardar nada**. Si la búsqueda no está configurada o falla, lo dice y ofrece que el usuario aporte una fuente.
   - `research_organization`: ejecuta el research para una organización del CRM con un enfoque (p. ej. «miembros y proyectos que necesiten almacenamiento»). Devuelve hallazgos con URL, fechas y condición, encaje, dudas, borrador de introducción y cantidad de propuestas creadas.
   - `draft_intro_request`: arma el pedido para el intermediario (a quién, por qué, qué validar), solo con texto comunicable aprobado. No envía nada.
3. **Reglas del Brain** (instrucciones del chat):
   - Detectar la intención principal antes de actuar (investigar/estrategia vs. solo registrar).
   - Orden: contexto interno → candidatos → pregunta por homónimos → research.
   - No buscar en la web personas nombradas por el usuario; solo organizaciones.
   - Formato de respuesta en los 4 bloques; sin «ideal» sin respaldo; sin probabilidades ni montos.
   - Las conexiones de una persona con miembros de una asociación son siempre hipótesis hasta que el usuario las confirme.
4. **Interfaz del chat:** mostrar los resultados del research como una tarjeta con fuentes clicables, la etiqueta hecho/hipótesis/insuficiente y un enlace a «Revisar propuestas». Si no hay búsqueda configurada, un aviso claro.

## Pruebas
- **Automáticas** (sin red): formato de candidatos ante homónimos; un hallazgo sin cita queda «insuficiente»; una conexión derivada de pertenencia a AIM nunca se guarda como vínculo personal; el pedido de introducción no usa capacidades no aprobadas; sin búsqueda configurada se devuelve el aviso, no una respuesta de memoria; la herramienta de candidatos no escribe en la base.
- **Recorrido real en «Demostración»** con el mensaje del caso: verificar que (a) se crea Joaquín con lo aportado, sin buscarlo en la web; (b) aparecen candidatos de AIM o una pregunta concreta; (c) tras elegir, se ve el research con URLs y fechas; (d) los candidatos de introducción quedan como propuestas, no como vínculos; (e) el borrador de pedido aparece y no se envía. Además: un fallo de búsqueda simulado y un resultado sin evidencia. Al final se borran los datos y el usuario de prueba.

## Fuera de alcance
Respuestas en streaming, lectura de PDF, cambio de modelo, oportunidades o etapas desde el chat, envío de mensajes.

## Detalles técnicos
- Mover el cuerpo de `runResearch` a `src/lib/research.server.ts` (`executeResearch(sb, input)`); `runResearch` y el chat lo llaman. Las reglas puras nuevas (formato de candidatos, salida de 4 bloques, bloqueo de búsquedas sobre personas) van en `src/lib/chat-agent.ts`.
- `find_organization_candidates` usa `fcSearch` con límite 5, sin escribir en tablas; resultado guardado en `brain_messages` para mostrarlo.
- El research desde chat se registra en `brain_actions` como acción informativa (no deshacible); sus propuestas siguen pasando por `confirm_extraction`.
- Firecrawl sigue en modo directo; un research consume aprox. 1 búsqueda + scrapes; el chat ejecuta como máximo un research por turno.
- Actualizar `AGENTS.md` con la regla «research desde el chat usa el mismo núcleo y solo genera propuestas».
