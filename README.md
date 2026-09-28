# CHECKS · ORRISA

Tablero de **hitos de obra** de Orrisa: cada tarea del checklist queda ligada al hito que libera, y salta una **alarma** cuando un hito se cierra con algo anterior abierto. Las alarmas nuevas se mandan a un **webhook** (n8n).

Se publica en `https://storage.googleapis.com/checks-orrisa/checks.html`.

## Cómo funciona

```
Asana ──(sync)──► BigQuery  ASANA.tareas
                       │  checks/consulta.sql
                       ▼
              checks/checks_build.js ──► checks.html · checks-datos.json · checks-alertas.json · checks-estado.json
                       │
        ┌──────────────┼───────────────────────────┐
        ▼              ▼                           ▼
  bucket (público)   checks_enviar.js ──► webhook (n8n)      Issue "avisos de datos"
  checks.html        solo lo NUEVO / RESUELTO
  checks-datos.json  vs. checks-estado.json de la corrida anterior
```

Workflow: `.github/workflows/checks.yml`. Corre en tres casos:

| Disparador | Para qué |
|---|---|
| **Lunes, miércoles y viernes, 06:15 hora de Mérida** (`15 12 * * 1,3,5` UTC) | Actualización programada del tablero y envío de alertas. |
| A mano (Actions → Run workflow) | Con `modo`: `normal`, `todo` (reenvía todas las activas) o `prueba` (un evento de prueba). |

**Frescura de los datos.** El tablero solo es tan reciente como su última corrida (como máximo, 2 a 3 días de atraso). La tabla `ASANA.tareas` de BigQuery la sincroniza otro proceso, más seguido que eso; CHECKS solo lee lo que ya esté ahí. Para ver algo al momento, correr el workflow a mano.

## Puesta en marcha (una sola vez)

CHECKS lleva su **propio bucket y su propia cuenta de servicio**, con nombre de CHECKS.

1. **Bucket** público de solo lectura (`checks-orrisa`, o el que se quiera; en ese caso definir la variable de repo `CHECKS_BUCKET`):
   ```bash
   gcloud storage buckets create gs://checks-orrisa --project=bases-de-datos-sheets --location=US --uniform-bucket-level-access
   gcloud storage buckets add-iam-policy-binding gs://checks-orrisa --member=allUsers --role=roles/storage.objectViewer
   ```
2. **Cuenta de servicio** `checks-orrisa` con permisos mínimos:
   ```bash
   gcloud iam service-accounts create checks-orrisa --project=bases-de-datos-sheets
   SA=checks-orrisa@bases-de-datos-sheets.iam.gserviceaccount.com
   gcloud projects add-iam-policy-binding bases-de-datos-sheets --member=serviceAccount:$SA --role=roles/bigquery.jobUser
   bq query --use_legacy_sql=false --project_id=bases-de-datos-sheets "GRANT \`roles/bigquery.dataViewer\` ON SCHEMA \`bases-de-datos-sheets.ASANA\` TO 'serviceAccount:$SA'"
   gcloud storage buckets add-iam-policy-binding gs://checks-orrisa --member=serviceAccount:$SA --role=roles/storage.objectAdmin
   ```
3. **Secretos** del repo (Settings → Secrets and variables → Actions → Secrets):
   - `GCP_SA_KEY`: la llave JSON de esa cuenta (`gcloud iam service-accounts keys create llave.json --iam-account=$SA`).
   - `CHECKS_WEBHOOK_URL`: la URL del webhook de n8n. **Es un secreto: no va en el código, ni en Issues, ni en el README.**
4. Correr el workflow a mano con `modo = prueba` y confirmar en n8n que llega el evento.
5. Correr a mano con `modo = normal`. **La primera corrida solo registra la línea base y no envía nada** (para no inundar el canal). Si se quieren recibir de inmediato las alertas que ya están activas, correr una vez con `modo = todo`.

## Alertas que se envían

Solo se envía lo que **cambia** desde la corrida anterior: una alerta nueva se manda una vez; cuando se resuelve, se manda el aviso de resuelta. Si el envío falla, el estado no avanza y se reintenta en la siguiente corrida.

| Tipo | Severidad | Cuándo salta |
|---|---|---|
| `hito-sin-anteriores` | **crítica** si lo abierto incluye otro hito · **aviso** si son solo tareas | Un hito se cerró con tareas u hitos anteriores (de su misma línea) sin cerrar. **Es la alarma principal.** |
| `hito-atrasado` | aviso | Un hito abierto ya pasó su fecha de vencimiento. |
| `obra-estancada` | aviso | Una obra activa lleva **7 días o más** sin cerrar ninguna tarea ni hito. |
| `cierre-masivo` | info | **5 o más** tareas/hitos cerrados el mismo día en una obra (últimos 4 días): puede ser un cierre en bloque sin ejecución real. |
| `aviso-datos` | info | Una obra nueva, un código desconocido o una tarea sin equivalencia: el mapeo no supo interpretarla. |

Los umbrales están en `checks/alertas.js` (`UMBRAL`). Solo se alertan las **obras activas**.

### Formato del evento (JSON, `POST`)

```json
{
  "evento": "checks.alerta", "version": 1,
  "estado": "nueva",                       // nueva | resuelta | prueba
  "enviado": "2026-09-28T17:12:21Z", "corte": "2026-09-28", "tablero": "https://…/checks.html",
  "alerta": {
    "clave": "hito-sin-anteriores|gaeta-35|ON10-L",   // estable: sirve para deduplicar
    "tipo": "hito-sin-anteriores", "severidad": "critica",
    "obra": { "id": "gaeta-35", "nombre": "Gaeta 35" },
    "hito": { "codigo": "ON10-L", "nombre": "Castillos y columnas PB", "cerrada": "2026-09-09", "vence": "2026-09-07" },
    "abiertas": [ { "codigo": "ON7-L", "nombre": "Cadenas de cimentación", "esHito": true, "vence": null } ],
    "mensaje": "Gaeta 35: se cerró el hito ON10-L … con 2 hitos anteriores (…) sin cerrar."
  }
}
```

`mensaje` viene listo para reenviar tal cual (WhatsApp, correo, Asana…). Si una corrida trae más de 15 eventos, los últimos se resumen en un solo evento `checks.desborde`.

**Privacidad:** los eventos **no incluyen responsables ni nombres de personas**, solo obra, códigos, nombres de tarea y fechas.

## Por qué solo 3 veces por semana

Las alertas de este tablero son de seguimiento de obra (un hito cerrado sin lo anterior, atrasos, obras detenidas), no de emergencia, así que L-M-V es suficiente. Son ~12 corridas al mes, muy por debajo del límite gratuito de minutos de GitHub Actions. Si más adelante se quiere mayor frecuencia, basta cambiar el `cron` de `.github/workflows/checks.yml`.

## Qué NO se actualiza solo

- **La plantilla BASE** (orden de tareas y cuáles son hitos) sale de la sección `BASE` de *CHECKLIST'S DE OBRAS* en Asana. BigQuery no trae el tipo *milestone* ni la posición, así que está declarada en `checklist_lib.js`. Si alguien cambia esa plantilla en Asana, hay que actualizarla aquí.
- **Las líneas paralelas** (piscina, entregas finales) y la **equivalencia de la numeración vieja** (1–37 → `ON/OG/EF`) son provisionales, pendientes de confirmar con Orrisa.

## Avisos de datos

Además de mandarse al webhook como `aviso-datos`, se abre (o actualiza) el Issue `CHECKS: avisos de datos`, que se cierra solo al desaparecer. Para atenderlos, editar `checks/checklist_lib.js`: `OBRAS`, `BASE` o `CONOCIDAS_SIN_EQUIVALENCIA`.

## Privacidad del tablero

El tablero es público. **No incluye responsables** de las tareas. Sí incluye nombres de obras y fechas de cierre.

## Correr en local

```bash
node checks/checks_build.js tareas.json 2026-09-28 salida                      # tareas.json = salida de bq --format=json
DRY_RUN=1 MODO=todo node checks/checks_enviar.js salida/checks-alertas.json previo/estado.json salida/checks-datos.json   # ver los eventos sin enviar
```

Requiere Node 18+ (usa `fetch`). Sin dependencias.

## Notas de operación

- GitHub **desactiva los workflows programados tras 60 días sin actividad** en el repo: si el tablero deja de actualizarse, reactivar en la pestaña Actions.
- Un fallo de la consulta, de los permisos o del envío al webhook **hace fallar** la corrida y GitHub avisa por correo; una consulta vacía aborta para no publicar un tablero en blanco.
