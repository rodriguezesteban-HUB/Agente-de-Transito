# Agente-de-Transito — Demo de subida de multas (PDF)

Este repositorio contiene una plantilla mínima para permitir que un usuario suba su multa en PDF y que se procese mediante una función serverless (compatible con Vercel).

Contenido:
- `web/index.html` — interfaz ejecutiva y formal para subir PDF.
- `api/upload.js` — endpoint serverless que recibe el PDF en Base64 y lo guarda temporalmente.

Despliegue recomendado (Vercel):
1. Crear un repo llamado `Agente-de-Transito` en GitHub.
2. En tu máquina, añadir el remoto y empujar:

```bash
git remote add origin https://github.com/<tu-usuario>/Agente-de-Transito.git
git branch -M main
git push -u origin main
```

3. Conectar el repo en https://vercel.com/new y desplegar. Vercel detecta la ruta `/api` para funciones serverless.

Notas de seguridad:
- Este demo guarda archivos en `/tmp` en el servidor — no es persistente ni seguro para producción.
- Para producción usar almacenamiento en la nube (S3, Google Cloud Storage, etc.) y validación de PDFs.
