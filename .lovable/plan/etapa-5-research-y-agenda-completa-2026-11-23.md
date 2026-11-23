# Etapa 5 · Research y agenda completa

Se detiene al final para revisión. No se modifica la red, proyectos ni el espacio «Carbo» salvo por acciones confirmadas por el usuario.

## 1. Ficha de capacidades de Carbo
- Nueva sección **Capacidades** (por espacio): aplicaciones, límites, evidencia, referencias y «autorizado a comunicar».
- Cada capacidad tiene estado: borrador, en revisión, aprobada, retirada. Solo David o Matías (administradores del espacio) pueden aprobar; queda registro de quién y cuándo.
- Datos comerciales no aprobados quedan marcados como internos y el Brain nunca los usa como hecho público ni los incluye en borradores de introducción.

## 2. Research bajo pedido
- Botón «Investigar» en fichas de organización (institución o empresa): miembros, proyectos y necesidades.
- Usa un servicio de búsqueda web real (Firecrawl, conectado desde un aviso en el chat). Cada resultado guarda URL, fecha de consulta, fecha de publicación si existe, cita textual de evidencia y condición hecho/hipótesis.
- Resultado sin cita verificable en la página fuente se degrada a hipótesis o «evidencia insuficiente».
- Sin búsqueda configurada o si falla: mensaje explícito, sin respuesta inventada; el usuario puede pegar URLs o texto de fuentes propias, que se procesan igual.
- La pertenencia a una asociación se registra como dato de la organización, nunca como acceso personal por nuestros contactos.
- Contraste con capacidades **aprobadas**: encaje posible, dudas y qué validar, citando capacidad y fuente; prohibido «ideal» sin respaldo.
- Todo se presenta como propuestas en la revisión existente (aceptar/corregir/rechazar) antes de crear o modificar cuentas, contactos, vínculos o proyectos.
- El Brain puede redactar un pedido de introducción (borrador copiable); no hay envío.

## 3. Importación agenda IVLP (CSV/XLSX)
- Pantalla **Agenda → Importar**: subir archivo, elegir hoja y fila de encabezado, mapear columnas (persona, cargo, organización, email, teléfono, fecha, ciudad, reunión, notas).
- Vista previa con validación por fila (errores y advertencias), conteos totales y posibles duplicados contra personas/organizaciones existentes y dentro del lote (homónimos, organización repetida). El usuario decide por fila: crear nuevo, asociar a existente u omitir.
- Procedencia separada: «origen del viaje IVLP» (reunión, fecha, ciudad) distinto del origen de email/teléfono.
- Los participantes de una misma reunión quedan vinculados a la reunión, no entre sí.
- Lote identificado por huella del archivo: reimportar el mismo archivo no duplica.
- Antes de aplicar se muestra el efecto real (X personas nuevas, Y asociadas, Z organizaciones, N reuniones) y se pide confirmación.
- Reversión del lote: archiva solo lo creado por el lote que no tenga notas, relaciones, tareas o cambios posteriores; lo demás se conserva y se informa.

## 4. Pruebas y cierre
- Lote de prueba en «Demostración»: persona sin email, dos homónimos, organización repetida, campos faltantes; reintento sin duplicar y reversión con una nota agregada después.
- Research: una consulta real con fuentes inspeccionables, un resultado sin evidencia suficiente y un fallo de búsqueda simulado.
- Tests automáticos de las reglas (evidencia → hecho/hipótesis, duplicados, idempotencia, reversión). Limpieza de datos de prueba.

## Detalles técnicos
- Migración nueva: `carbo_capabilities`, `research_runs`, `research_findings` (url, fetched_at, published_at, quote, kind), `import_batches` (file_hash único por espacio), `import_rows`, `meetings` + `meeting_participants`; referencias `import_batch_id` en registros creados. RLS por `workspace_id`, aprobación con `is_workspace_admin`.
- Research en `src/lib/research.functions.ts` (requireSupabaseAuth); Firecrawl search+scrape vía conector; LLM vía AI gateway con verificación de citas contra el markdown descargado. Propuestas reutilizan `brain_proposals` y `confirm_extraction` (extendido para hallazgos e importación).
- Parseo con `xlsx` (SheetJS) y parser CSV con comillas, en el navegador; aplicación transaccional vía función SQL `apply_import_batch` / `revert_import_batch`.
