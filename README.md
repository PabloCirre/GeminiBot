# GeminiBot (Antigravity Framework)

GeminiBot (previamente conocido como *Antigravity*) es una sofisticada aplicación de escritorio nativa para macOS basada en Electron. Se concibió como un cliente conversacional de Inteligencia Artificial alimentado por los modelos más punteros de Google (Gemini 1.5 Pro/Flash), pero ha evolucionado hasta convertirse en un **Framework de Automatización y Agentes Autónomos** capaz de leer y razonar sobre bases de código enteras de forma programada y desatendida.

---

## Características Principales

### 1. 🖥️ Arquitectura Nativa de Escritorio
- **Core:** Construido con Electron (`main.js` y `renderer.js`) y dependencias mínimas. No requiere de pesados frameworks frontend de React/Next.js; utiliza Vanilla JS y CSS nativo esculpido a mano.
- **UI Premium (Glassmorphism):** Diseño elegante de "cristal" translúcido adaptado estéticamente a los estándares de macOS con bordes redondeados, difuminado de fondo (`backdrop-filter`) y modos superpuestos.
- **Multi-Modelo Dinámico:** Autodetección de Modelos Inteligentes desde la API de Generative Language. Puedes intercambiar al vuelo entre variantes complejas (`gemini-1.5-pro`, ideal para auditorías enteras de código) y veloces (`gemini-1.5-flash`, para iteraciones rápidas).

### 2. 🔐 Flujo Seguro de OAuth 2.0 Local
GeminiBot abandona por completo las engorrosas CLI estáticas o el pegado manual de API Keys. Integra un sistema seguro de acceso:
- Emplea un servidor puente minúsculo en NodeJS dentro del propio proceso principal.
- Cuando se requiere Login, abre una ventana nativa de Chromium transparente que solicita permisos directos a tu cuenta de Google Cloud.
- Al otorgar permisos, el servidor local intercepta instantáneamente el **Token de Acceso** y el **Token de Refresco**, reescribiéndolos cifrados y silenciando el flujo en favor de la seguridad. Si el token caduca con los días, GeminiBot lo renueva sigilosamente y sigue trabajando.

### 3. 🧠 Inyección de Código Centralizada (Contextos Reales)
Antes de preguntar nada, GeminiBot puede actuar sobre *tu* propio proyecto. Con un simple sistema de directorios IPC de Electron (`dialog.showOpenDialog`), seleccionas la carpeta de tu código fuente. El bot recurre recursivamente la arborescencia saltándose automáticamente basuras inútiles (`node_modules`, `dist`, `.git`) y lo vuelca directamente estructurado bajo la etiqueta `# LOCAL PROJECT CONTEXT:` dentro del SysPrompt. Esto le da una clarividencia absoluta para debugear todo un repositorio al instante.

---

## 🤖 El Sistema de Agentes (Codex Autosostenible)
El verdadero poder de GeminiBot reside en el panel superior (🤖). Se ha acoplado un motor concurrente robusto apoyado en la librería Open Source `node-cron`. Dejar la aplicación abierta (incluso minimizada, ya que se anula deliberadamente el aburrimiento `backgroundThrottling` de Chromium) permite orquestar "Trabajadores":

*   **Creación Visual:** En cualquier momento puedes instanciar un Agente dándole un Nombre, un Horario, apuntándole a un Directorio Local y escribiendo sus Órdenes Personales.
*   **Agnosticismo UI:** La ejecución del agente ocurre fuera de tu ventana de chat humano. El sistema "despierta", procesa en background, contacta a Google e interroga tus archivos locales para, en apenas segundos devolver un voluminoso `AgentReport_Nombre_Timestamp.md` guardado orgánicamente bajo el directorio que supervisan.
*   **Visor Operativo Nativo:** Un solo clic en sus tarjetas rediseñadas abre el resultado generado directamente en tu editor de código preferido (TextEdit / VS code) apoyándose en la librería abstracta `shell.openPath` del sistema operativo.

### La Memoria Transaccional (`<AGENT_MEMORY>`)
Inspirado por ecosistemas masivos como *Codex*, nuestros Agentes no sufren de amnesia iterativa diaria. Una automatización diaria sería inútil si el lunes repara un archivo y el martes hace exactamente lo mismo porque no se acuerda que ya lo hizo.

*GeminiBot soluciona esto imponiendo un Bucle de Mente Constreñida:*
1. **Obligación de Registro:** Cada vez que el Agente hace su trabajo ciego en background, se le "obliga" silenciosamente a redactar un manual de progresos al final de sus pensamientos enmarcado en unas etiquetas estandarizadas ` <AGENT_MEMORY> Lo que hice y en qué bloque siguiente me toca fijarme </AGENT_MEMORY> `.
2. **Extracción y Persistencia de Disco:** Antes de entregar el historial o documento, el parseador de la App recorta esta sección y la inyecta cruda en un pequeño `.agent_memory_[Id].txt` oculto.
3. **Resurrección Inteligente:** 24h después, cuando vuelve a ser llamado para seguir con su tarea, GeminiBot localiza proactivamente ese rastro .txt, y antes de hacer ninguna API Call, se lo pega a la cabecera forzándola a razonar: *"Recuerda, ayer escribiste esto, sigue a partir de ahí"*.

Esto confiere la capacidad de que un solo Script iterativo pueda re-escribir, testear o auditar SEO metódicamente en proyectos del tamaño de repositorios enteros durante semanas sin que tú tengas que tocar un solo botón; un obrero autónomo 24/7.

---

## Instalación & Deploy (Multi-Plataforma)

Al estar construido sobre Electron de forma encapsulada y hacer uso exclusivo de `path.join` estandarizado, **GeminiBot es 100% compatible nativo tanto con macOS como con Microsoft Windows y distribuciones Linux.**

Requiere NodeJS configurado localmente.
1. Haz un clon del código fuente (`git clone https://github.com/PabloCirre/GeminiBot.git`)
2. Instala dependencias (`npm install electron node-cron electron-store`).
3. Lánzalo ejecutando (`npm start`). *Aparecerá una ventana autónoma que interactúa directamente sin marcos y en modo escritorio.*
