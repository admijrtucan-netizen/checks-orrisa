# CHECKS · ORRISA

Tablero de **hitos de obra** de Orrisa: cada tarea del checklist queda ligada al hito que libera, y salta una **alarma** cuando un hito se cierra con algo anterior abierto.

Se publica en `https://storage.googleapis.com/checks-orrisa/checks.html` y se actualiza solo cada hora.

## Cómo funciona

```
Asana ──(sync)──► BigQuery  ASANA.tareas
                       │  checks/consulta.sql  (bq query)
                       ▼
              checks/checks_build.js ──► checks.html + checks-datos.json + checks-avisos.json
                       │
        gcloud storage cp ──► gs://checks-orrisa/    (público)
                       └────► Issue "CHECKS: avisos de datos" (si hay avisos)
```

Workflow: `.github/workflows/checks.yml` — cada hora (minuto 15 UTC) y a mano desde **Actions → Run workflow**.

## Puesta en marcha (una sola vez)

CHECKS lleva su **propio bucket y su propia cuenta de servicio**, con nombre de CHECKS, para que nada de su URL ni de sus permisos dependa de otros tableros.

1. **Crear el bucket** público de solo lectura (`checks-orrisa`, o el nombre que se quiera; en ese caso definir la variable de repo `CHECKS_BUCKET`):
   ```bash
   gcloud storage buckets create gs://checks-orrisa --project=bases-de-datos-sheets --location=US --uniform-bucket-level-access
   gcloud storage buckets add-iam-policy-binding gs://checks-orrisa --member=allUsers --role=roles/storage.objectViewer
   ```
2. **Crear la cuenta de servicio** `checks-orrisa` y darle permisos mínimos:
   ```bash
   gcloud iam service-accounts create checks-orrisa --project=bases-de-datos-sheets
   SA=checks-orrisa@bases-de-datos-sheets.iam.gserviceaccount.com
   gcloud projects add-iam-policy-binding bases-de-datos-sheets --member=serviceAccount:$SA --role=roles/bigquery.jobUser
   bq add-iam-policy-binding --member=serviceAccount:$SA --role=roles/bigquery.dataViewer bases-de-datos-sheets:ASANA
   gcloud storage buckets add-iam-policy-binding gs://checks-orrisa --member=serviceAccount:$SA --role=roles/storage.objectAdmin
   ```
3. **Secreto** `GCP_SA_KEY` (Settings → Secrets and variables → Actions): la llave JSON de esa cuenta (`gcloud iam service-accounts keys create llave.json --iam-account=$SA`).
4. Correr el workflow a mano una vez y revisar el resumen de la corrida.

## Avisos de datos

Si aparece una **obra nueva** (sección nueva en Asana), un **código `ON/OG/EF` que no existe** en la plantilla BASE, o una tarea **sin equivalencia**, el workflow abre (o actualiza) el Issue `CHECKS: avisos de datos`. El tablero se publica igual; el Issue se cierra solo cuando el aviso desaparece.

Para atenderlo, editar `checks/checklist_lib.js`: `OBRAS` (obras), `BASE` (plantilla) o `CONOCIDAS_SIN_EQUIVALENCIA` (extras aceptados).

## Qué NO se actualiza solo

- **La plantilla BASE** (orden de tareas y cuáles son hitos) sale de la sección `BASE` del proyecto *CHECKLIST'S DE OBRAS* en Asana. BigQuery no trae el tipo *milestone* ni la posición, así que está declarada en `checklist_lib.js`. Si alguien cambia esa plantilla en Asana, hay que actualizarla aquí.
- **Las líneas paralelas** (piscina, entregas finales) y la **equivalencia de la numeración vieja** (1–37 → `ON/OG/EF`) son provisionales, pendientes de confirmar con Orrisa.

## Privacidad

El tablero es público. **No incluye responsables** de las tareas. Sí incluye nombres de obras y fechas de cierre.

## Correr en local

```bash
node checks/checks_build.js tareas.json 2026-09-28 salida      # tareas.json = salida de bq --format=json
node checks/checks_prueba.js tareas.csv                         # resumen por obra
```

Requiere Node 18+. Sin dependencias.

## Notas de operación

- GitHub **desactiva los workflows programados tras 60 días sin actividad** en el repo: si el tablero deja de actualizarse, reactivar en la pestaña Actions.
- Un fallo de la consulta o de los permisos hace **fallar** la corrida y GitHub avisa por correo; una consulta vacía aborta para no publicar un tablero en blanco.
