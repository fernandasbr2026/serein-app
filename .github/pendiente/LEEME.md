# Revisión automática (pendiente de activar)

El archivo `ci.yml` de esta carpeta corre lint, pruebas y compilación en cada PR.
GitHub no deja que Claude lo publique en `.github/workflows/` (su acceso no tiene el permiso `workflow`).

Para activarlo, Fernanda (desde GitHub, en el navegador):
1. Abrir el repo → carpeta `.github/pendiente/ci.yml` → botón «Edit» → cambiar la ruta del archivo a `.github/workflows/ci.yml` → «Commit changes».
2. Desde entonces cada PR muestra en verde o rojo si pasa lint + pruebas + build.
