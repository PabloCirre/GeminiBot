#!/bin/bash
# GeminiBot Verification Suite

echo "🚀 Verificando integridad de GeminiBot v1.1.0..."

# 1. Estructura de activos
if [ -d "assets" ] && [ -f "assets/icon.png" ]; then
    echo "✅ Carpeta 'assets/' correcta."
else
    echo "❌ ERROR: No se encuentra 'assets/icon.png'."
fi

# 2. Habilidades Demo
if [ -f "skills/usability_framework.md" ]; then
    echo "✅ Habilidad 'usability_framework.md' presente."
else
    echo "❌ ERROR: Falta el archivo de habilidades demo."
fi

# 3. Documentación JSDoc
if grep -q "@param" renderer.js; then
    echo "✅ Documentación JSDoc detectada en renderer.js."
else
    echo "❌ ADVERTENCIA: No se detectó JSDoc en renderer.js."
fi

# 4. Dependencias
if [ -d "node_modules/electron" ]; then
    echo "✅ Dependencias de Electron instaladas."
else
    echo "❌ ERROR: Ejecuta 'npm install' primero."
fi

echo "---"
echo "✨ Verificación completada. Lanza la app con 'npm start' y pulsa el botón 'Initialize UX Demo'."
