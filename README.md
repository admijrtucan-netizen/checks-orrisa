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

**Esto NO lo puede hacer Claude.** Requiere una cuenta con permisos de administrador sobre el proyecto de Google Cloud `bases-de-datos-sheets` y sobre este repo de GitHub — credenciales que Claude nunca debe recibir. Lo hace a mano quien ya tenga ambos accesos (hoy, Mario o Andrea). Sin esto, **toda corrida del workflow falla en el primer paso**, incluidas las automáticas de lunes/miércoles/viernes — no es un error de código, es que faltan estos cuatro pasos.

**Dónde correr los comandos:** [console.cloud.google.com](https://console.cloud.google.com) → ícono `>_` (Cloud Shell) arriba a la derecha, con la cuenta de Google que administra `bases-de-datos-sheets`. No hace falta instalar nada.

Bloque único, para pegar tal cual (crea el bucket, la cuenta de servicio, sus permisos y la llave; abre el login de GitHub y deja los dos secretos listos):

```bash
PROJECT=bases-de-datos-sheets; BUCKET=checks-orrisa; SA=checks-orrisa@$PROJECT.iam.gserviceaccount.com

gcloud storage buckets create gs://$BUCKET --project=$PROJECT --location=US --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=allUsers --role=roles/storage.objectViewer

gcloud iam service-accounts create checks-orrisa --project=$PROJECT
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/bigquery.jobUser
bq query --use_legacy_sql=false --project_id=$PROJECT "GRANT \`roles/bigquery.dataViewer\` ON SCHEMA \`$PROJECT.ASANA\` TO 'serviceAccount:$SA'"
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=serviceAccount:$SA --role=roles/storage.objectAdmin

gcloud iam service-accounts keys create llave.json --iam-account=$SA
gh auth login                                                            # navegador, GitHub.com, HTTPS
gh secret set GCP_SA_KEY --repo admijrtucan-netizen/checks-orrisa < llave.json
gh secret set CHECKS_WEBHOOK_URL --repo admijrtucan-netizen/checks-orrisa   # pide pegar la URL del webhook de n8n
rm llave.json
```

(Si `gh` no está instalado en Cloud Shell, `sudo apt-get install gh -y` primero, o crear los dos secretos a mano en Settings → Secrets and variables → Actions.)

**Verificar que quedó bien:** Actions → `CHECKS · actualizar tablero y alertas` → *Run workflow* con `modo = prueba`. Si el paso *Verificar que los secretos estén configurados* pasa en verde y el evento de prueba llega a n8n, ya está. Luego correr una vez con `modo = normal` (o `modo = todo` para recibir de una vez las alertas ya activas — la primera corrida en modo normal solo registra la línea base, sin enviar nada).

**La llave `llave.json` es una credencial.** Vive solo en esa terminal de Cloud Shell, nunca se pega en el chat de Claude ni se sube al repo — por eso el comando la borra al final.

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

## Errores esperados antes de la puesta en marcha

| Error en Actions | Causa | Solución |
|---|---|---|
| `Verificar que los secretos estén configurados` falla, o (en corridas de antes de este paso) `google-github-actions/auth failed with: the GitHub Action workflow must specify exactly one of "workload_identity_provider" or "credentials_json"` | Faltan `GCP_SA_KEY` y/o `CHECKS_WEBHOOK_URL` en Settings → Secrets and variables → Actions. | Sección **Puesta en marcha** de arriba. |
| `Consultar tareas de Asana en BigQuery` falla con `Access Denied` o `403` | La cuenta de servicio existe pero le falta el `GRANT` sobre `ASANA`, o la llave del secreto es de otra cuenta. | Repetir el bloque de `bq query ... GRANT ...` de la Puesta en marcha con la cuenta correcta. |
| `Publicar tablero` o `Guardar estado` fallan con `403`/`Forbidden` | Falta el rol `storage.objectAdmin` de la cuenta de servicio sobre el bucket. | Repetir el `add-iam-policy-binding` del bucket. |
| `Enviar alertas al webhook` falla o dice `CHECKS_WEBHOOK_URL no está configurado` | Falta o cambió el secreto `CHECKS_WEBHOOK_URL`. | `gh secret set CHECKS_WEBHOOK_URL --repo admijrtucan-netizen/checks-orrisa`. |

## Notas de operación

- GitHub **desactiva los workflows programados tras 60 días sin actividad** en el repo: si el tablero deja de actualizarse, reactivar en la pestaña Actions.
- Un fallo de la consulta, de los permisos o del envío al webhook **hace fallar** la corrida y GitHub avisa por correo; una consulta vacía aborta para no publicar un tablero en blanco.
