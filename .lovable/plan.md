# Brain como punto de contacto del CRM

El Inicio pasa a ser un chat con el Brain, como ChatGPT o Claude. Los módulos actuales (Personas, Organizaciones, Proyectos, Agenda, etc.) siguen existiendo como estructura y vista, y el Brain los completa por nosotros.

## Lo que vas a ver
- **Inicio = Brain**: una lista lateral con tus chats, el botón «Nuevo chat» y cada chat con su propia dirección. Cada uno ve solo sus chats (David no ve los tuyos ni vos los de él). Los datos del CRM que se crean sí son compartidos en el espacio.
- **Escribir o pegar cualquier cosa**: preguntas («¿qué sabemos de Empresa Alfa?»), órdenes («agendame llamar a Diego el jueves»), novedades, emails, notas o transcripciones. También se pueden adjuntar archivos de texto, PDF o CSV/XLSX de agenda IVLP.
- **El Brain actúa directo y avisa**: cada respuesta muestra tarjetas con lo que hizo, por ejemplo «Creé la persona Carla Ruiz», «Vinculé a Carla con Empresa Beta como Gerenta» o «Agregué la tarea…». Cada tarjeta tiene un enlace a la ficha y un botón **Deshacer**.
- **Pregunta cuando falta algo**: si hay ambigüedad (dos «Juan López», una organización que no existe, una fecha que no está clara), no adivina. Pregunta en el chat con opciones para elegir y sigue cuando respondés.
- **Detecta lo incompleto**: al terminar, sugiere qué falta, por ejemplo «El proyecto no tiene evaluador técnico» o «Diego no tiene email». No inventa los datos que faltan.
- **Consulta y busca**: puede responder sobre la red, los proyectos, las oportunidades y la agenda; buscar rutas de acceso a una persona; lanzar una investigación web sobre una organización; y redactar un pedido de introducción (sin enviarlo).
- **Contexto de página**: desde cualquier ficha, un botón «Hablar con el Brain sobre esto» abre un chat ya enfocado en esa persona, organización o proyecto.
- **Registro de actividad**: una pantalla «Actividad del Brain» con todo lo que hizo, quién lo pidió, en qué chat y si se deshizo.

## Reglas que se mantienen aunque actúe directo
- Nunca inventa valores: MW, MWh, horas, montos, fechas ni probabilidades salen solo de lo que vos escribiste o pegaste. No hay probabilidades de cierre.
- Oportunidades, etapas y montos solo los toca si se lo pedís explícitamente, y siempre con necesidad y fundamento.
- No fusiona personas duplicadas ni elige entre homónimos: pregunta.
- No asume que alguien conoce a otro por estar en la misma reunión o asociación.
- Archiva, nunca borra. «Deshacer» archiva lo que creó o restaura el valor anterior.
- El texto pegado se guarda tal cual como fuente, y cada dato creado indica de qué chat y fuente vino.
- La investigación web y las capacidades de Carbo siguen con sus reglas (fuentes con cita, solo capacidades aprobadas).
- No envía emails ni mensajes a nadie.

## Sugerencias incluidas
- **Resumen al entrar**: el chat nuevo arranca con tareas vencidas, lo que está esperando respuesta y los proyectos con huecos, con atajos tipo «Ver vencidas».
- **Atajos rápidos**: «Pegar email», «Cargar agenda IVLP», «Investigar organización», «¿Qué tengo esta semana?».
- La navegación actual queda en una barra secundaria bajo «Módulos».

## Pruebas al terminar
- Pegar un email con una persona nueva, una existente y un proyecto: verificar lo creado, las preguntas por ambigüedad y Deshacer.
- Pedir una tarea con fecha y responsable; hacer una consulta sobre un proyecto con citas.
- Comprobar que otro miembro no ve tus chats pero sí los datos creados.
- Comprobar que no aparecen valores inventados.

## Detalles técnicos
- Tablas nuevas: `brain_threads` (con `owner_user_id`; RLS para que solo el dueño lo vea y dentro de su espacio), `brain_messages` (partes del mensaje en JSON con texto y resultados de herramientas) y `brain_actions` (registro con tabla, id, antes/después, `undone_at`). Los registros creados llevan la fuente `brain_thread_id` vía `source_detail`.
- Ruta `/` → chat; `/chat/$threadId` como página de cada hilo dentro de `_authenticated`. Interfaz con AI Elements (transcripción, composer, tarjetas de herramientas colapsadas).
- Server route con streaming (`streamResponse` del gateway, modelo `openai/gpt-6-astra`) y autenticación por bearer. Bucle de herramientas en el servidor con el cliente RLS del usuario: `search_records`, `get_record`, `create_person`, `create_org`, `add_affiliation`, `create_task`, `update_record`, `log_conversation`, `create_project`, `add_participant`, `find_routes`, `ask_user` (pregunta con opciones), `run_research`, `draft_intro`.
- Las herramientas validan en el servidor: los números deben aparecer literalmente en el mensaje del usuario, las personas pasan por `find_person_duplicates` antes de crearse (si hay coincidencia, `ask_user`) y las oportunidades exigen pedido explícito.
- Cada escritura queda en `brain_actions`; «Deshacer» es una función SQL que archiva o restaura. Se actualizan las reglas de `AGENTS.md` (el Brain escribe directo con registro y deshacer, en lugar de revisión previa) y se guarda tu preferencia de autonomía.
- Los adjuntos PDF se convierten a texto en el servidor; los CSV/XLSX abren el importador IVLP existente con la vista previa.
