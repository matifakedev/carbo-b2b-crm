# Ajustes: confiabilidad, research, Brain, archivos y visual

El documento trae 5 etapas. Propongo hacerlas en orden de dependencia, una por pedido, y detenerme al final de cada una para tu revisión. Este plan detalla la **Etapa 1** y deja el resto delineado.

## Orden propuesto

```text
1 Confiabilidad de datos y acciones  -> base para todo lo demás
2 Exactitud del research             -> usa escrituras seguras de la 1
3 Brain con contexto y acciones de red -> usa 1 y 2
4 PDFs y archivos en el Brain         -> usa lote revisable de la 3
5 Ajuste visual moderado              -> al final, sobre pantallas estables
```

## Etapa 1 (este pedido)

**1. Cambios del Brain en una sola operación**
- Cada herramienta del chat que escribe (persona, organización, afiliación, contacto, tarea, conversación, necesidad, proyecto, participante, vínculo) pasa a una función en la base que guarda en un solo paso: el cambio, sus vínculos, la procedencia, la auditoría y el registro para deshacer. Si cualquier parte falla, no queda nada aplicado y el Brain informa el fallo, no un éxito.
- Clave de operación única por pedido: si el mensaje se envía dos veces o se corta la respuesta, se devuelve el resultado ya guardado sin repetir efectos.

**2. Deshacer sin pisar trabajo posterior**
- Cada acción guarda la versión del registro. Al deshacer, se compara campo por campo: lo que otra persona cambió después se conserva y se explica el conflicto (caso Matías A→B, David B→C: queda C).
- No se archivan registros que fueron usados después, ni se borran contactos editados.
- Reversión de importaciones: deja de usar el margen de 5 segundos; compara el estado real y revisa todas las dependencias (tareas que esperan respuesta de esa persona, necesidades, conversaciones, introducciones, proyectos, contactos, afiliaciones y reuniones). Muestra qué se revirtió y qué se conservó, con motivo.

**3. Tu propia ficha en la red**
- Antes de crear la ficha de Matías o David, el Brain busca fichas parecidas; si hay duda, pregunta. Nunca reusa en silencio una ficha archivada.
- Crear la ficha y asociarla a tu usuario ocurre junto, seguro ante pedidos simultáneos; deshacer revierte ambas cosas.

**4. Espacios e invitaciones**
- La base rechaza vínculos entre registros de espacios distintos, al crear y al editar, aunque se llame directo al backend.
- Aceptar una invitación con una cuenta ya existente, verificando que el email de la sesión coincide con el invitado.
- La invitación solo se marca aceptada si la membresía quedó creada; se puede reintentar sin duplicar y se revalida vencimiento y revocación al canjear.

Todo con migraciones nuevas, sin reescribir las anteriores ni borrar datos.

## Pruebas de la Etapa 1
- Automáticas contra la base de prueba (sin servicios pagos ni datos reales): doble envío sin duplicados; fallo forzado de auditoría sin cambios aplicados; A→B→C con deshacer que conserva C; reversión de importación que conserva lo tocado después; referencia a otro espacio rechazada; invitación con cuenta existente, email distinto rechazado, vencida/revocada rechazada, reintento idempotente.
- Recorrido real en Demostración desde el chat.
- Al cerrar: lista de lo resuelto, lo que falta, lo que necesita configuración externa y lo no verificado.

## Etapas siguientes (resumen)
- **2 Research:** tres niveles (explorar / vínculo+señal documentados / calificada con criterios explícitos, no por tener capacidades aprobadas); recomendación construida solo desde candidatas retenidas, no con filtros de palabras; estado final calculado después de guardar propuestas; contar lecturas de búsquedas y reintentos; tiempo límite compartido con reserva para sintetizar; 429 también leyendo `retry_after_seconds`; mismo comportamiento en prospección, research general e identificación de organizaciones.
- **3 Brain:** contexto de Carbo editable (capacidades, límites, evidencia, perfil buscado: grandes proyectos y muchas horas, info sin verificar, afirmaciones comunicables, sensible); herramientas de red, rutas, compromisos, tareas filtradas, eventos de introducción y derivaciones; alcance declarado de cada consulta; fechas según zona horaria del espacio; lote revisable en el chat (aceptar/corregir/descartar/asociar); original guardado desde el servidor.
- **4 Archivos:** adjuntos en el chat (PDF, TXT/MD/EML, DOCX, CSV/XLSX; imágenes escaneadas a evaluar), guardado privado por espacio, estados de procesamiento, sin truncado silencioso, propuestas con fragmento de origen, detección de archivos repetidos, magnitudes con número+unidad+fragmento+proyecto.
- **5 Visual:** esquinas suavizadas, bordes sutiles, menos cajas, estados de foco/carga, progreso por etapas y streaming en el chat, móvil y teclado, movimiento reducido.

## Detalles técnicos (Etapa 1)
- Nueva función SQL `brain_apply(_ws, _thread, _op_key, _ops jsonb)` SECURITY INVOKER: ejecuta las operaciones, inserta `brain_actions` con `before/after` y `version` dentro de la misma transacción; tabla `brain_operations(op_key unique per workspace, result jsonb)` para idempotencia.
- `brain_actions.after` como snapshot; `brain_undo_action` reescrito: bloqueo `FOR UPDATE`, revierte solo campos cuyo valor actual == `after`, devuelve conflictos.
- Columnas `version` (o `updated_at` comparado) en tablas editables por el Brain.
- `revert_import_batch` reemplazado vía nueva migración: compara contra el snapshot del lote y consulta dependencias.
- Triggers `*_ws_consistency` BEFORE INSERT OR UPDATE en tablas con FKs cruzadas.
- `link_my_person` atómico con `pg_advisory_xact_lock` por usuario; undo contempla `workspace_members.person_id`.
- `accept_invitation` server function: valida email de sesión, inserta membresía e invitación en una sola función SQL.
