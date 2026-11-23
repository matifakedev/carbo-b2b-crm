# Etapa 3 · Brain contextual y conversaciones

Se detiene antes de investigación web. La edición manual sigue igual y funciona aunque el Brain no esté configurado.

## Qué va a poder hacer el equipo

1. **Preguntarle al Brain** desde la ficha de una persona u organización, desde una introducción y desde una conversación. Por ejemplo: "¿cómo llegamos?", "¿qué sabemos?", "¿qué falta confirmar?", "¿qué compromisos hay?", "¿cuál sería un próximo paso razonable?".
   - Cada respuesta separa **Hechos**, **Hipótesis** y **Desconocidos**, y cita los registros consultados con enlaces.
   - Aclara qué alcance usó, por ejemplo: "consulté esta ficha, 2 introducciones y 1 conversación". Nunca afirma que vio toda la red.
   - Solo usa datos confirmados del espacio actual. Los borradores no se usan como hechos.
2. **Pegar un email, notas o una transcripción** (en una conversación nueva o existente). Se guarda el texto original sin cambios, y el Brain propone:
   personas, afiliaciones, introducciones, necesidades y tareas, cada una con el fragmento exacto que la respalda.
   - Distingue lo realizado de lo posible: "podría presentarte" queda como introducción *propuesta/pendiente*, no como realizada. "Habría que hablar" queda como tarea *sin confirmar*, no como compromiso.
   - Lo ambiguo queda marcado como "a resolver".
3. **Revisar antes de guardar**: para cada propuesta podés aceptar, corregir o rechazar. También podés asociarla a un contacto existente, con duplicados sugeridos, o crear uno nuevo.
   - El botón Confirmar muestra tres estados: guardando, guardado y falló (con reintento). Si se hace doble clic o se reintenta, no se generan duplicados.
   - Queda registro de quién aceptó cada propuesta, cuál fue la fuente y qué corrigió.
4. **Estados claros**: pensando, error del proveedor y "Brain no configurado". Nunca se muestran respuestas simuladas.

## Seguridad
- El modelo se llama solo desde el servidor, con la credencial del gateway de Lovable AI. El servidor verifica que seas miembro del espacio y solo recupera datos de ese espacio.
- El texto pegado se trata como contenido, no como órdenes: va delimitado, y el sistema le indica explícitamente al modelo que ignore instrucciones que vengan dentro del texto.
- No se envían emails, no se contacta a nadie y no hay procesos corriendo en segundo plano.

## Detalles técnicos
- Tablas nuevas (con RLS por `workspace_id`, grants y auditoría):
  - `source_documents`: texto original, tipo y conversación vinculada.
  - `brain_extractions`: estado `draft/confirmed/failed`, modelo utilizado y `idempotency_key` única.
  - `brain_proposals`: tipo, payload propuesto, fragmento, estado `pending/accepted/corrected/rejected/ambiguous`, payload final, `decided_by/at` y el id del registro creado.
  - `brain_queries`: registro de cada pregunta con su alcance y los ids citados.
- Confirmación mediante una función SQL transaccional `confirm_extraction(extraction_id, decisions jsonb, idempotency_key)`. Bloquea la fila, devuelve el resultado previo si ya estaba confirmada y crea los registros con las tablas y reglas existentes: afiliaciones N:N, `target_description` para destinos desconocidos y nada de personas de relleno.
- Agregar `introductions.status` y `tasks.confirmed` solo si no existen. Si existen, se reutilizan.
- Server functions en `src/lib/brain.functions.ts` con `requireSupabaseAuth`. Usan `@lovable.dev/ai-gateway` (modelo por defecto `openai/gpt-6-astra`, Responses) con salida JSON estructurada. El contexto se arma en el servidor solo con registros confirmados y vinculados al foco.
- UI: panel "Brain" reutilizable en las fichas, introducciones y conversaciones; página `/conversaciones/importar` con el flujo pegar → propuestas → revisión → confirmar.
- Pruebas (vitest y verificación contra el proveedor real):
  - Una nota con introducción y derivación genera las propuestas correctas.
  - Rechazar no altera lo ya confirmado.
  - Confirmar dos veces no duplica.
  - Una consulta posterior cita los datos aceptados y sus fuentes.
  - Un usuario de otro espacio no puede leer ni confirmar.
- Documentar en el cierre qué se probó contra el proveedor real y qué quedó pendiente.
